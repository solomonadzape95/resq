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
import { logSigVerdict, transcribeAudio, verifySignature } from "../services/elevenlabs.js";

export const voiceRouter = Router();

// ElevenLabs post-call webhook. Fires once per finished conversation
// (whether the call came from a real phone via Twilio or from the
// in-browser SDK). We only trust the transcript shape — everything else
// is optional metadata.
const transcriptBody = z.object({
  conversation_id: z.string(),
  agent_id: z.string().optional(),
  caller_id: z.string().nullish(),
  // transcript may be empty when the client browser couldn't run STT
  // (Safari/iOS, Firefox, etc). In that case the client uploads the raw
  // audio in `audio_base64` and we transcribe server-side.
  transcript: z
    .array(
      z.object({
        role: z.enum(["agent", "user", "system"]).catch("user"),
        message: z.string(),
      }),
    )
    .default([]),
  // Base64-encoded MediaRecorder blob from the simulator's VoicemailPanel,
  // used as a fallback when the client transcript is empty.
  audio_base64: z.string().optional(),
  audio_mime: z.string().optional(),
  // Optional device GPS from the simulator's VoicemailPanel. When present
  // the incident is pinned at the caller's actual position instead of the
  // demo jittered fallback.
  location_lat: z.number().optional(),
  location_lng: z.number().optional(),
  location_accuracy: z.number().nullish(),
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
  // Signature check has three accepted outcomes:
  //  - ok            : ElevenLabs server-to-server webhook, HMAC valid
  //  - missing_secret: dev mode, no ELEVENLABS_WEBHOOK_SECRET configured
  //  - missing_header: browser-direct POST from VoicemailPanel (no HMAC)
  // The browser path is trusted via CORS on /voice/* (origin allow-listed
  // in apps/api/src/index.ts). Anything else with a bad signature is rejected.
  const sigHeader = req.header("xi-signature") ?? req.header("elevenlabs-signature");
  const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body);
  const verdict = verifySignature(rawBody, sigHeader ?? undefined);
  logSigVerdict(verdict, req.body?.agent_id);
  const acceptable = verdict === "ok" || verdict === "missing_secret" || verdict === "missing_header";
  if (!acceptable) {
    return res.status(401).json({ error: "invalid_signature", verdict });
  }

  const parsed = transcriptBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body, err: parsed.error.flatten() }, "[voice] bad transcript body");
    return res.status(400).json(parsed.error.flatten());
  }
  const {
    conversation_id,
    caller_id,
    transcript,
    audio_base64,
    audio_mime,
    location_lat,
    location_lng,
  } = parsed.data;
  const hasDeviceGps = typeof location_lat === "number" && typeof location_lng === "number";

  let userSpeech = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.message.trim())
    .filter(Boolean)
    .join(" ");

  // STT fallback: if the browser didn't capture any speech (iOS Safari,
  // Firefox, denied perms, etc.) but the client uploaded the raw audio,
  // transcribe it server-side. Record the outcome so we can surface a
  // specific error to the client instead of a generic "no speech".
  let sttReason: string | null = null;
  let sttDetail: string | undefined;
  const audioBytes = audio_base64 ? Buffer.byteLength(audio_base64, "base64") : 0;

  if (!userSpeech && audio_base64) {
    const buf = Buffer.from(audio_base64, "base64");
    const result = await transcribeAudio(buf, audio_mime ?? "audio/webm");
    if (result.kind === "ok") {
      userSpeech = result.text;
      logger.info(
        { conversation_id, len: result.text.length },
        "[voice] STT fallback succeeded",
      );
    } else {
      sttReason = result.kind;
      if (result.kind === "failed") {
        sttDetail = result.message;
        logger.warn(
          { conversation_id, status: result.status, message: result.message },
          "[voice] STT fallback failed",
        );
      } else {
        logger.warn(
          { conversation_id, reason: result.kind, audioBytes },
          "[voice] STT fallback did not produce text",
        );
      }
    }
  } else if (!userSpeech && !audio_base64) {
    sttReason = "no_audio_uploaded";
  }

  if (!userSpeech) {
    const message =
      sttReason === "not_configured"
        ? "Server-side transcription isn't configured. Set ELEVENLABS_API_KEY on the API."
        : sttReason === "empty"
          ? "We couldn't hear any speech in the recording. Please try again in a quieter spot."
          : sttReason === "failed"
            ? `Transcription service errored${sttDetail ? `: ${sttDetail}` : "."}`
            : sttReason === "no_audio_uploaded"
              ? "No transcript or audio was uploaded — try hanging up after speaking."
              : "We couldn't hear any speech on this call. Please try again.";
    logger.warn(
      { conversation_id, sttReason, audioBytes },
      "[voice] rejecting transcript: no user speech",
    );
    return res.status(400).json({
      error: "no_speech_captured",
      reason: sttReason,
      audioBytes,
      message,
    });
  }

  // Try to attach to an existing open incident for this caller before
  // creating a new one — covers the USSD→callback→voicemail flow where
  // the USSD route created a shell row with no transcript yet. Critically,
  // we only attach when `transcriptFull` is still null: if the existing
  // incident already has a transcript, this is a *new* call about a
  // different problem and deserves its own incident row.
  const existing = caller_id
    ? await prisma.incident.findFirst({
        where: {
          callerPhone: caller_id,
          status: { in: ["new", "triaged"] },
          transcriptFull: null,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // Coordinate priority: device GPS from the caller > existing incident's
  // stored coords > jittered demo fallback. The jittered fallback is only
  // used when nothing else is available (e.g. real telco USSD without GPS).
  const fallback = hasDeviceGps
    ? { lat: location_lat as number, lng: location_lng as number }
    : existing
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
          // If the caller's device just produced a GPS fix, overwrite the
          // older USSD-fallback coords with the precise one.
          ...(hasDeviceGps
            ? {
                locationLat: fallback.lat,
                locationLng: fallback.lng,
                locationConfirmed: true,
              }
            : {}),
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
          locationConfirmed: hasDeviceGps,
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
        ...(hasDeviceGps
          ? {
              locationLat: fallback.lat,
              locationLng: fallback.lng,
              locationConfirmed: true,
            }
          : {}),
      });
      if (hasDeviceGps) {
        getIO().to(ROOM.incident(incident.id)).emit("incident:location_update", {
          id: incident.id,
          lat: fallback.lat,
          lng: fallback.lng,
          locationText: incident.locationText,
        });
      }
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
    const hasType = extracted.incident_type !== null;
    if (!extracted.location_text && !place && !hasType) return;

    // If we already have device-GPS coords on this incident
    // (locationConfirmed === true was set by the voicemail POST), trust
    // them. The AI extraction can wander to a wrong landmark and Nominatim
    // can geocode "the big mosque on Aba Road" to a different city. Only
    // ever upgrade jittered/USSD-fallback coords, never overwrite real GPS.
    const current = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { locationConfirmed: true, type: true },
    });
    const allowCoordOverwrite = !current?.locationConfirmed;
    // Only re-type when the AI returned a concrete type AND it differs from
    // the row's current one (avoids a no-op write + broadcast).
    const newType =
      hasType && extracted.incident_type !== current?.type
        ? extracted.incident_type
        : null;

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        aiExtractedLocation: extracted.location_text ?? undefined,
        locationText: extracted.location_text ?? undefined,
        ...(newType ? { type: newType } : {}),
        ...(place && allowCoordOverwrite
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
      ...(newType ? { type: newType } : {}),
      ...(place && allowCoordOverwrite
        ? {
            locationLat: place.lat,
            locationLng: place.lng,
            locationConfirmed: true,
          }
        : {}),
    });
    if (place && allowCoordOverwrite) {
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
        text: `[AI] Location: ${extracted.location_text}${
          place ? (allowCoordOverwrite ? " ✓" : " (kept device GPS)") : " (not geocoded)"
        }${newType ? ` · classified as ${newType}` : ""}`,
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
