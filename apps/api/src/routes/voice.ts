import { Router, type Request } from "express";
import { z } from "zod";
import { ROOM } from "@resq/shared/events";
import { prisma } from "../db/prisma.js";
import { getIO } from "../realtime/socket.js";
import { logger } from "../lib/logger.js";
import { jitteredFallback } from "../lib/fallbackLocation.js";
import { extractAndGeocode } from "../services/locationPipeline.js";
import { triageIncident } from "../services/openrouter.js";
import { findCandidateResponders } from "../services/matcher.js";
import { logSigVerdict, verifySignature } from "../services/elevenlabs.js";

export const voiceRouter = Router();

// ElevenLabs post-call webhook. Fires once per finished conversation
// (whether the call came from a real phone via Twilio or from the
// in-browser SDK). We only trust the transcript shape — everything else
// is optional metadata.
const transcriptBody = z.object({
  conversation_id: z.string(),
  agent_id: z.string().optional(),
  caller_id: z.string().nullish(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["agent", "user", "system"]).catch("user"),
        message: z.string(),
      }),
    )
    .min(1),
  metadata: z
    .object({
      call_duration_secs: z.number().optional(),
      ended_reason: z.string().optional(),
    })
    .partial()
    .optional(),
});

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

voiceRouter.post("/transcript", async (req: RequestWithRawBody, res) => {
  // Signature check — soft-fail in dev so curl smoke tests still work.
  const sigHeader = req.header("xi-signature") ?? req.header("elevenlabs-signature");
  const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body);
  const verdict = verifySignature(rawBody, sigHeader ?? undefined);
  logSigVerdict(verdict, req.body?.agent_id);
  if (verdict !== "ok" && verdict !== "missing_secret") {
    return res.status(401).json({ error: "invalid_signature", verdict });
  }

  const parsed = transcriptBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body, err: parsed.error.flatten() }, "[voice] bad transcript body");
    return res.status(400).json(parsed.error.flatten());
  }
  const { conversation_id, caller_id, transcript } = parsed.data;

  const userSpeech = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.message.trim())
    .filter(Boolean)
    .join(" ");

  if (!userSpeech) {
    logger.warn({ conversation_id }, "[voice] no user speech in transcript");
    return res.status(200).json({ ok: true, skipped: "no_user_speech" });
  }

  // Try to attach to an existing open incident for this caller before
  // creating a new one — covers the USSD→callback→voicemail flow where
  // the USSD route has already created the row.
  const existing = caller_id
    ? await prisma.incident.findFirst({
        where: {
          callerPhone: caller_id,
          status: { in: ["new", "triaged"] },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const fallback = existing
    ? {
        lat: existing.locationLat ?? jitteredFallback().lat,
        lng: existing.locationLng ?? jitteredFallback().lng,
      }
    : jitteredFallback();

  const incident = existing
    ? await prisma.incident.update({
        where: { id: existing.id },
        data: {
          transcriptFull:
            (existing.transcriptFull ? existing.transcriptFull + "\n" : "") +
            userSpeech,
        },
      })
    : await prisma.incident.create({
        data: {
          type: "medical",
          source: "voice",
          callerPhone: caller_id ?? null,
          status: "new",
          locationLat: fallback.lat,
          locationLng: fallback.lng,
          locationConfirmed: false,
          transcriptFull: userSpeech,
        },
      });

  // Tell the dashboard. New incidents broadcast incident:new; existing
  // ones broadcast incident:updated so the dashboard merges in place.
  try {
    if (existing) {
      getIO().to(ROOM.coordinator()).emit("incident:updated", {
        id: incident.id,
        transcriptFull: incident.transcriptFull,
      });
    } else {
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
    }
    // Push the full voicemail as a single transcript chunk so anyone
    // viewing the incident sees the caller's words even before the AI
    // location-extraction step lands.
    getIO().to(ROOM.coordinator()).emit("transcript:chunk", {
      incidentId: incident.id,
      text: userSpeech,
      timestamp: new Date().toISOString(),
    });
    getIO().to(ROOM.incident(incident.id)).emit("transcript:chunk", {
      incidentId: incident.id,
      text: userSpeech,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "[voice] socket emit failed (continuing)");
  }

  // Fire AI triage (only for fresh incidents — existing ones already
  // triaged via the USSD path), plus location pipeline + responder
  // matching for both. None block the webhook response.
  if (!existing) {
    void runTriage(incident.id, incident.type);
  }
  void runLocationPipeline(incident.id, incident.transcriptFull ?? userSpeech);
  void runResponderMatch(incident.id, incident.type, fallback);

  return res.status(existing ? 200 : 201).json({
    ok: true,
    incidentId: incident.id,
    attached: Boolean(existing),
  });
});

async function runTriage(incidentId: string, type: "medical" | "fire" | "crime" | "accident") {
  try {
    const available = await prisma.responder.count({
      where: { status: "available", verified: true },
    });
    const result = await triageIncident({
      type,
      timeOfDay: new Date().toISOString(),
      locationArea: null,
      availableResponders: available,
    });
    if (!result) return;
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        aiTriageScore: result.triage_score,
        aiSeverity: result.severity,
        aiPriorityReason: result.priority_reason,
        status: "triaged",
      },
    });
    getIO().to(ROOM.coordinator()).emit("incident:updated", {
      id: incidentId,
      aiTriageScore: result.triage_score,
      aiSeverity: result.severity,
      status: "triaged",
    });
  } catch (err) {
    logger.error({ err, incidentId }, "[voice] triage failed");
  }
}

async function runLocationPipeline(incidentId: string, transcript: string) {
  try {
    const { extracted, place } = await extractAndGeocode(transcript);
    if (!extracted.location_text && !place) return;

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        aiExtractedLocation: extracted.location_text ?? undefined,
        locationText: extracted.location_text ?? undefined,
        ...(place
          ? {
              locationLat: place.lat,
              locationLng: place.lng,
              locationConfirmed: true,
            }
          : {}),
      },
    });

    getIO().to(ROOM.coordinator()).emit("incident:updated", {
      id: incidentId,
      aiExtractedLocation: extracted.location_text ?? undefined,
      locationText: extracted.location_text ?? undefined,
      ...(place
        ? {
            locationLat: place.lat,
            locationLng: place.lng,
            locationConfirmed: true,
          }
        : {}),
    });
    if (place) {
      getIO().to(ROOM.incident(incidentId)).emit("incident:location_update", {
        id: incidentId,
        lat: place.lat,
        lng: place.lng,
        locationText: extracted.location_text ?? null,
      });
    }
    if (extracted.location_text) {
      getIO().to(ROOM.incident(incidentId)).emit("transcript:chunk", {
        incidentId,
        text: `[AI] Location: ${extracted.location_text}${place ? " ✓" : " (not geocoded)"}`,
        timestamp: new Date().toISOString(),
        extractedData: extracted as unknown as Record<string, unknown>,
      });
    }
  } catch (err) {
    logger.error({ err, incidentId }, "[voice] location pipeline failed");
  }
}

async function runResponderMatch(
  incidentId: string,
  type: "medical" | "fire" | "crime" | "accident",
  fallback: { lat: number; lng: number },
) {
  try {
    const candidates = await findCandidateResponders({
      type,
      lat: fallback.lat,
      lng: fallback.lng,
      limit: 5,
    });
    if (candidates.length === 0) {
      logger.warn({ incidentId, type }, "[voice] no candidate responders found");
      return;
    }
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return;

    for (const c of candidates) {
      await prisma.incidentResponder.upsert({
        where: {
          incidentId_responderId: {
            incidentId,
            responderId: c.responderId,
          },
        },
        create: {
          incidentId,
          responderId: c.responderId,
          status: "assigned",
        },
        update: {},
      });
      getIO().to(ROOM.responder(c.responderId)).emit("incident:new", {
        id: incident.id,
        createdAt: incident.createdAt.toISOString(),
        type: incident.type,
        status: "assigned",
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
    }
    logger.info({ incidentId, count: candidates.length }, "[voice] matched and notified responders");
  } catch (err) {
    logger.error({ err, incidentId }, "[voice] matcher failed");
  }
}
