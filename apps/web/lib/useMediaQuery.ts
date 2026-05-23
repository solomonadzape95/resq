"use client";

import { useEffect, useState } from "react";

// Thin React-state wrapper over window.matchMedia. SSR-safe (returns the
// `defaultValue` when there's no window), and re-renders whenever the
// match toggles. Used by the dashboard to swap between desktop and
// mobile-sheet layouts at the lg breakpoint.
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState<boolean>(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    // Use addEventListener where available (Safari <14 needs addListener,
    // but Next.js 14's baseline is Safari 14+, so we don't bother).
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
