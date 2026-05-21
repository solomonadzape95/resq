import { Router } from "express";
import { z } from "zod";
import { ROOM } from "@resq/shared/events";
import { prisma } from "../db/prisma.js";
import { getIO } from "../realtime/socket.js";
import { initiateCall } from "../services/africasTalking.js";
import { extractAndGeocode } from "../services/locationPipeline.js";
import { logger } from "../lib/logger.js";

export const callsRouter = Router();

const initiateBody = z.object({
  incidentId: z.string(),
  callerNumber: z.string(),
});

callsRouter.post("/initiate", async (req, res) => {
  const parsed = initiateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const call = await prisma.call.create({
    data: {
      incidentId: parsed.data.incidentId,
      callerNumber: parsed.data.callerNumber,
    },
  });
  try {
    await initiateCall(parsed.data.callerNumber);
  } catch (e) {
    logger.error({ e }, "[calls] AT call initiate failed");
  }
  return res.status(201).json(call);
});

// Webhook: AT Voice posts here with recording URL when call ends
const recordingBody = z.object({
  callId: z.string().optional(),
  incidentId: z.string().optional(),
  recordingUrl: z.string().url(),
  durationInSeconds: z.coerce.number().optional(),
});

callsRouter.post("/recording", async (req, res) => {
  const parsed = recordingBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body }, "[calls] bad recording body");
    return res.status(400).json(parsed.error.flatten());
  }
  const data = parsed.data;
  let call = null;
  if (data.callId) {
    call = await prisma.call.update({
      where: { id: data.callId },
      data: { recordingUrl: data.recordingUrl, endedAt: new Date() },
    });
  } else if (data.incidentId) {
    call = await prisma.call.create({
      data: {
        incidentId: data.incidentId,
        callerNumber: "unknown",
        recordingUrl: data.recordingUrl,
        endedAt: new Date(),
      },
    });
  }
  return res.json(call ?? { ok: true });
});

// Stub: post transcript chunk directly (used in demo flow)
const chunkBody = z.object({
  incidentId: z.string(),
  text: z.string(),
});

callsRouter.post("/transcribe", async (req, res) => {
  const parsed = chunkBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const { incidentId, text } = parsed.data;

  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { transcriptFull: true },
  });
  if (!existing) return res.status(404).json({ error: "not_found" });
  const newTranscript =
    (existing.transcriptFull ?? "") +
    (existing.transcriptFull ? "\n" : "") +
    text;
  await prisma.incident.update({
    where: { id: incidentId },
    data: { transcriptFull: newTranscript },
  });

  const ts = new Date().toISOString();
  getIO().to(ROOM.incident(incidentId)).emit("transcript:chunk", {
    incidentId,
    text,
    timestamp: ts,
  });
  getIO().to(ROOM.coordinator()).emit("transcript:chunk", {
    incidentId,
    text,
    timestamp: ts,
  });

  // Background: AI extracts location text, then we geocode it to lat/lng
  // so the map pin actually moves. Never blocks the response or crashes
  // the transcript flow.
  (async () => {
    try {
      const { extracted, place } = await extractAndGeocode(newTranscript);
      if (!extracted.location_text) return;

      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          aiExtractedLocation: extracted.location_text,
          locationText: extracted.location_text,
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
        aiExtractedLocation: extracted.location_text,
        locationText: extracted.location_text,
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
          locationText: extracted.location_text,
        });
      }
      getIO().to(ROOM.incident(incidentId)).emit("transcript:chunk", {
        incidentId,
        text: `[AI] Location: ${extracted.location_text}${
          place ? " ✓" : " (not geocoded)"
        }`,
        timestamp: new Date().toISOString(),
        extractedData: extracted as unknown as Record<string, unknown>,
      });
    } catch (err) {
      logger.error({ err }, "[calls] location extraction failed");
    }
  })();

  return res.json({ ok: true });
});

callsRouter.get("/:incidentId/transcript", async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.incidentId },
    select: { transcriptFull: true, aiExtractedLocation: true },
  });
  if (!incident) return res.status(404).json({ error: "not_found" });
  return res.json(incident);
});
