import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("2h"),
  REFRESH_EXPIRES_IN: z.string().default("14d"),
  AFRICAS_TALKING_API_KEY: z.string().optional(),
  AFRICAS_TALKING_USERNAME: z.string().default("sandbox"),
  AFRICAS_TALKING_SHORTCODE: z.string().optional(),
  AFRICAS_TALKING_USSD_CODE: z.string().default("*384#"),
  AFRICAS_TALKING_SENDER_ID: z.string().default("ResQ"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().default("anthropic/claude-3.5-sonnet"),
  OPENROUTER_WHISPER_MODEL: z.string().default("openai/whisper-large-v3"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  // Fallback coords for USSD incidents that arrive without GPS. Lets the
  // dashboard map render a pin immediately; the pin moves once AI extracts
  // a location from the transcript.
  DEMO_FALLBACK_LAT: z.coerce.number().default(4.8156),
  DEMO_FALLBACK_LNG: z.coerce.number().default(7.0498),
  DEMO_FALLBACK_JITTER_KM: z.coerce.number().default(0.5),
  // ElevenLabs Conversational AI — for the voice-call intake flow.
  // All optional in dev: missing values just disable signature verification
  // and outbound API calls; the /voice/transcript webhook still accepts
  // hand-crafted POSTs for local testing.
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
