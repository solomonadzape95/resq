"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident, IncidentStatus } from "@resq/shared/types";
import { STATUS_LABEL, STATUS_VISUAL, TYPE_COLOR, TYPE_LABEL, timeAgo } from "@/lib/incidents";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface AssignedResponder {
  id: string;
  status: string;
  etaMinutes: number | null;
  responder: { id: string; user: { name: string | null; phone: string } };
}

interface TranscriptLine {
  text: string;
  timestamp: string;
}

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
}: {
  incident: Incident;
  onClose: () => void;
  onUpdated: (patch: Partial<Incident> & { id: string }) => void;
}) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [assigned, setAssigned] = useState<AssignedResponder[]>([]);
  const [busy, setBusy] = useState(false);
  const [ringFeedback, setRingFeedback] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch responders alongside the incident so we can render the list.
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

  // Subscribe to live transcript chunks and refetch responders on accept.
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

  // Auto-scroll the transcript on new chunks.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, incident.transcriptFull]);

  const primaryResponderId = useMemo(
    () => assigned[0]?.responder?.id ?? null,
    [assigned],
  );

  const workflow = WORKFLOW[incident.status] ?? [];
  const closedLabel = CLOSED_LABEL[incident.status] ?? null;

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

  return (
    <aside className="flex h-full w-full max-w-md flex-col border-l-2 border-neutral-900 bg-neutral-950">
      <header className="flex items-center justify-between border-b-2 border-neutral-900 bg-black/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: TYPE_COLOR[incident.type] }}
          />
          <span className="font-semibold">{TYPE_LABEL[incident.type]}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_VISUAL[incident.status].badgeClass}`}
          >
            {STATUS_LABEL[incident.status]}
          </span>
          <span className="text-xs text-neutral-500">{timeAgo(incident.createdAt)}</span>
        </div>
        <button
          onClick={onClose}
          className="btn-press text-neutral-500 transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section className="border-l-2 border-l-neutral-800 pl-3">
          <h3 className="text-[10px] uppercase tracking-widest text-neutral-500">Caller</h3>
          <p className="mt-1 font-mono text-sm">{incident.callerPhone ?? "Unknown"}</p>
          <p className="text-xs text-neutral-500">
            via {incident.source} ·{" "}
            {incident.callerUserId ? "registered" : "unregistered"}
          </p>
        </section>

        <section className="border-l-2 border-l-neutral-800 pl-3">
          <h3 className="text-[10px] uppercase tracking-widest text-neutral-500">Location</h3>
          <p className="mt-1 text-sm text-neutral-200">
            {incident.locationText ?? "Pending — awaiting voicemail"}
          </p>
          {incident.locationLat != null && incident.locationLng != null ? (
            <p className="font-mono text-[11px] text-neutral-500">
              {incident.locationLat.toFixed(4)}, {incident.locationLng.toFixed(4)}
              {incident.locationConfirmed ? " ✓" : " (unconfirmed)"}
            </p>
          ) : null}
        </section>

        <section className="border-l-2 border-l-neutral-800 pl-3">
          <h3 className="text-[10px] uppercase tracking-widest text-neutral-500">
            Live transcript
          </h3>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-none border-2 border-neutral-900 bg-black/40 p-3 text-sm">
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
        </section>

        <section className="border-l-2 border-l-neutral-800 pl-3">
          <h3 className="text-[10px] uppercase tracking-widest text-neutral-500">
            Assigned responders ({assigned.length})
          </h3>
          {assigned.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-500">
              No matches yet — the matcher runs after a location lands.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {assigned.map((a) => (
                <li
                  key={a.id}
                  className="row-hover flex items-center justify-between border-2 border-neutral-900 bg-neutral-950 px-2 py-1.5"
                >
                  <span className="truncate">
                    {a.responder.user.name ?? a.responder.user.phone}
                  </span>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sticky action bar at the bottom: workflow + ring caller. */}
      <footer className="border-t-2 border-neutral-900 bg-black/40 p-4">
        {closedLabel ? (
          <div className="border-l-2 border-l-neutral-700 bg-neutral-950 px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
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
                    className="btn-press flex-1 border-2 border-resq-red bg-resq-red px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {w.label} →
                  </button>
                ))}
              <button
                onClick={ringCaller}
                disabled={!incident.callerPhone || busy}
                className="btn-press border-2 border-emerald-500/50 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
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
                      className="btn-press border-2 border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-700 hover:text-white disabled:opacity-50"
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
              <div className="animate-fade-up border-l-2 border-l-emerald-500 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-200">
                {ringFeedback}
              </div>
            ) : null}
          </div>
        )}
      </footer>
    </aside>
  );
}
