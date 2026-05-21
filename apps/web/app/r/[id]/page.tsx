"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { TYPE_COLOR, TYPE_LABEL, timeAgo } from "@/lib/incidents";
import type { Incident } from "@resq/shared/types";

type IncidentDetail = Incident & {
  responders: { id: string; status: string; etaMinutes: number | null }[];
};

interface TranscriptLine {
  text: string;
  timestamp: string;
}

export default function ResponderViewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // /r/<incident-id>?responder=<responder-id> — lets us POST status updates
  // as a specific responder. Defaults to the first seeded responder for the demo.
  const responderId = searchParams?.get("responder") ?? null;

  const incidentId = params?.id;
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [myStatus, setMyStatus] = useState<
    "pending" | "accepted" | "declined" | "en_route" | "on_scene" | "resolved"
  >("pending");
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
      // No responder context — fall back to local-only state (demo mode)
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
      <main className="flex min-h-screen items-center justify-center text-neutral-500">
        Loading incident…
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: TYPE_COLOR[incident.type] }}
          />
          <span className="font-semibold uppercase">{TYPE_LABEL[incident.type]}</span>
          <span className="ml-auto text-xs text-neutral-500">
            {timeAgo(incident.createdAt)}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-bold">Emergency Alert</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {incident.locationText ?? "Location pending — caller is being contacted"}
        </p>
        {incident.aiTriageScore != null ? (
          <div className="mt-3 inline-block rounded bg-neutral-900 px-2 py-1 text-xs">
            Triage {incident.aiTriageScore}/10 · {incident.aiSeverity}
          </div>
        ) : null}
        {!responderId ? (
          <p className="mt-3 text-xs text-yellow-400">
            Demo mode — no <code>?responder=&lt;id&gt;</code> in the URL, so
            Accept/Decline won't persist. Append your responder ID to use as a
            real responder.
          </p>
        ) : null}

        {myStatus === "pending" ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => postStatus("accepted")}
              disabled={posting}
              className="flex-1 rounded-md bg-resq-red px-4 py-3 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {posting ? "…" : "Accept"}
            </button>
            <button
              onClick={() => postStatus("declined")}
              disabled={posting}
              className="flex-1 rounded-md border border-neutral-800 px-4 py-3 text-base disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        ) : myStatus === "declined" ? (
          <div className="mt-4 rounded-md bg-neutral-900 px-3 py-2 text-sm text-neutral-400">
            You declined this incident.
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-md bg-green-900/40 px-3 py-2 text-sm text-green-200">
              ✓ Status: {myStatus.replace("_", " ")}
            </div>
            <div className="mt-2 flex gap-2 text-sm">
              {(
                ["en_route", "on_scene", "resolved"] as const
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => postStatus(s)}
                  disabled={posting || myStatus === s}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 capitalize disabled:opacity-50"
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500">
          Live notes from caller
        </h2>
        <div className="mt-2 space-y-2 text-sm">
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
      </div>

      <div className="mt-4 text-center text-xs text-neutral-600">
        Mobile-responsive demo view. Production runs as a React Native app.
      </div>
    </main>
  );
}
