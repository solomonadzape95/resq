"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Incident, ResponderStatus } from "@resq/shared/types";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { IncidentList } from "@/components/incident/IncidentList";
import { IncidentPanel } from "@/components/incident/IncidentPanel";
import type { ResponderPin } from "@/components/map/IncidentMap";
import { CITIES, findCity, isInCity, type CityBounds } from "@/lib/incidents";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useMediaQuery } from "@/lib/useMediaQuery";

const IncidentMap = dynamic(
  () => import("@/components/map/IncidentMap").then((m) => m.IncidentMap),
  { ssr: false },
);

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

type ShowFilter = "all" | "open" | "critical";

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<IncidentWithRels[]>([]);
  const [responders, setResponders] = useState<RawResponder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Tracks the most recent socket-pushed incident so the map can pan to it
  // even when nothing's been clicked. Cleared on select so manual selection
  // wins over auto-follow.
  const [lastNewIncidentId, setLastNewIncidentId] = useState<string | null>(null);
  const [showResponders, setShowResponders] = useState(true);
  const [connected, setConnected] = useState(false);
  const [cityId, setCityId] = useState<string | null>(null);
  const [cityLoaded, setCityLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState<ShowFilter>("all");
  // Below 1024px the sidebar collapses into a drawer that the user toggles
  // explicitly. Closed by default on mobile so the map gets the screen.
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Selecting an incident on mobile should close the drawer so the
  // bottom-sheet panel isn't competing with the list for screen space.
  useEffect(() => {
    if (isMobile && selectedId) setMobileSidebarOpen(false);
  }, [selectedId, isMobile]);

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
    setLastNewIncidentId(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CITY_STORAGE_KEY, id);
    }
  }, []);

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
        const survivors = prev.filter((p) => !fetchedIds.has(p.id));
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
      // Camera follow: latch onto the most recent incident so the map flies
      // to it. The IncidentMap effect runs only when this value changes —
      // re-arriving the same id (from a re-render) is a no-op.
      if (incident?.id) setLastNewIncidentId(incident.id as string);
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

  const cityIncidents = useMemo(
    () => incidents.filter((i) => isInCity(i.locationLat, i.locationLng, city)),
    [incidents, city],
  );
  const cityResponders = useMemo(
    () => responders.filter((r) => isInCity(r.currentLat, r.currentLng, city)),
    [responders, city],
  );

  // Search + show-filter only narrow the SIDEBAR list. The map still shows
  // every in-city incident so the coordinator never misses a pin because
  // of a stray search term.
  const filteredListIncidents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cityIncidents.filter((i) => {
      if (showFilter === "open") {
        if (
          i.status === "resolved" ||
          i.status === "cancelled" ||
          i.status === "false_alarm"
        ) {
          return false;
        }
      }
      if (showFilter === "critical") {
        if (i.aiSeverity !== "critical" && i.aiSeverity !== "high") return false;
      }
      if (!q) return true;
      const haystack = [
        i.callerPhone ?? "",
        i.locationText ?? "",
        i.type,
        i.aiSeverity ?? "",
        i.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cityIncidents, query, showFilter]);

  const selected = selectedId ? cityIncidents.find((i) => i.id === selectedId) : null;

  // Camera priority: if the user just selected something, fly to it. If
  // not, fall back to the most recently arrived incident.
  const focusedIncidentId = selectedId ?? lastNewIncidentId;

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
    <div className="flex h-screen flex-col bg-resq-dark text-neutral-100">
      <header className="flex h-12 items-center justify-between border-b border-neutral-900 bg-resq-panel/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="btn-press flex items-center gap-2 text-neutral-100 hover:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-resq-red text-sm shadow-md shadow-resq-red/30">
              🚨
            </span>
            <span className="text-sm font-semibold tracking-tight">ResQ Coordinator</span>
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
              className="btn-press surface-hover flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[11px] text-neutral-300 hover:border-resq-red/50 hover:text-white"
              title="Change coordinating city"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-resq-red" />
              <span className="font-medium">{city.label}</span>
              <span className="text-[9px] uppercase tracking-wider text-neutral-500">
                change
              </span>
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            tone={connected ? "emerald" : "neutral"}
            dot
            className={clsx(connected && "[&_span:first-child]:animate-pulse")}
          >
            {connected ? "Live" : "Offline"}
          </Badge>
          <Link
            href="/dashboard/admin"
            className="btn-press surface-hover rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 hover:border-neutral-700 hover:text-white"
            title="Seed / wipe / delete demo data"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        {/* Mobile-only toggle that reveals the sidebar drawer. Positioned
            top-left over the map; matches the visual language of the
            floating filter card on the right. */}
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            className="btn-press absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-200 shadow-lg backdrop-blur hover:border-resq-red/40"
            aria-expanded={mobileSidebarOpen}
            aria-controls="incidents-drawer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {mobileSidebarOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
            {mobileSidebarOpen ? "Close" : `Incidents · ${tally.open}`}
          </button>
        ) : null}
        <section
          id="incidents-drawer"
          className={clsx(
            "flex flex-shrink-0 flex-col bg-resq-panel transition-transform duration-200 ease-out",
            // Desktop docked sidebar
            "lg:w-[340px] lg:translate-x-0 lg:border-r lg:border-neutral-900 lg:relative",
            // Mobile slide-in drawer
            "absolute inset-y-0 left-0 z-10 w-[85vw] max-w-[360px] border-r border-neutral-900 shadow-2xl shadow-black/60",
            isMobile && !mobileSidebarOpen && "-translate-x-full lg:translate-x-0",
          )}
        >
          {/* Tally strip — moved from the top bar so the header stays slim. */}
          <div className="grid grid-cols-3 gap-2 px-3 py-3">
            <TallyCard label="Open" value={tally.open} tone="neutral" />
            <TallyCard label="Critical" value={tally.critical} tone="rose" />
            <TallyCard
              label="Responders"
              value={tally.availableResponders}
              tone="emerald"
            />
          </div>

          {/* Search */}
          <div className="px-3">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 transition focus-within:border-neutral-700">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-neutral-500"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search caller, location, type"
                className="w-full bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-neutral-500 hover:text-white"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-3 pt-2.5">
            <Tabs
              ariaLabel="Filter incidents"
              value={showFilter}
              onChange={setShowFilter}
              items={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "critical", label: "Critical" },
              ]}
            />
          </div>

          <div className="mt-2 flex-1 overflow-y-auto">
            <IncidentList
              incidents={filteredListIncidents}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id || null);
                // Manual selection wins — clear the auto-follow latch so
                // the map doesn't fight the user on the next socket tick.
                if (id) setLastNewIncidentId(null);
              }}
            />
          </div>
        </section>

        <section className="relative flex-1">
          <IncidentMap
            incidents={cityIncidents}
            responders={responderPins}
            showResponders={showResponders}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id || null)}
            focusedIncidentId={focusedIncidentId}
            centre={
              city
                ? { lat: city.centre[0], lng: city.centre[1], zoom: city.zoom }
                : undefined
            }
          />
          {/* Floating layer-filter card. */}
          <div className="animate-fade-up absolute left-3 top-3 z-10 rounded-2xl border border-neutral-800 bg-neutral-950/85 p-2.5 text-xs shadow-xl backdrop-blur">
            <label className="btn-press flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-neutral-900/60">
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
            <div className="mt-1.5 border-t border-neutral-800 px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest text-neutral-500">
              Legend
            </div>
            <ul className="space-y-1 px-2 pb-1">
              <LegendRow color="#dc2626" label="Medical" />
              <LegendRow color="#ea580c" label="Fire" />
              <LegendRow color="#2563eb" label="Crime" />
              <LegendRow color="#ca8a04" label="Accident" />
            </ul>
          </div>

          {/* Severity bubble: high/critical count, top-right of map. Only
              renders when there's something to draw attention to. */}
          {tally.critical + tally.high > 0 ? (
            <div className="animate-fade-up absolute right-3 top-3 z-10 flex items-center gap-2">
              {tally.critical > 0 ? (
                <Badge tone="rose" className="shadow-lg shadow-rose-900/40">
                  {tally.critical} Critical
                </Badge>
              ) : null}
              {tally.high > 0 ? (
                <Badge tone="amber" className="shadow-lg shadow-amber-900/40">
                  {tally.high} High
                </Badge>
              ) : null}
            </div>
          ) : null}
        </section>

        {selected ? (
          <IncidentPanel
            incident={selected}
            variant={isMobile ? "mobile-sheet" : "desktop"}
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

// ---- Tally / filter / city-picker primitives -------------------------------

function TallyCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "rose" | "emerald";
}) {
  // Tone only kicks in when there's something to flag — a "Critical 0"
  // shouldn't glow rose, that defeats the signal.
  const isActive = value > 0;
  const toneClass =
    isActive && tone === "rose"
      ? "text-rose-300"
      : isActive && tone === "emerald"
        ? "text-emerald-300"
        : "text-neutral-100";
  return (
    <div className="surface-hover rounded-xl border border-neutral-900 bg-neutral-900/40 px-3 py-2 hover:border-neutral-800">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </div>
      <div
        className={clsx(
          "mt-0.5 text-xl font-semibold leading-tight tabular-nums",
          toneClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

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
              className="btn-press group rounded-xl border border-neutral-900 bg-neutral-900/40 p-5 text-left transition hover:border-resq-red/40 hover:bg-neutral-900/70"
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
