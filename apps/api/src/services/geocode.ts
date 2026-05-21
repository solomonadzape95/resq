import { logger } from "../lib/logger.js";

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

// Free OpenStreetMap Nominatim geocoder. No API key. Usage policy asks for
// a descriptive User-Agent and <=1 req/s — fine for demo cadence. If we
// later want sub-100ms latency or higher throughput, swap for Google by
// reading GOOGLE_MAPS_API_KEY and hitting the Google geocoding API.
export async function geocode(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, Nigeria`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ng");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "ResQ-Demo/1.0 (contact@resq.ng)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, "[geocode] non-2xx");
      return null;
    }
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const top = data[0];
    const lat = Number(top.lat);
    const lng = Number(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, displayName: top.display_name };
  } catch (err) {
    logger.error({ err, query }, "[geocode] request failed");
    return null;
  }
}
