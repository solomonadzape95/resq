"use client";

import { useEffect, useState } from "react";
import { pingApi, type PingResult } from "./api";

// Polls the API's /healthz route on mount and every 30 s. Surfaces a
// stable shape the simulator can render an "API unreachable" banner from.
// Designed to be silent in success (no UI churn when ok stays true).
export function useApiStatus(intervalMs: number = 30_000) {
  const [status, setStatus] = useState<PingResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const result = await pingApi();
      if (!cancelled) setStatus(result);
    };

    void probe();
    const id = window.setInterval(probe, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
