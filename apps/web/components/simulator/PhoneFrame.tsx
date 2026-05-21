"use client";

import type { ReactNode } from "react";

export interface PhoneFrameProps {
  carrier: string;
  status: "idle" | "connecting" | "session" | "ended" | "error";
  children: ReactNode;
}

const STATUS_LABEL: Record<PhoneFrameProps["status"], string> = {
  idle: "Ready",
  connecting: "Connecting…",
  session: "In session",
  ended: "Call ended",
  error: "Error",
};

const STATUS_COLOR: Record<PhoneFrameProps["status"], string> = {
  idle: "bg-neutral-500",
  connecting: "bg-amber-500 animate-pulse",
  session: "bg-emerald-500 animate-pulse",
  ended: "bg-neutral-500",
  error: "bg-red-500",
};

export function PhoneFrame({ carrier, status, children }: PhoneFrameProps) {
  return (
    <div className="mx-auto w-[320px] border-2 border-neutral-700 bg-neutral-950 p-2 shadow-2xl">
      <div className="border-2 border-neutral-800 bg-neutral-900">
        <div className="flex items-center justify-between border-b-2 border-neutral-800 bg-black/40 px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
          <span>{carrier}</span>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[status]}`} />
            <span>{STATUS_LABEL[status]}</span>
          </div>
        </div>
        <div className="px-4 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}
