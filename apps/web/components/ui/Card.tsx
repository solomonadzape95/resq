import clsx from "clsx";
import type { ReactNode } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING_CLASS: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "px-4 py-3",
  lg: "p-5",
};

// Standard panel surface. `bg-neutral-900/40` over the resq-dark base
// gives the same lifted-card feel as the dashboard's TallyCard, without
// jumping to a separate palette. Use this anywhere the dashboard already
// has the pattern inline.
export function Card({
  children,
  padding = "md",
  className,
  as: As = "section",
  interactive = false,
}: {
  children: ReactNode;
  padding?: CardPadding;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  /** Opt-in hover treatment (border lift). Cards that aren't clickable
   *  should leave this false so nothing animates on cursor pass-by. */
  interactive?: boolean;
}) {
  return (
    <As
      className={clsx(
        "rounded-2xl border border-neutral-900 bg-neutral-900/40",
        PADDING_CLASS[padding],
        interactive && "surface-hover hover:border-neutral-800",
        className,
      )}
    >
      {children}
    </As>
  );
}

// Uppercase eyebrow label used at the top of card sections. Matches the
// dashboard's existing `text-[10px] uppercase tracking-widest` pattern,
// but centralised so the tracking value stays consistent.
export function CardLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={clsx(
        "text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500",
        className,
      )}
    >
      {children}
    </h3>
  );
}
