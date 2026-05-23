"use client";

import clsx from "clsx";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Optional count chip rendered after the label. */
  count?: number;
}

export type TabsSize = "sm" | "md";

const PADDING_CLASS: Record<TabsSize, string> = {
  sm: "px-2.5 py-1 text-[10px]",
  md: "px-3 py-1.5 text-[11px]",
};

// Segmented control. Renders a horizontal pill of buttons with a single
// red highlight that slides between them via inline left/width transitions
// (no framer-motion). Used for the dashboard's incident filter and the
// simulator's USSD/Call mode switcher.
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  items: TabItem<V>[];
  value: V;
  onChange: (next: V) => void;
  size?: TabsSize;
  className?: string;
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<V, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(
    null,
  );

  const measure = useCallback(() => {
    const trackEl = trackRef.current;
    const activeEl = tabRefs.current.get(value);
    if (!trackEl || !activeEl) return;
    const trackBox = trackEl.getBoundingClientRect();
    const activeBox = activeEl.getBoundingClientRect();
    setIndicator({
      left: activeBox.left - trackBox.left,
      width: activeBox.width,
    });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, items.length]);

  // Re-measure on resize so the highlight stays glued to its tab. Cheap —
  // a handful of getBoundingClientRect calls per resize tick.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "relative inline-flex items-center gap-0.5 rounded-full border border-neutral-900 bg-neutral-900/60 p-0.5",
        className,
      )}
    >
      {/* The single sliding highlight. Positioned absolutely; transitions
          its left/width when `value` changes. Opacity gates the initial
          frame so it doesn't flash at (0,0) before measurement. */}
      <span
        aria-hidden
        className={clsx(
          "absolute top-0.5 bottom-0.5 rounded-full bg-resq-red shadow-lg shadow-resq-red/25 transition-all duration-200 ease-out",
          indicator ? "opacity-100" : "opacity-0",
        )}
        style={{
          left: indicator?.left ?? 0,
          width: indicator?.width ?? 0,
        }}
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) tabRefs.current.set(item.value, el);
              else tabRefs.current.delete(item.value);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={clsx(
              "btn-press relative z-10 rounded-full font-semibold uppercase tracking-wider transition-colors",
              PADDING_CLASS[size],
              active ? "text-white" : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            <span className="flex items-center gap-1.5">
              {item.label}
              {typeof item.count === "number" ? (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-neutral-800/80 text-neutral-300",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
