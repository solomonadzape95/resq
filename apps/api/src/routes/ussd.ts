import { Router } from "express";
import { z } from "zod";
import { USSD_OPTION_TO_TYPE } from "@resq/shared/types";
import { ROOM } from "@resq/shared/events";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { sendSms } from "../services/africasTalking.js";
import { getIO } from "../realtime/socket.js";
import { triageIncident } from "../services/openrouter.js";
import { findCandidateResponders } from "../services/matcher.js";
import { jitteredFallback } from "../lib/fallbackLocation.js";

export const ussdRouter = Router();

const ussdBody = z.object({
  sessionId: z.string(),
  serviceCode: z.string(),
  phoneNumber: z.string(),
  networkCode: z.string().optional(),
  text: z.string().default(""),
});

const EMERGENCY_LABEL: Record<string, string> = {
  medical: "Medical emergency",
  fire: "Fire emergency",
  crime: "Crime / security incident",
  accident: "Road accident",
};

function welcomeMenu() {
  return [
    "CON ResQ Emergency Alert",
    "Choose emergency type:",
    "1. Medical",
    "2. Fire",
    "3. Crime / Security",
    "4. Road Accident",
  ].join("\n");
}

function borrowedPhonePrompt() {
  return [
    "CON ResQ Alert Sent.",
    "Is this your number?",
    "1. Yes",
    "2. No, calling for someone",
  ].join("\n");
}

function endConfirmation(typeLabel: string, registered: boolean) {
  const base = [
    "END ResQ Alert Sent.",
    `${typeLabel} reported.`,
    "We will call you back in",
    "a moment — stay on this line.",
  ];
  if (!registered) {
    base.push("Describe your location");
    base.push("when we ring.");
  }
  return base.join("\n");
}

ussdRouter.post("/", async (req, res) => {
  // Log arrival before anything that could throw — any future ngrok 3004
  // will be immediately distinguishable from "request never landed".
  logger.info({ body: req.body }, "[ussd] request received");

  // Wrap the whole handler so we ALWAYS return a valid CON/END to AT,
  // even if the DB or a downstream service throws. AT's session dies
  // if we 5xx, so a graceful END is much better than a crash.
  try {
    const parsed = ussdBody.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ body: req.body, error: parsed.error.flatten() }, "[ussd] bad body");
      return res.type("text/plain").send("END Invalid request.");
    }
    const { sessionId, serviceCode, phoneNumber, text } = parsed.data;
    const parts = text.split("*").filter(Boolean);
    logger.info({ sessionId, phoneNumber, text, parts }, "[ussd] incoming");

  await prisma.ussdSession.upsert({
    where: { sessionId },
    create: { sessionId, serviceCode, phoneNumber, text },
    update: { text },
  });

  // Step 0: show menu
  if (parts.length === 0) {
    return res.type("text/plain").send(welcomeMenu());
  }

  // Step 1: chose emergency type
  const choice = parts[0];
  const type = USSD_OPTION_TO_TYPE[choice];
  if (!type) {
    return res.type("text/plain").send("END Invalid option. Please dial again.");
  }

  // Lookup user
  const user = await prisma.user.findUnique({ where: { phone: phoneNumber } });
  const registered = Boolean(user);

  // Already created the incident on a previous step? Recover it.
  const existing = await prisma.ussdSession.findUnique({ where: { sessionId } });

  let incidentId = existing?.incidentId ?? null;
  if (!incidentId) {
    const fallback = jitteredFallback();
    const incident = await prisma.incident.create({
      data: {
        type,
        source: "ussd",
        callerPhone: phoneNumber,
        callerUserId: user?.id ?? null,
        status: "new",
        // Drop a placeholder pin at the demo origin so the dashboard
        // map shows the incident immediately. locationConfirmed stays
        // false — the pin will move once SMS landmark or AI extraction
        // refines it.
        locationLat: fallback.lat,
        locationLng: fallback.lng,
        locationConfirmed: false,
      },
    });
    incidentId = incident.id;
    await prisma.ussdSession.update({
      where: { sessionId },
      data: { incidentId },
    });

    // Ring the caller's simulator after a short pause so the demo feels
    // like a real dispatcher callback. The simulator subscribes to
    // ROOM.phone(phoneNumber) on mount and pops up the incoming-call UI.
    const ringIncidentId = incident.id;
    const ringType = incident.type;
    const ringPhone = phoneNumber;
    setTimeout(() => {
      try {
        getIO().to(ROOM.phone(ringPhone)).emit("call:incoming", {
          incidentId: ringIncidentId,
          type: ringType,
          callerName: "ResQ Coordinator",
        });
      } catch (e) {
        logger.error({ e }, "[ussd] callback ring emit failed");
      }
    }, 3000);

    // Broadcast incident to coordinator dashboard immediately
    try {
      getIO().to(ROOM.coordinator()).emit("incident:new", {
        id: incident.id,
        createdAt: incident.createdAt.toISOString(),
        type: incident.type,
        status: incident.status,
        callerPhone: incident.callerPhone,
        callerUserId: incident.callerUserId,
        source: incident.source,
        locationText: incident.locationText,
        locationLat: incident.locationLat,
        locationLng: incident.locationLng,
        locationConfirmed: incident.locationConfirmed,
        aiTriageScore: incident.aiTriageScore,
        aiSeverity: incident.aiSeverity,
        aiExtractedLocation: incident.aiExtractedLocation,
        transcriptFull: incident.transcriptFull,
        transcriptSummary: incident.transcriptSummary,
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      });
    } catch (e) {
      logger.error({ e }, "[ussd] socket emit failed (continuing)");
    }

    // Fire triage asynchronously — never block the USSD response
    const incidentForAi = incident;
    (async () => {
      try {
        const result = await triageIncident({
          type: incidentForAi.type,
          timeOfDay: new Date().toISOString(),
          locationArea: incidentForAi.locationText,
          availableResponders: await prisma.responder.count({
            where: { status: "available", verified: true },
          }),
        });
        if (!result) return;
        await prisma.incident.update({
          where: { id: incidentForAi.id },
          data: {
            aiTriageScore: result.triage_score,
            aiSeverity: result.severity,
            aiPriorityReason: result.priority_reason,
            status: "triaged",
          },
        });
        getIO().to(ROOM.coordinator()).emit("incident:updated", {
          id: incidentForAi.id,
          aiTriageScore: result.triage_score,
          aiSeverity: result.severity,
          status: "triaged",
        });
      } catch (err) {
        logger.error({ err }, "[ussd] triage failed");
      }
    })();

    // Fire SMS confirmation asynchronously
    (async () => {
      try {
        const label = EMERGENCY_LABEL[type];
        const msg = registered
          ? `RESQ: Alert received. ${label} logged. Responders being notified. Reply with your nearest landmark.`
          : `RESQ: Alert received. ${label} logged. Reply to this SMS with your nearest landmark or street so responders can find you.`;
        await sendSms(phoneNumber, msg);
      } catch (err) {
        logger.error({ err }, "[ussd] SMS failed");
      }
    })();

    // Auto-match nearby responders by skill and distance, then ring them in order.
    // Without this the responder app/web view never receives anything.
    const incidentForMatch = incident;
    (async () => {
      try {
        const candidates = await findCandidateResponders({
          type: incidentForMatch.type,
          lat: incidentForMatch.locationLat,
          lng: incidentForMatch.locationLng,
          limit: 5,
        });
        if (candidates.length === 0) {
          logger.warn(
            { incidentId: incidentForMatch.id, type: incidentForMatch.type },
            "[ussd] no candidate responders found",
          );
          return;
        }
        for (const c of candidates) {
          await prisma.incidentResponder.upsert({
            where: {
              incidentId_responderId: {
                incidentId: incidentForMatch.id,
                responderId: c.responderId,
              },
            },
            create: {
              incidentId: incidentForMatch.id,
              responderId: c.responderId,
              status: "assigned",
            },
            update: {},
          });
          // Push to the responder's private socket room — their /r/[id] view
          // listens for incident:new on this room.
          getIO()
            .to(ROOM.responder(c.responderId))
            .emit("incident:new", {
              id: incidentForMatch.id,
              createdAt: incidentForMatch.createdAt.toISOString(),
              type: incidentForMatch.type,
              status: "assigned",
              callerPhone: incidentForMatch.callerPhone,
              callerUserId: incidentForMatch.callerUserId,
              source: incidentForMatch.source,
              locationText: incidentForMatch.locationText,
              locationLat: incidentForMatch.locationLat,
              locationLng: incidentForMatch.locationLng,
              locationConfirmed: incidentForMatch.locationConfirmed,
              aiTriageScore: incidentForMatch.aiTriageScore,
              aiSeverity: incidentForMatch.aiSeverity,
              aiExtractedLocation: incidentForMatch.aiExtractedLocation,
              transcriptFull: incidentForMatch.transcriptFull,
              transcriptSummary: incidentForMatch.transcriptSummary,
              resolvedAt: incidentForMatch.resolvedAt?.toISOString() ?? null,
            });
        }
        logger.info(
          { incidentId: incidentForMatch.id, count: candidates.length },
          "[ussd] matched and notified responders",
        );
      } catch (err) {
        logger.error({ err }, "[ussd] matcher failed");
      }
    })();
  }

  // Step 1: borrowed-phone follow-up
  if (parts.length === 1) {
    return res.type("text/plain").send(borrowedPhonePrompt());
  }

  // Step 2: borrowed-phone answer
  const borrowed = parts[1] === "2";
  await prisma.ussdSession.update({
    where: { sessionId },
    data: { borrowed },
  });

    const typeLabel = EMERGENCY_LABEL[type] ?? "Emergency";
    return res.type("text/plain").send(endConfirmation(typeLabel, registered && !borrowed));
  } catch (err) {
    logger.error({ err }, "[ussd] handler crashed — returning graceful END");
    return res
      .type("text/plain")
      .send("END Sorry, something went wrong. Please try again.");
  }
});

// SMS reply webhook — caller texts back a landmark
const smsBody = z.object({
  from: z.string(),
  text: z.string(),
});

ussdRouter.post("/sms-reply", async (req, res) => {
  const parsed = smsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false });
  const { from, text } = parsed.data;

  // Find most recent active incident for this number
  const incident = await prisma.incident.findFirst({
    where: {
      callerPhone: from,
      status: { in: ["new", "triaged", "assigned", "active"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!incident) {
    logger.warn({ from }, "[sms-reply] no active incident");
    return res.json({ ok: true });
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { locationText: text, locationConfirmed: true },
  });

  try {
    getIO().to(ROOM.coordinator()).emit("incident:updated", {
      id: incident.id,
      locationText: text,
      locationConfirmed: true,
    });
    getIO().to(ROOM.incident(incident.id)).emit("incident:location_update", {
      id: incident.id,
      lat: incident.locationLat ?? 0,
      lng: incident.locationLng ?? 0,
      locationText: text,
    });
  } catch (e) {
    logger.error({ e }, "[sms-reply] emit failed");
  }

  return res.json({ ok: true });
});
