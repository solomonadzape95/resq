import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "red"
  | "amber"
  | "sky"
  | "emerald"
  | "rose"
  | "white";

export type BadgeSize = "sm" | "md";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-neutral-800/70 text-neutral-300 border-neutral-700/70",
  red: "bg-resq-red/15 text-red-200 border-resq-red/40",
  amber: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  sky: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  rose: "bg-rose-500/15 text-rose-200 border-rose-500/40",
  white: "bg-white text-neutral-900 border-white/0",
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[9px]",
  md: "px-2 py-0.5 text-[10px]",
};

// Single source of truth for all status / severity / mode pills in the app.
// Always uppercase, always tracking-wider, always rounded-full. Tone +
// size are the only knobs — pick them, get a consistent badge.
export function Badge({
  children,
  tone = "neutral",
  size = "md",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
  /** Optional coloured dot prefix (uses currentColor). */
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider whitespace-nowrap",
        TONE_CLASS[tone],
        SIZE_CLASS[size],
        className,
      )}
    >
      {dot ? (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
