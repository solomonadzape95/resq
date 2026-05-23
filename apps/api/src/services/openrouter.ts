import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  model?: string;
  temperature?: number;
  responseFormat?: "json" | "text";
};

const BASE_URL = "https://openrouter.ai/api/v1";

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    logger.warn("[OpenRouter] OPENROUTER_API_KEY missing — returning stub response");
    return opts.responseFormat === "json" ? "{}" : "";
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? env.OPENROUTER_DEFAULT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
  };

  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.PUBLIC_BASE_URL,
      "X-Title": "ResQ Emergency Platform",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, text }, "[OpenRouter] request failed");
    throw new Error(`OpenRouter ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export interface TriageResult {
  triage_score: number;
  severity: "low" | "medium" | "high" | "critical";
  recommended_responder_count: number;
  priority_reason: string;
}

export async function triageIncident(incidentSummary: {
  type: string;
  timeOfDay: string;
  locationArea?: string | null;
  availableResponders: number;
}): Promise<TriageResult | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  const prompt = `Incident type: ${incidentSummary.type}
Time of day: ${incidentSummary.timeOfDay}
Location area: ${incidentSummary.locationArea ?? "unknown"}
Available responders nearby: ${incidentSummary.availableResponders}`;

  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You are an emergency triage AI for Nigeria. Given incident data, return ONLY a JSON object with: triage_score (1-10), severity (low|medium|high|critical), recommended_responder_count (int), and priority_reason (one sentence). No preamble.",
      },
      { role: "user", content: prompt },
    ],
    { responseFormat: "json" },
  );

  try {
    return JSON.parse(raw) as TriageResult;
  } catch {
    return {
      triage_score: 5,
      severity: "medium",
      recommended_responder_count: 1,
      priority_reason: "AI parse fallback",
    };
  }
}

export type ExtractedIncidentType = "medical" | "fire" | "crime" | "accident" | null;

export interface ExtractedLocation {
  location_text: string | null;
  map_search_query: string | null;
  victim_details: string | null;
  urgency_signals: string[] | null;
  landmarks: string[] | null;
  // Inferred from the transcript only when clearly indicated by keywords
  // (e.g. "fire", "bleeding", "robbery", "car crash"). Null when ambiguous;
  // the caller's incident keeps its initial type rather than guessing wrong.
  incident_type: ExtractedIncidentType;
}

export async function extractLocation(transcript: string): Promise<ExtractedLocation> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You are an emergency dispatcher AI. Extract structured data from this call transcript. Return ONLY JSON with these fields: location_text (verbatim location description from caller), map_search_query (optimised Google Maps search string for Nigeria), victim_details (age, condition, number of people if mentioned), urgency_signals (any words indicating worsening condition), landmarks (array of mentioned landmarks), incident_type (one of \"medical\", \"fire\", \"crime\", \"accident\" — pick the single best match based on the caller's words; use null only if truly ambiguous). If a field is not mentioned, use null. No preamble.",
      },
      { role: "user", content: transcript },
    ],
    { responseFormat: "json" },
  );

  try {
    const parsed = JSON.parse(raw) as Partial<ExtractedLocation>;
    const type = parsed.incident_type;
    const validType: ExtractedIncidentType =
      type === "medical" || type === "fire" || type === "crime" || type === "accident"
        ? type
        : null;
    return {
      location_text: parsed.location_text ?? null,
      map_search_query: parsed.map_search_query ?? null,
      victim_details: parsed.victim_details ?? null,
      urgency_signals: parsed.urgency_signals ?? null,
      landmarks: parsed.landmarks ?? null,
      incident_type: validType,
    };
  } catch {
    return {
      location_text: null,
      map_search_query: null,
      victim_details: null,
      urgency_signals: null,
      landmarks: null,
      incident_type: null,
    };
  }
}
