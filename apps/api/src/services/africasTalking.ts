import { createRequire } from "node:module";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const require = createRequire(import.meta.url);

type AT = {
  SMS: {
    send: (opts: {
      to: string | string[];
      message: string;
      from?: string;
    }) => Promise<unknown>;
  };
  VOICE: {
    call: (opts: { callFrom: string; callTo: string | string[] }) => Promise<unknown>;
  };
};

let cached: AT | null = null;

function getClient(): AT | null {
  if (!env.AFRICAS_TALKING_API_KEY) return null;
  if (cached) return cached;
  const mod = require("africastalking");
  const factory = (mod && (mod.default ?? mod)) as (opts: {
    apiKey: string;
    username: string;
  }) => AT;
  cached = factory({
    apiKey: env.AFRICAS_TALKING_API_KEY,
    username: env.AFRICAS_TALKING_USERNAME,
  });
  return cached;
}

export async function sendSms(to: string, message: string) {
  const at = getClient();
  if (!at) {
    logger.warn({ to, message }, "[AT] sandbox key missing — SMS skipped (logged only)");
    return { skipped: true } as const;
  }
  try {
    const result = await at.SMS.send({
      to,
      message,
      from: env.AFRICAS_TALKING_SENDER_ID,
    });
    logger.info({ to }, "[AT] SMS sent");
    return result;
  } catch (error) {
    logger.error({ error, to }, "[AT] SMS failed");
    throw error;
  }
}

export async function initiateCall(toNumber: string) {
  const at = getClient();
  if (!at || !env.AFRICAS_TALKING_SHORTCODE) {
    logger.warn({ toNumber }, "[AT] call skipped — credentials/shortcode missing");
    return { skipped: true } as const;
  }
  try {
    const result = await at.VOICE.call({
      callFrom: env.AFRICAS_TALKING_SHORTCODE,
      callTo: toNumber,
    });
    logger.info({ toNumber }, "[AT] call initiated");
    return result;
  } catch (error) {
    logger.error({ error, toNumber }, "[AT] call failed");
    throw error;
  }
}
