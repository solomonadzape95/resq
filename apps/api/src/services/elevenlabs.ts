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
  if (verdict === "ok") return;
  if (verdict === "missing_secret") {
    logger.warn(
      { agentId },
      "[elevenlabs] webhook accepted without signature check (ELEVENLABS_WEBHOOK_SECRET unset)",
    );
    return;
  }
  logger.warn({ verdict, agentId }, "[elevenlabs] webhook signature did not pass");
}
