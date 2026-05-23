"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  SEVERITY_TONE,
  STATUS_TONE,
  TYPE_COLOR,
  TYPE_LABEL,
  timeAgo,
} from "@/lib/incidents";
import type { Incident } from "@resq/shared/types";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";

type IncidentDetail = Incident & {
  responders: { id: string; status: string; etaMinutes: number | null }[];
};

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

type MyStatus = "pending" | "accepted" | "declined" | "en_route" | "on_scene" | "resolved";

export default function ResponderViewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const responderId = searchParams?.get("responder") ?? null;

  const incidentId = params?.id;
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [myStatus, setMyStatus] = useState<MyStatus>("pending");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!incidentId) return;
    api<IncidentDetail>(`/alerts/${incidentId}`)
      .then(setIncident)
      .catch((e) => console.error(e));
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) return;
    const sock = getSocket();
    if (!sock) return;
    sock.emit("join:incident", incidentId);
    if (responderId) sock.emit("join:responder", responderId);

    const onChunk = (chunk: {
      incidentId: string;
      text: string;
      timestamp: string;
    }) => {
      if (chunk.incidentId !== incidentId) return;
      setTranscript((prev) => [...prev, { text: chunk.text, timestamp: chunk.timestamp }]);
    };
    const onUpdated = (patch: { id: string } & Partial<Incident>) => {
      if (patch.id !== incidentId) return;
      setIncident((prev) => (prev ? ({ ...prev, ...patch } as IncidentDetail) : prev));
    };
    sock.on("transcript:chunk", onChunk);
    sock.on("incident:updated", onUpdated);
    return () => {
      sock.off("transcript:chunk", onChunk);
      sock.off("incident:updated", onUpdated);
    };
  }, [incidentId, responderId]);

  async function postStatus(
    status: "accepted" | "declined" | "en_route" | "on_scene" | "resolved",
  ) {
    if (!incidentId) return;
    if (!responderId) {
      setMyStatus(status);
      return;
    }
    setPosting(true);
    try {
      await api(`/alerts/${incidentId}/respond`, {
        method: "POST",
        body: JSON.stringify({
          responderId,
          status,
          etaMinutes: status === "accepted" ? 7 : undefined,
        }),
      });
      setMyStatus(status);
    } catch (err) {
      console.error(err);
      alert("Failed to update status — check API logs");
    } finally {
      setPosting(false);
    }
  }

  if (!incident) {
    return (
      <main className="flex min-h-screen items-center justify-center text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Loading incident…
      </main>
    );
  }

  const typeColor = TYPE_COLOR[incident.type];

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-3 p-4">
      <Card padding="lg">
        <header className="flex items-start gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl shadow-md"
            style={{
              background: typeColor,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ filter: "saturate(1.2)" }}>{TYPE_EMOJI[incident.type]}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-lg font-bold text-white">
                {TYPE_LABEL[incident.type]}
              </h1>
              <Badge tone={STATUS_TONE[incident.status]} size="sm">
                {incident.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
              {timeAgo(incident.createdAt)}
            </p>
          </div>
        </header>

        <div className="mt-4 space-y-3">
          <div>
            <CardLabel>Location</CardLabel>
            <p className="mt-1 text-sm leading-snug text-neutral-200">
              {incident.locationText ?? "Pending — caller is being contacted."}
            </p>
          </div>

          {incident.aiTriageScore != null || incident.aiSeverity ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {incident.aiSeverity ? (
                <Badge tone={SEVERITY_TONE[incident.aiSeverity]} size="sm">
                  {incident.aiSeverity}
                </Badge>
              ) : null}
              {incident.aiTriageScore != null ? (
                <Badge size="sm">Triage {incident.aiTriageScore}/10</Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {!responderId ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] uppercase tracking-wider text-amber-200">
            Demo mode — append ?responder=… to persist accept/decline.
          </div>
        ) : null}

        {myStatus === "pending" ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => postStatus("accepted")}
              disabled={posting}
              className="btn-press rounded-xl bg-resq-red px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-resq-red/25 hover:bg-red-700 disabled:opacity-50"
            >
              {posting ? "…" : "Accept"}
            </button>
            <button
              onClick={() => postStatus("declined")}
              disabled={posting}
              className="btn-press rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-300 hover:border-neutral-700 hover:text-white disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        ) : myStatus === "declined" ? (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            You declined this incident.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Badge tone="emerald" size="md" dot>
              {myStatus.replace("_", " ")}
            </Badge>
            <div className="grid grid-cols-3 gap-2">
              {(["en_route", "on_scene", "resolved"] as const).map((s) => {
                const active = myStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => postStatus(s)}
                    disabled={posting || active}
                    className={clsx(
                      "btn-press rounded-xl px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition disabled:opacity-50",
                      active
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                        : "border border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700 hover:text-white",
                    )}
                  >
                    {s.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardLabel>Live notes from caller</CardLabel>
        <div className="mt-2 space-y-2 rounded-xl border border-neutral-900 bg-black/30 p-3 text-sm">
          {(incident.transcriptFull ?? "")
            .split("\n")
            .filter(Boolean)
            .map((line, i) => (
              <p key={`h${i}`} className="text-neutral-300">
                {line}
              </p>
            ))}
          {transcript.map((t, i) => (
            <p key={i} className="text-neutral-100">
              {t.text}
            </p>
          ))}
          {transcript.length === 0 && !incident.transcriptFull ? (
            <p className="text-neutral-600">Waiting for transcript updates…</p>
          ) : null}
        </div>
      </Card>

      <p className="px-2 pt-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
        Mobile demo view. Production runs as a React Native app.
      </p>
    </main>
  );
}
