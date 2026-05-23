import crypto from "node:crypto";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// ElevenLabs sends post-call webhooks with `xi-signature` formatted as
// `t=<unix-seconds>,v0=<hex-sha256>`. The signed payload is
// `<timestamp>.<raw body>`. Reference:
// https://elevenlabs.io/docs/conversational-ai/api-reference/post-call-webhook
//
// If ELEVENLABS_WEBHOOK_SECRET is missing we treat any request as valid
// (dev mode for curl smoke tests). Always log so it's obvious in prod.

export type SigVerdict = "ok" | "missing_secret" | "missing_header" | "bad_format" | "stale" | "mismatch";

const TOLERANCE_SECONDS = 30 * 60; // 30 minutes — generous; replay-attack risk is low for our threat model

export function verifySignature(rawBody: string, header: string | undefined): SigVerdict {
  if (!env.ELEVENLABS_WEBHOOK_SECRET) return "missing_secret";
  if (!header) return "missing_header";

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts.t;
  const sig = parts.v0;
  if (!ts || !sig) return "bad_format";

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return "bad_format";
  const ageSeconds = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSeconds > TOLERANCE_SECONDS) return "stale";

  const expected = crypto
    .createHmac("sha256", env.ELEVENLABS_WEBHOOK_SECRET)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return "mismatch";
  return crypto.timingSafeEqual(a, b) ? "ok" : "mismatch";
}

export function logSigVerdict(verdict: SigVerdict, agentId: string | undefined) {
  // ok            : matched HMAC, normal path
  // missing_header: browser-direct POST (VoicemailPanel) — normal path
  // missing_secret: dev mode without a webhook secret configured
  // others        : real failures, worth a warn
  if (verdict === "ok" || verdict === "missing_header") return;
  if (verdict === "missing_secret") {
    logger.debug(
      { agentId },
      "[elevenlabs] webhook accepted without signature check (ELEVENLABS_WEBHOOK_SECRET unset)",
    );
    return;
  }
  logger.warn({ verdict, agentId }, "[elevenlabs] webhook signature did not pass");
}

// Server-side speech-to-text via ElevenLabs Scribe. Used as a fallback when
// the browser's Web Speech API didn't produce a transcript (iOS Safari,
// Firefox, denied permissions, etc). The result tells the caller WHY a
// transcription didn't land so the API can return a specific reason to
// the client instead of the generic "no speech".
export type SttResult =
  | { kind: "ok"; text: string }
  | { kind: "not_configured" }
  | { kind: "empty" }
  | { kind: "failed"; status?: number; message?: string };

export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
): Promise<SttResult> {
  if (!env.ELEVENLABS_API_KEY) {
    logger.warn("[elevenlabs] STT skipped — ELEVENLABS_API_KEY missing");
    return { kind: "not_configured" };
  }
  // The web-app MediaRecorder typically produces audio/webm;codecs=opus,
  // but on some Safari builds it's audio/mp4. Either is accepted by Scribe.
  // We strip codec parameters because the multipart filename ext is what
  // Scribe inspects, not the Blob content-type header.
  const baseMime = mimeType.split(";")[0].trim() || "audio/webm";
  const ext = baseMime.includes("mp4")
    ? "mp4"
    : baseMime.includes("ogg")
      ? "ogg"
      : baseMime.includes("wav")
        ? "wav"
        : "webm";

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  // Cast through Uint8Array → Blob; node's Blob accepts ArrayBufferView.
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: baseMime }),
    `voicemail.${ext}`,
  );

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn(
        { status: res.status, text: text.slice(0, 300) },
        "[elevenlabs] STT non-2xx",
      );
      return {
        kind: "failed",
        status: res.status,
        message: text.slice(0, 200),
      };
    }
    const data = (await res.json()) as { text?: string };
    const trimmed = data.text?.trim() ?? "";
    if (trimmed.length === 0) {
      logger.info({ bytes: audio.length }, "[elevenlabs] STT returned empty text");
      return { kind: "empty" };
    }
    return { kind: "ok", text: trimmed };
  } catch (err) {
    logger.error({ err }, "[elevenlabs] STT request failed");
    return {
      kind: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
