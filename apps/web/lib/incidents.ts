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

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
