import type { IncidentStatus, IncidentType, Severity } from "@resq/shared/types";

export const TYPE_COLOR: Record<IncidentType, string> = {
  medical: "#dc2626",
  fire: "#ea580c",
  crime: "#2563eb",
  accident: "#ca8a04",
};

export const TYPE_LABEL: Record<IncidentType, string> = {
  medical: "Medical",
  fire: "Fire",
  crime: "Crime",
  accident: "Accident",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  new: "New",
  triaged: "Triaged",
  assigned: "Assigned",
  active: "Active",
  resolved: "Resolved",
  false_alarm: "False alarm",
  cancelled: "Cancelled",
};

// Visual treatment for the map marker. Status drives behaviour; type
// drives colour. `fadedTypeColor` is the closed-out look for resolved /
// cancelled / false_alarm incidents.
export interface StatusVisual {
  /** Animated pulsing outer ring (for `new`). */
  pulse: boolean;
  /** Static outer ring style. `none` = no ring. */
  ring: "none" | "dashed" | "double";
  /** Dim the marker (used for closed states). */
  dim: boolean;
  /** Glyph overlaid on the dot (✓ for resolved, × for cancelled/false). */
  glyph: "none" | "check" | "cross";
  /** Pill colour for the status badge in the popup card. */
  badgeClass: string;
}

export const STATUS_VISUAL: Record<IncidentStatus, StatusVisual> = {
  new: {
    pulse: true,
    ring: "none",
    dim: false,
    glyph: "none",
    badgeClass: "bg-rose-500/20 text-rose-200 border border-rose-500/40",
  },
  triaged: {
    pulse: false,
    ring: "none",
    dim: false,
    glyph: "none",
    badgeClass: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
  },
  assigned: {
    pulse: false,
    ring: "dashed",
    dim: false,
    glyph: "none",
    badgeClass: "bg-sky-500/20 text-sky-200 border border-sky-500/40",
  },
  active: {
    pulse: false,
    ring: "double",
    dim: false,
    glyph: "none",
    badgeClass: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
  },
  resolved: {
    pulse: false,
    ring: "none",
    dim: true,
    glyph: "check",
    badgeClass: "bg-neutral-800 text-neutral-300 border border-neutral-700",
  },
  false_alarm: {
    pulse: false,
    ring: "none",
    dim: true,
    glyph: "cross",
    badgeClass: "bg-neutral-800 text-neutral-400 border border-neutral-700",
  },
  cancelled: {
    pulse: false,
    ring: "none",
    dim: true,
    glyph: "cross",
    badgeClass: "bg-neutral-800 text-neutral-400 border border-neutral-700",
  },
};

// Bounding boxes for the three cities ResQ currently covers. Each city
// gets its own coordinator console; incidents and responders outside the
// box are filtered out so an LGA coordinator never sees out-of-area noise.
export interface CityBounds {
  id: string;
  label: string;
  lat: [number, number];
  lng: [number, number];
  centre: [number, number];
  zoom: number;
}

export const CITIES: CityBounds[] = [
  {
    id: "port-harcourt",
    label: "Port Harcourt",
    lat: [4.60, 5.00],
    lng: [6.85, 7.20],
    centre: [4.82, 7.04],
    zoom: 11,
  },
  {
    id: "lagos",
    label: "Lagos (Yaba / Mainland)",
    lat: [6.35, 6.70],
    lng: [3.15, 3.60],
    centre: [6.51, 3.38],
    zoom: 11,
  },
  {
    id: "nsukka",
    label: "Nsukka (UNN)",
    lat: [6.75, 6.95],
    lng: [7.30, 7.55],
    centre: [6.86, 7.40],
    zoom: 12,
  },
];

export const ALL_CITIES_ID = "all";

export function findCity(id: string): CityBounds | null {
  return CITIES.find((c) => c.id === id) ?? null;
}

export function isInCity(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: CityBounds | null,
): boolean {
  if (!city) return true;
  if (lat == null || lng == null) return false;
  return (
    lat >= city.lat[0] &&
    lat <= city.lat[1] &&
    lng >= city.lng[0] &&
    lng <= city.lng[1]
  );
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
