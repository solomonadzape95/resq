import { env } from "./env.js";

// Drop a placeholder pin near the demo origin (Port Harcourt centre by
// default) with a small random offset so two demo dials don't stack on
// top of each other. ~0.009° ≈ 1 km at the equator. Used whenever an
// incident is born without GPS (USSD dial, voice intake) so the
// dashboard map can render a pin immediately; the pin moves once the
// AI-extracted location geocodes to real coordinates.
export function jitteredFallback(): { lat: number; lng: number } {
  const r = env.DEMO_FALLBACK_JITTER_KM;
  const dLat = (Math.random() - 0.5) * 2 * (r / 111);
  const dLng = (Math.random() - 0.5) * 2 * (r / 111);
  return {
    lat: env.DEMO_FALLBACK_LAT + dLat,
    lng: env.DEMO_FALLBACK_LNG + dLng,
  };
}
