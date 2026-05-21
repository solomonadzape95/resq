"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useEffect, useMemo, useState } from "react";

type Phase =
  | { kind: "init" }
  | { kind: "requesting_mic" }
  | { kind: "recording" }
  | { kind: "ended" }
  | { kind: "error"; message: string };

export interface VoicemailPanelProps {
  phoneNumber: string;
  incidentId?: string;
  onClose: () => void;
}

// Wraps the ElevenLabs conversation provider so useConversation has the
// context it needs. The inner component owns the lifecycle.
export function VoicemailPanel(props: VoicemailPanelProps) {
  return (
    <ConversationProvider>
      <VoicemailInner {...props} />
    </ConversationProvider>
  );
}

function VoicemailInner({ phoneNumber, incidentId, onClose }: VoicemailPanelProps) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const [phase, setPhase] = useState<Phase>({ kind: "init" });

  const conversation = useConversation({
    onConnect: () => setPhase({ kind: "recording" }),
    onDisconnect: () => setPhase({ kind: "ended" }),
    onError: (err: unknown) =>
      setPhase({
        kind: "error",
        message:
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "Voicemail failed",
      }),
  });

  // Auto-start the session on mount so the caller doesn't have to press
  // a second button after picking up the incoming-call overlay.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!agentId) {
        setPhase({
          kind: "error",
          message: "Voicemail agent not configured (NEXT_PUBLIC_ELEVENLABS_AGENT_ID).",
        });
        return;
      }
      try {
        setPhase({ kind: "requesting_mic" });
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        await conversation.startSession({
          agentId,
          dynamicVariables: {
            caller_id: phoneNumber,
            ...(incidentId ? { incident_id: incidentId } : {}),
          },
        } as Parameters<typeof conversation.startSession>[0]);
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLive = phase.kind === "recording";

  const headline = useMemo(() => {
    switch (phase.kind) {
      case "init":
      case "requesting_mic":
        return "Connecting…";
      case "recording":
        return "Recording — speak now";
      case "ended":
        return "Voicemail sent ✓";
      case "error":
        return "Voicemail failed";
    }
  }, [phase.kind]);

  const subline = useMemo(() => {
    switch (phase.kind) {
      case "init":
        return "Setting up the line…";
      case "requesting_mic":
        return "Waiting for microphone permission";
      case "recording":
        return "Describe what is happening, where you are, and any victim details. Hang up when done.";
      case "ended":
        return "Coordinators have been notified. You can hang up now.";
      case "error":
        return phase.message;
    }
  }, [phase]);

  return (
    <div className="flex h-full flex-col rounded-sm border-2 border-emerald-500/40 bg-black/95 p-3 text-emerald-100">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-emerald-300/80">
        <span>ResQ Coordinator</span>
        <span>{isLive ? "● live" : phase.kind === "ended" ? "ended" : "…"}</span>
      </div>

      <div className="mt-3 flex flex-1 flex-col items-center justify-center text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${
            isLive
              ? "border-emerald-300 animate-pulse-ring"
              : phase.kind === "ended"
                ? "border-neutral-500"
                : "border-emerald-500/30"
          }`}
          style={{ background: isLive ? "rgba(16,185,129,0.15)" : "transparent" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
          </svg>
        </div>

        <div className="mt-3 text-sm font-semibold text-white">{headline}</div>
        <div className="mt-1 max-w-[200px] text-[11px] leading-snug text-emerald-200/80">
          {subline}
        </div>

        {isLive && conversation.message ? (
          <div className="mt-2 max-w-[200px] truncate text-[10px] text-emerald-200/60">
            “{conversation.message}”
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          try {
            conversation.endSession();
          } catch {
            /* onDisconnect will fire either way */
          }
          onClose();
        }}
        className="btn-press mt-3 flex h-12 w-full items-center justify-center border-2 border-red-500/50 bg-red-600 text-white"
        aria-label={isLive ? "Hang up" : "Close"}
      >
        {isLive ? "Hang up" : phase.kind === "ended" ? "Close" : "Cancel"}
      </button>
    </div>
  );
}
