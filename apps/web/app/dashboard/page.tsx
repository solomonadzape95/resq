"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Incident, ResponderStatus } from "@resq/shared/types";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { IncidentList } from "@/components/incident/IncidentList";
import { IncidentPanel } from "@/components/incident/IncidentPanel";
import type { ResponderPin } from "@/components/map/IncidentMap";

const IncidentMap = dynamic(
  () => import("@/components/map/IncidentMap").then((m) => m.IncidentMap),
  { ssr: false },
);

// The /alerts endpoint nests assigned responders inside each incident row.
interface IncidentResponderLink {
  responderId: string;
  status: string;
}
interface IncidentWithRels extends Incident {
  responders?: IncidentResponderLink[];
}

interface RawResponder {
  id: string;
  user: { name: string | null; phone: string };
  skills: string[];
  status: ResponderStatus;
  currentLat: number | null;
  currentLng: number | null;
}

const ACTIVE_LINK_STATUSES = new Set(["assigned", "accepted", "en_route", "on_scene"]);

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<IncidentWithRels[]>([]);
  const [responders, setResponders] = useState<RawResponder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResponders, setShowResponders] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<IncidentWithRels[]>("/alerts?active=true&limit=200")
      .then((rows) => {
        if (!mounted) return;
        const normalised = rows.map((r) => ({
          ...r,
          createdAt:
            typeof r.createdAt === "string"
              ? r.createdAt
              : new Date(r.createdAt as unknown as string).toISOString(),
          resolvedAt: r.resolvedAt
            ? typeof r.resolvedAt === "string"
              ? r.resolvedAt
              : new Date(r.resolvedAt as unknown as string).toISOString()
            : null,
        })) as IncidentWithRels[];
        setIncidents(normalised);
      })
      .catch((e) => console.error("[dashboard] /alerts failed", e));

    api<RawResponder[]>("/responders")
      .then((rows) => {
        if (!mounted) return;
        setResponders(rows);
      })
      .catch((e) => console.error("[dashboard] /responders failed", e));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));
    sock.emit("join:coordinator");
    setConnected(sock.connected);

    sock.on("incident:new", (incident) => {
      setIncidents((prev) => {
        if (prev.some((p) => p.id === incident.id)) return prev;
        return [incident as IncidentWithRels, ...prev];
      });
    });
    sock.on("incident:updated", (patch) => {
      setIncidents((prev) =>
        prev.map((p) => (p.id === patch.id ? ({ ...p, ...patch } as IncidentWithRels) : p)),
      );
    });
    sock.on("responder:status", (payload) => {
      setResponders((prev) =>
        prev.map((r) =>
          r.id === payload.responderId
            ? {
                ...r,
                status: payload.status as ResponderStatus,
                currentLat: payload.lat ?? r.currentLat,
                currentLng: payload.lng ?? r.currentLng,
              }
            : r,
        ),
      );
    });
    sock.on("responder:accepted", (payload) => {
      // When a responder accepts an incident, fold the linkage into the
      // local incident row so the match line appears immediately.
      setIncidents((prev) =>
        prev.map((p) =>
          p.id === payload.incidentId
            ? {
                ...p,
                responders: dedupeLink(p.responders ?? [], {
                  responderId: payload.responder.id,
                  status: "accepted",
                }),
              }
            : p,
        ),
      );
    });

    return () => {
      sock.off("incident:new");
      sock.off("incident:updated");
      sock.off("responder:status");
      sock.off("responder:accepted");
    };
  }, []);

  const selected = selectedId ? incidents.find((i) => i.id === selectedId) : null;

  // For each responder, compute the set of active incidents they're linked
  // to. Drives the assignment-line overlay.
  const responderPins: ResponderPin[] = useMemo(() => {
    const linksByResponder = new Map<string, string[]>();
    for (const inc of incidents) {
      for (const link of inc.responders ?? []) {
        if (!ACTIVE_LINK_STATUSES.has(link.status)) continue;
        const arr = linksByResponder.get(link.responderId) ?? [];
        arr.push(inc.id);
        linksByResponder.set(link.responderId, arr);
      }
    }
    return responders.map((r) => ({
      id: r.id,
      name: r.user.name ?? r.user.phone,
      phone: r.user.phone,
      status: r.status,
      skills: r.skills,
      currentLat: r.currentLat,
      currentLng: r.currentLng,
      incidentIds: linksByResponder.get(r.id) ?? [],
    }));
  }, [incidents, responders]);

  const tally = useMemo(() => {
    const open = incidents.filter(
      (i) => i.status !== "resolved" && i.status !== "cancelled" && i.status !== "false_alarm",
    );
    const availableResponders = responders.filter((r) => r.status === "available").length;
    return {
      open: open.length,
      critical: open.filter((i) => i.aiSeverity === "critical").length,
      high: open.filter((i) => i.aiSeverity === "high").length,
      availableResponders,
    };
  }, [incidents, responders]);

  return (
    <div className="flex h-screen flex-col bg-resq-dark">
      <header className="flex h-14 items-center justify-between border-b-2 border-neutral-900 bg-black/40 px-4">
        <Link href="/" className="btn-press flex items-center gap-2 text-neutral-100 hover:text-white">
          <span className="text-xl">🚨</span>
          <span className="font-semibold tracking-tight">ResQ Coordinator</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`flex items-center gap-2 border-2 px-2 py-0.5 ${
              connected
                ? "border-green-500/40 text-green-400"
                : "border-neutral-800 text-neutral-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-green-500 animate-pulse" : "bg-neutral-600"
              }`}
            />
            {connected ? "Live" : "Connecting…"}
          </span>
          <span className="border-2 border-neutral-800 px-2 py-0.5 text-neutral-400">
            <span className="font-semibold text-neutral-200">{tally.open}</span> open
          </span>
          {tally.critical > 0 ? (
            <span className="border-2 border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-rose-200">
              {tally.critical} critical
            </span>
          ) : null}
          {tally.high > 0 ? (
            <span className="border-2 border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-200">
              {tally.high} high
            </span>
          ) : null}
          <span className="border-2 border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-neutral-300">
            <span className="font-semibold text-emerald-300">{tally.availableResponders}</span>{" "}
            responders
          </span>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="w-80 flex-shrink-0 overflow-y-auto border-r-2 border-neutral-900">
          <div className="border-b-2 border-neutral-900 bg-black/40 px-4 py-3 text-[10px] uppercase tracking-widest text-neutral-500">
            Incidents
          </div>
          <IncidentList
            incidents={incidents}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
          />
        </section>

        <section className="relative flex-1">
          <IncidentMap
            incidents={incidents}
            responders={responderPins}
            showResponders={showResponders}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
          />
          {/* Floating layer-filter card. Sits over the map, top-left. */}
          <div className="animate-fade-up absolute left-3 top-3 z-10 border-2 border-neutral-800 bg-neutral-950/90 p-2 text-xs shadow-xl backdrop-blur">
            <label className="btn-press flex cursor-pointer items-center gap-2 border-l-2 border-l-emerald-500 px-2 py-1">
              <input
                type="checkbox"
                checked={showResponders}
                onChange={(e) => setShowResponders(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              <span className="flex items-center gap-1.5 text-neutral-200">
                <span
                  className="inline-block h-2.5 w-2.5"
                  style={{ background: "#22c55e", transform: "rotate(45deg)" }}
                />
                Responders ({responderPins.filter((r) => r.currentLat != null).length})
              </span>
            </label>
            <div className="mt-1 border-t-2 border-neutral-800 px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest text-neutral-500">
              Legend
            </div>
            <ul className="space-y-1 px-2 pb-1">
              <LegendRow color="#dc2626" label="Medical" />
              <LegendRow color="#ea580c" label="Fire" />
              <LegendRow color="#2563eb" label="Crime" />
              <LegendRow color="#ca8a04" label="Accident" />
            </ul>
          </div>
        </section>

        {selected ? (
          <IncidentPanel
            incident={selected}
            onClose={() => setSelectedId(null)}
            onUpdated={(patch) =>
              setIncidents((prev) =>
                prev.map((p) =>
                  p.id === patch.id ? ({ ...p, ...patch } as IncidentWithRels) : p,
                ),
              )
            }
          />
        ) : null}
      </main>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px] text-neutral-300">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </li>
  );
}

function dedupeLink(
  existing: IncidentResponderLink[],
  next: IncidentResponderLink,
): IncidentResponderLink[] {
  const others = existing.filter((l) => l.responderId !== next.responderId);
  return [...others, next];
}
