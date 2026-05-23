"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";

export interface PhoneFrameProps {
  carrier: string;
  status: "idle" | "connecting" | "session" | "ended" | "error";
  children: ReactNode;
}

const STATUS_LABEL: Record<PhoneFrameProps["status"], string> = {
  idle: "Ready",
  connecting: "Connecting",
  session: "In session",
  ended: "Call ended",
  error: "Error",
};

const STATUS_COLOR: Record<PhoneFrameProps["status"], string> = {
  idle: "bg-neutral-500",
  connecting: "bg-amber-400 animate-pulse",
  session: "bg-emerald-400 animate-pulse",
  ended: "bg-neutral-500",
  error: "bg-red-500",
};

export function PhoneFrame({ carrier, status, children }: PhoneFrameProps) {
  const [time, setTime] = useState<string>("");

  // Live clock at minute resolution. Keeps the faux status bar feeling
  // real without thrashing renders.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      setTime(`${h}:${m}`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div
        className={clsx(
          "relative rounded-[2.5rem] border border-neutral-800 bg-neutral-950 p-2.5",
          "shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(255,255,255,0.04)]",
        )}
      >
        <div className="overflow-hidden rounded-[2rem] bg-black ring-1 ring-white/5">
          {/* Faux status bar — time, carrier, signal/battery glyphs. */}
          <div className="flex items-center justify-between bg-black px-5 py-1.5 text-[10px] font-semibold tabular-nums text-neutral-200">
            <span>{time || "—:—"}</span>
            <div className="flex items-center gap-1.5 text-neutral-300">
              <SignalBars />
              <span className="text-[9px] font-bold uppercase tracking-wider">5G</span>
              <BatteryIcon />
            </div>
          </div>

          {/* App header — carrier + live status indicator. */}
          <div className="flex items-center justify-between border-b border-white/5 bg-neutral-950 px-5 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {carrier}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
              <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_COLOR[status])} />
              {STATUS_LABEL[status]}
            </div>
          </div>

          <div className="bg-neutral-950 px-4 pb-5 pt-4">{children}</div>
        </div>
        {/* Home-indicator bar at the bottom of the frame. */}
        <div className="mt-2 flex justify-center">
          <span className="h-1 w-24 rounded-full bg-neutral-700/80" />
        </div>
      </div>
    </div>
  );
}

function SignalBars() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
      <rect x="0" y="7" width="2" height="3" rx="0.5" fill="currentColor" />
      <rect x="3.5" y="5" width="2" height="5" rx="0.5" fill="currentColor" />
      <rect x="7" y="3" width="2" height="7" rx="0.5" fill="currentColor" />
      <rect x="10.5" y="1" width="2" height="9" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="18"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.6"
      />
      <rect x="19.5" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="2" y="2" width="13" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}
