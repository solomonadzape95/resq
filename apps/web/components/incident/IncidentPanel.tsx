"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident, IncidentStatus } from "@resq/shared/types";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_COLOR,
  TYPE_LABEL,
  etaMinutesFromKm,
  kmBetween,
  timeAgo,
} from "@/lib/incidents";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface AssignedResponder {
  id: string;
  status: string;
  etaMinutes: number | null;
  responder: {
    id: string;
    currentLat: number | null;
    currentLng: number | null;
    skills: string[];
    user: { name: string | null; phone: string };
  };
}

interface TranscriptLine {
  text: string;
  timestamp: string;
}

const TYPE_EMOJI: Record<Incident["type"], string> = {
  medical: "🩹",
  fire: "🔥",
  crime: "🚨",
  accident: "🚗",
};

// Maps the current status to the workflow action(s) a coordinator can
// take. Each entry has at most one primary action (advances the lifecycle)
// and at most one secondary (off-ramps the incident).
interface WorkflowAction {
  label: string;
  next: IncidentStatus;
  tone: "primary" | "secondary";
}
const WORKFLOW: Record<IncidentStatus, WorkflowAction[]> = {
  new: [
    { label: "Mark as triaged", next: "triaged", tone: "primary" },
    { label: "Cancel", next: "cancelled", tone: "secondary" },
  ],
  triaged: [
    { label: "Send responders", next: "active", tone: "primary" },
    { label: "False alarm", next: "false_alarm", tone: "secondary" },
  ],
  assigned: [
    { label: "Mark active", next: "active", tone: "primary" },
    { label: "Cancel", next: "cancelled", tone: "secondary" },
  ],
  active: [
    { label: "Mark resolved", next: "resolved", tone: "primary" },
    { label: "Cancel", next: "cancelled", tone: "secondary" },
  ],
  resolved: [],
  false_alarm: [],
  cancelled: [],
};

const CLOSED_LABEL: Partial<Record<IncidentStatus, string>> = {
  resolved: "Closed — resolved",
  false_alarm: "Closed — false alarm",
  cancelled: "Closed — cancelled",
};

export function IncidentPanel({
  incident,
  onClose,
  onUpdated,
  variant = "desktop",
}: {
  incident: Incident;
  onClose: () => void;
  onUpdated: (patch: Partial<Incident> & { id: string }) => void;
  /** Layout shell:
   *  - `desktop` → right-side dock at `max-w-md`
   *  - `mobile-sheet` → fixed bottom sheet covering ~85vh, rounded top */
  variant?: "desktop" | "mobile-sheet";
}) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [assigned, setAssigned] = useState<AssignedResponder[]>([]);
  const [busy, setBusy] = useState(false);
  const [ringFeedback, setRingFeedback] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    api<{ responders: AssignedResponder[] }>(`/alerts/${incident.id}`)
      .then((data) => {
        if (!mounted) return;
        setAssigned(data.responders ?? []);
      })
      .catch(() => {
        /* fresh incident; responders may not exist yet */
      });
    return () => {
      mounted = false;
    };
  }, [incident.id]);

  useEffect(() => {
    setTranscript([]);
    const sock = getSocket();
    if (!sock) return;
    sock.emit("join:incident", incident.id);

    const handler = (chunk: { incidentId: string; text: string; timestamp: string }) => {
      if (chunk.incidentId !== incident.id) return;
      setTranscript((prev) => [...prev, { text: chunk.text, timestamp: chunk.timestamp }]);
    };
    sock.on("transcript:chunk", handler);

    const onAccepted = (payload: { incidentId: string }) => {
      if (payload.incidentId !== incident.id) return;
      api<{ responders: AssignedResponder[] }>(`/alerts/${incident.id}`)
        .then((data) => setAssigned(data.responders ?? []))
        .catch(() => {});
    };
    sock.on("responder:accepted", onAccepted);

    return () => {
      sock.off("transcript:chunk", handler);
      sock.off("responder:accepted", onAccepted);
    };
  }, [incident.id]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, incident.transcriptFull]);

  const primaryResponderId = useMemo(
    () => assigned[0]?.responder?.id ?? null,
    [assigned],
  );

  const workflow = WORKFLOW[incident.status] ?? [];
  const closedLabel = CLOSED_LABEL[incident.status] ?? null;
  const typeColor = TYPE_COLOR[incident.type];

  async function advanceTo(next: IncidentStatus) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<Incident>(`/alerts/${incident.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      onUpdated({
        id: incident.id,
        status: updated.status,
        resolvedAt: updated.resolvedAt,
      });
    } finally {
      setBusy(false);
    }
  }

  async function ringCaller() {
    setRingFeedback(null);
    try {
      await api(`/alerts/${incident.id}/ring`, { method: "POST" });
      setRingFeedback("Ringing the caller…");
      window.setTimeout(() => setRingFeedback(null), 3500);
    } catch (e) {
      setRingFeedback(e instanceof Error ? e.message : "Ring failed");
    }
  }

  // Resolve distance + ETA per assigned responder. Prefer the responder
  // app's own ETA when supplied; otherwise estimate from straight-line
  // distance at 30 km/h. Returns null fields when coords aren't known.
  const responderMetrics = (a: AssignedResponder) => {
    const lat1 = incident.locationLat;
    const lng1 = incident.locationLng;
    const lat2 = a.responder.currentLat;
    const lng2 = a.responder.currentLng;
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
      return { distanceKm: null, etaMin: a.etaMinutes };
    }
    const distanceKm = kmBetween(lat1, lng1, lat2, lng2);
    const etaMin = a.etaMinutes ?? etaMinutesFromKm(distanceKm);
    return { distanceKm, etaMin };
  };

  const shellClass =
    variant === "mobile-sheet"
      ? "animate-fade-up fixed inset-x-0 bottom-0 z-30 flex h-[85vh] w-full flex-col rounded-t-3xl border-t border-neutral-800 bg-resq-panel shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.7)]"
      : "animate-fade-up flex h-full w-full max-w-md flex-col border-l border-neutral-900 bg-resq-panel";

  return (
    <aside className={shellClass}>
      {/* Drag-handle affordance on the mobile sheet — purely cosmetic; we
          don't wire drag-to-dismiss because the existing X button is fine. */}
      {variant === "mobile-sheet" ? (
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-neutral-700/80" />
        </div>
      ) : null}
      <header className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
            style={{
              background: typeColor,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ filter: "saturate(1.2)" }}>{TYPE_EMOJI[incident.type]}</span>
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                {TYPE_LABEL[incident.type]}
              </span>
              <Badge tone={STATUS_TONE[incident.status]} size="sm">
                {STATUS_LABEL[incident.status]}
              </Badge>
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
              {timeAgo(incident.createdAt)}
              {incident.aiTriageScore != null
                ? ` · triage ${incident.aiTriageScore}/10`
                : ""}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn-press flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-800 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Card>
          <CardLabel>Caller</CardLabel>
          <p className="mt-1 font-mono text-sm text-neutral-100">
            {incident.callerPhone ?? "Unknown"}
          </p>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-neutral-500">
            via {incident.source} ·{" "}
            {incident.callerUserId ? "registered" : "unregistered"}
          </p>
        </Card>

        <Card>
          <CardLabel>Location</CardLabel>
          <p className="mt-1 text-sm text-neutral-100">
            {incident.locationText ?? "Pending — awaiting voicemail"}
          </p>
          {incident.locationLat != null && incident.locationLng != null ? (
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-neutral-500">
              {incident.locationLat.toFixed(4)}, {incident.locationLng.toFixed(4)}
              {incident.locationConfirmed ? " ✓" : " (unconfirmed)"}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardLabel>Live transcript</CardLabel>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-neutral-900 bg-black/30 p-3 text-sm">
            {transcript.length === 0 && !incident.transcriptFull ? (
              <p className="text-neutral-600">
                No call yet. Use <em>Ring caller</em> to open the line.
              </p>
            ) : null}
            {(incident.transcriptFull ?? "")
              .split("\n")
              .filter(Boolean)
              .map((line, i) => (
                <p key={`hist-${i}`} className="text-neutral-300">
                  {line}
                </p>
              ))}
            {transcript.map((t, i) => (
              <p key={i} className="text-neutral-200">
                {t.text}
              </p>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardLabel>Assigned responders</CardLabel>
            <span className="text-[11px] tabular-nums text-neutral-500">
              {assigned.length}
            </span>
          </div>
          {assigned.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-500">
              No matches yet — the matcher runs after a location lands.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {assigned.map((a) => {
                const { distanceKm, etaMin } = responderMetrics(a);
                const name = a.responder.user.name ?? a.responder.user.phone;
                return (
                  <li
                    key={a.id}
                    className="surface-hover rounded-xl border border-neutral-900 bg-neutral-950/60 px-3 py-2 hover:border-neutral-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-neutral-100">{name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-neutral-500">
                          {distanceKm != null ? (
                            <span>{distanceKm.toFixed(1)} km</span>
                          ) : null}
                          {etaMin != null ? (
                            <>
                              {distanceKm != null ? <span>·</span> : null}
                              <span>~{etaMin}m</span>
                            </>
                          ) : null}
                          {a.responder.skills?.length > 0 ? (
                            <>
                              <span>·</span>
                              <span className="truncate normal-nums">
                                {a.responder.skills.slice(0, 2).join(", ")}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <Badge size="sm">{a.status}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <footer className="border-t border-neutral-900 bg-black/30 p-4">
        {closedLabel ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
            {closedLabel}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              {workflow
                .filter((w) => w.tone === "primary")
                .map((w) => (
                  <button
                    key={w.next}
                    onClick={() => advanceTo(w.next)}
                    disabled={busy}
                    className="btn-press flex-1 rounded-lg border border-resq-red bg-resq-red px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-resq-red/20 hover:bg-red-700 disabled:opacity-50"
                  >
                    {w.label} →
                  </button>
                ))}
              <button
                onClick={ringCaller}
                disabled={!incident.callerPhone || busy}
                className="btn-press rounded-lg border border-emerald-500/40 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Ring caller
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {workflow
                  .filter((w) => w.tone === "secondary")
                  .map((w) => (
                    <button
                      key={w.next}
                      onClick={() => advanceTo(w.next)}
                      disabled={busy}
                      className="btn-press rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-700 hover:text-white disabled:opacity-50"
                    >
                      {w.label}
                    </button>
                  ))}
              </div>
              <a
                href={
                  primaryResponderId
                    ? `/r/${incident.id}?responder=${primaryResponderId}`
                    : `/r/${incident.id}`
                }
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-500 underline-offset-2 hover:text-white hover:underline"
              >
                Responder view ↗
              </a>
            </div>
            {ringFeedback ? (
              <div className="animate-fade-up rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-200">
                {ringFeedback}
              </div>
            ) : null}
          </div>
        )}
      </footer>
    </aside>
  );
}

