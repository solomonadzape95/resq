"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Incident, ResponderStatus } from "@resq/shared/types";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { IncidentList } from "@/components/incident/IncidentList";
import { IncidentPanel } from "@/components/incident/IncidentPanel";
import type { ResponderPin } from "@/components/map/IncidentMap";
import { CITIES, findCity, isInCity, type CityBounds } from "@/lib/incidents";

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

const CITY_STORAGE_KEY = "resq.coordinator.cityId";

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<IncidentWithRels[]>([]);
  const [responders, setResponders] = useState<RawResponder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResponders, setShowResponders] = useState(true);
  const [connected, setConnected] = useState(false);
  // null = coordinator hasn't picked a city yet (gate shows).
  // string = city.id selected. Persisted to localStorage so reloads keep it.
  const [cityId, setCityId] = useState<string | null>(null);
  const [cityLoaded, setCityLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CITY_STORAGE_KEY);
    if (saved) setCityId(saved);
    setCityLoaded(true);
  }, []);

  const city: CityBounds | null = cityId ? findCity(cityId) : null;

  const pickCity = useCallback((id: string) => {
    setCityId(id);
    setSelectedId(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CITY_STORAGE_KEY, id);
    }
  }, []);

  // Single function so we can refetch on mount, on socket reconnect, and on
  // a periodic backstop. Merge semantics: rows from /alerts are authoritative
  // for ids they cover, but any incident already in local state that the
  // server didn't return (e.g. a fresh socket-pushed row mid-fetch) survives.
  const refetchIncidents = useCallback(async () => {
    try {
      const rows = await api<IncidentWithRels[]>("/alerts?active=true&limit=200");
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
      setIncidents((prev) => {
        const fetchedIds = new Set(normalised.map((r) => r.id));
        // Preserve incidents pushed via socket that the server didn't return
        // yet (race when fetch is in flight while a new incident is created).
        const survivors = prev.filter((p) => !fetchedIds.has(p.id));
        // Stable order: socket-only first (most recent), then server rows.
        return [...survivors, ...normalised];
      });
    } catch (e) {
      console.error("[dashboard] /alerts failed", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void refetchIncidents();

    api<RawResponder[]>("/responders")
      .then((rows) => {
        if (!mounted) return;
        setResponders(rows);
      })
      .catch((e) => console.error("[dashboard] /responders failed", e));

    // Periodic backstop: catch anything dropped by a flaky socket. Every
    // 10s, re-merge against the server. Cheap (200 rows max) and means the
    // sidebar never lies for more than that interval.
    const interval = window.setInterval(() => {
      if (mounted) void refetchIncidents();
    }, 10000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [refetchIncidents]);

  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    const onConnect = () => {
      setConnected(true);
      sock.emit("join:coordinator");
      // After a reconnect, the server may have created or updated incidents
      // we missed. Re-fetch to backfill before going back to live updates.
      void refetchIncidents();
    };
    sock.on("connect", onConnect);
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
      sock.off("connect", onConnect);
      sock.off("incident:new");
      sock.off("incident:updated");
      sock.off("responder:status");
      sock.off("responder:accepted");
    };
  }, [refetchIncidents]);

  // City filter: incidents and responders outside the selected city's
  // bounding box are dropped before anything else sees them, so the list,
  // map, tally, and match lines all see one consistent set of rows.
  const cityIncidents = useMemo(
    () => incidents.filter((i) => isInCity(i.locationLat, i.locationLng, city)),
    [incidents, city],
  );
  const cityResponders = useMemo(
    () => responders.filter((r) => isInCity(r.currentLat, r.currentLng, city)),
    [responders, city],
  );

  const selected = selectedId ? cityIncidents.find((i) => i.id === selectedId) : null;

  // For each responder, compute the set of active incidents they're linked
  // to. Drives the assignment-line overlay.
  const responderPins: ResponderPin[] = useMemo(() => {
    const cityIncidentIds = new Set(cityIncidents.map((i) => i.id));
    const linksByResponder = new Map<string, string[]>();
    for (const inc of cityIncidents) {
      for (const link of inc.responders ?? []) {
        if (!ACTIVE_LINK_STATUSES.has(link.status)) continue;
        const arr = linksByResponder.get(link.responderId) ?? [];
        arr.push(inc.id);
        linksByResponder.set(link.responderId, arr);
      }
    }
    return cityResponders.map((r) => ({
      id: r.id,
      name: r.user.name ?? r.user.phone,
      phone: r.user.phone,
      status: r.status,
      skills: r.skills,
      currentLat: r.currentLat,
      currentLng: r.currentLng,
      // Filter linkages to incidents we actually show in this city.
      incidentIds: (linksByResponder.get(r.id) ?? []).filter((id) => cityIncidentIds.has(id)),
    }));
  }, [cityIncidents, cityResponders]);

  const tally = useMemo(() => {
    const open = cityIncidents.filter(
      (i) => i.status !== "resolved" && i.status !== "cancelled" && i.status !== "false_alarm",
    );
    const availableResponders = cityResponders.filter((r) => r.status === "available").length;
    return {
      open: open.length,
      critical: open.filter((i) => i.aiSeverity === "critical").length,
      high: open.filter((i) => i.aiSeverity === "high").length,
      availableResponders,
    };
  }, [cityIncidents, cityResponders]);

  // City gate: until the coordinator picks an LGA, show a chooser screen.
  if (cityLoaded && !city) {
    return <CityPicker onPick={pickCity} />;
  }
  if (!cityLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-resq-dark text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-resq-dark">
      <header className="flex h-14 items-center justify-between border-b-2 border-neutral-900 bg-black/40 px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="btn-press flex items-center gap-2 text-neutral-100 hover:text-white">
            <span className="text-xl">🚨</span>
            <span className="font-semibold tracking-tight">ResQ Coordinator</span>
          </Link>
          {city ? (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(CITY_STORAGE_KEY);
                }
                setCityId(null);
              }}
              className="btn-press flex items-center gap-2 border-2 border-neutral-800 px-3 py-1 text-xs uppercase tracking-widest text-neutral-300 hover:border-resq-red hover:text-white"
              title="Change coordinating city"
            >
              <span className="h-2 w-2 rounded-full bg-resq-red" />
              {city.label}
              <span className="text-neutral-500">change</span>
            </button>
          ) : null}
        </div>
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
            incidents={cityIncidents}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
          />
        </section>

        <section className="relative flex-1">
          <IncidentMap
            incidents={cityIncidents}
            responders={responderPins}
            showResponders={showResponders}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
            centre={
              city
                ? { lat: city.centre[0], lng: city.centre[1], zoom: city.zoom }
                : undefined
            }
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

// Gate shown the first time a coordinator opens /dashboard, or after they
// hit "change" in the header. Selection is persisted to localStorage so a
// PH coordinator and a Lagos coordinator each keep their own view.
function CityPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-resq-dark px-6 py-16">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🚨</span>
          <span className="text-xl font-semibold tracking-tight text-white">ResQ Coordinator</span>
        </div>
        <p className="mt-8 text-xs uppercase tracking-widest text-resq-red">Coordinator console</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-white md:text-4xl">
          Choose the city you&apos;re coordinating.
        </h1>
        <p className="mt-3 max-w-2xl text-neutral-400">
          Every incident, every responder, every match line in this console is
          scoped to one LGA. Pick yours so callers from elsewhere are routed to
          the right desk, not yours.
        </p>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {CITIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className="btn-press group border-l-4 border-2 border-neutral-900 border-l-resq-red bg-neutral-950 p-5 text-left transition hover:border-neutral-700 hover:border-l-resq-red"
            >
              <div className="text-[10px] uppercase tracking-widest text-resq-red">
                {c.id.replace("-", " ")}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">{c.label}</div>
              <div className="mt-2 font-mono text-[11px] text-neutral-500">
                {c.lat[0].toFixed(2)}–{c.lat[1].toFixed(2)}°N · {c.lng[0].toFixed(2)}–
                {c.lng[1].toFixed(2)}°E
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-400 group-hover:text-white">
                Coordinate this city →
              </div>
            </button>
          ))}
        </div>

        <p className="mt-8 text-xs text-neutral-500">
          You can change this at any time from the header.
        </p>
      </div>
    </main>
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
