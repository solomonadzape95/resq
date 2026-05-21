import { extractLocation, type ExtractedLocation } from "./openrouter.js";
import { geocode, type GeocodeResult } from "./geocode.js";

export interface PipelineResult {
  extracted: ExtractedLocation;
  place: GeocodeResult | null;
}

// Two-step pipeline shared by /calls/transcribe and /voice/transcript:
//   1. Ask the AI to pull a free-text location out of the transcript.
//   2. Geocode that text to lat/lng via Nominatim.
// Either step can fail independently — callers decide what to persist /
// broadcast based on which fields are populated.
export async function extractAndGeocode(transcript: string): Promise<PipelineResult> {
  const extracted = await extractLocation(transcript);
  const query = extracted.map_search_query ?? extracted.location_text;
  const place = query ? await geocode(query) : null;
  return { extracted, place };
}
