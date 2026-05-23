"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { Incident } from "@resq/shared/types";
import {
  STATUS_LABEL,
  STATUS_TONE,
  STATUS_VISUAL,
  TYPE_COLOR,
  TYPE_LABEL,
  timeAgo,
} from "@/lib/incidents";
import { Badge } from "@/components/ui/Badge";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const DEFAULT_CENTRE = { lat: 4.8156, lng: 7.0498, zoom: 11 };

// Responders we render on the map. The dashboard fetches `/responders`
// and passes them here.
export interface ResponderPin {
  id: string;
  name: string;
  phone: string;
  status: "available" | "busy" | "off_duty";
  skills: string[];
  currentLat: number | null;
  currentLng: number | null;
  /** Incident IDs this responder is currently linked to (any non-resolved
   *  IncidentResponder row). Drives the assignment-line overlay. */
  incidentIds: string[];
}

export interface IncidentMapProps {
  incidents: Incident[];
  responders: ResponderPin[];
  showResponders: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Initial view centre and zoom. Used when the dashboard tells the map
   *  which city is being coordinated so it doesn't default to Port Harcourt
   *  every time. Falls back to PH centre when omitted. */
  centre?: { lat: number; lng: number; zoom: number };
  /** When set, the camera flies to this incident's coords on every change.
   *  Coordinator workflow: a newly arrived incident or a newly selected row
   *  pans the camera so the operator never has to hunt for the pin. */
  focusedIncidentId?: string | null;
}

export function IncidentMap({
  incidents,
  responders,
  showResponders,
  selectedId,
  onSelect,
  centre,
  focusedIncidentId,
}: IncidentMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [responderPopupId, setResponderPopupId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const fittedRef = useRef(false);

  const placed = useMemo(
    () => incidents.filter((i) => i.locationLat != null && i.locationLng != null),
    [incidents],
  );

  const placedResponders = useMemo(
    () =>
      responders.filter((r) => r.currentLat != null && r.currentLng != null),
    [responders],
  );

  // GeoJSON LineStrings connecting every (responder → incident) pair where
  // both endpoints are placed AND the incident is selected or always-on.
  const matchLines = useMemo(() => {
    const incidentById = new Map(placed.map((i) => [i.id, i]));
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const r of placedResponders) {
      for (const incId of r.incidentIds) {
        const inc = incidentById.get(incId);
        if (!inc || inc.locationLat == null || inc.locationLng == null) continue;
        // If something is selected, only show lines for that incident.
        if (selectedId && incId !== selectedId) continue;
        features.push({
          type: "Feature",
          properties: {
            responderId: r.id,
            incidentId: incId,
            color: TYPE_COLOR[inc.type],
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [r.currentLng!, r.currentLat!],
              [inc.locationLng!, inc.locationLat!],
            ],
          },
        });
      }
    }
    return { type: "FeatureCollection" as const, features };
  }, [placed, placedResponders, selectedId]);

  const popup = popupId ? placed.find((i) => i.id === popupId) ?? null : null;
  const responderPopup = responderPopupId
    ? placedResponders.find((r) => r.id === responderPopupId) ?? null
    : null;

  // Fit bounds to incidents once the map is ready. Avoid re-fitting on
  // every socket tick — yanks the map. Also wait for the map to be loaded
  // (`onLoad` sets mapReady) so the ref is wired before we call methods.
  useEffect(() => {
    if (!mapReady || !mapRef.current || placed.length === 0) return;
    if (fittedRef.current) return;
    if (placed.length === 1) {
      mapRef.current.flyTo({
        center: [placed[0].locationLng!, placed[0].locationLat!],
        zoom: 13,
        duration: 600,
      });
    } else {
      const bounds = placed.reduce(
        (acc, i) => acc.extend([i.locationLng!, i.locationLat!] as [number, number]),
        new maplibregl.LngLatBounds(
          [placed[0].locationLng!, placed[0].locationLat!],
          [placed[0].locationLng!, placed[0].locationLat!],
        ),
      );
      mapRef.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 13,
        duration: 600,
      });
    }
    fittedRef.current = true;
  }, [mapReady, placed]);

  // Camera follow: when the dashboard tells us which incident to focus on
  // (newly arrived or newly selected), pan/zoom to it. Cheaper than
  // fitBounds and feels like the camera is "tracking the action".
  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusedIncidentId) return;
    const target = placed.find((i) => i.id === focusedIncidentId);
    if (!target || target.locationLat == null || target.locationLng == null) return;
    mapRef.current.flyTo({
      center: [target.locationLng, target.locationLat],
      zoom: 15,
      duration: 900,
      essential: true,
    });
  }, [focusedIncidentId, mapReady, placed]);

  return (
    <MapGL
      ref={(m) => {
        mapRef.current = m;
      }}
      mapLib={maplibregl as never}
      initialViewState={{
        longitude: centre?.lng ?? DEFAULT_CENTRE.lng,
        latitude: centre?.lat ?? DEFAULT_CENTRE.lat,
        zoom: centre?.zoom ?? DEFAULT_CENTRE.zoom,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE as never}
      onLoad={() => setMapReady(true)}
      onClick={() => {
        setPopupId(null);
        setResponderPopupId(null);
      }}
    >
      <NavigationControl position="top-right" />

      {/* Match lines render first so markers paint over them. */}
      {matchLines.features.length > 0 ? (
        <Source id="match-lines" type="geojson" data={matchLines}>
          <Layer
            id="match-lines-glow"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 4,
              "line-opacity": 0.25,
              "line-blur": 2,
            }}
          />
          <Layer
            id="match-lines-core"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 1.5,
              "line-opacity": 0.85,
              "line-dasharray": [2, 2],
            }}
          />
        </Source>
      ) : null}

      {placed.map((incident) => {
        const dim = selectedId != null && selectedId !== incident.id;
        const emphasised = selectedId === incident.id || popupId === incident.id;
        return (
          <Marker
            key={incident.id}
            longitude={incident.locationLng!}
            latitude={incident.locationLat!}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setResponderPopupId(null);
              setPopupId(incident.id);
            }}
          >
            <IncidentMarker incident={incident} dim={dim} emphasised={emphasised} />
          </Marker>
        );
      })}

      {showResponders
        ? placedResponders.map((r) => {
            const linkedToSelected = selectedId
              ? r.incidentIds.includes(selectedId)
              : false;
            const dim = selectedId != null && !linkedToSelected;
            return (
              <Marker
                key={r.id}
                longitude={r.currentLng!}
                latitude={r.currentLat!}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setPopupId(null);
                  setResponderPopupId(r.id);
                }}
              >
                <ResponderMarker responder={r} dim={dim} emphasised={linkedToSelected} />
              </Marker>
            );
          })
        : null}

      {popup && popup.locationLat != null && popup.locationLng != null ? (
        <Popup
          longitude={popup.locationLng}
          latitude={popup.locationLat}
          anchor="top"
          closeButton={false}
          closeOnClick={false}
          offset={22}
          className="resq-popup"
        >
          <IncidentPopupCard
            incident={popup}
            onOpenDetails={() => {
              onSelect(popup.id);
              setPopupId(null);
            }}
            onClose={() => setPopupId(null)}
          />
        </Popup>
      ) : null}

      {responderPopup &&
      responderPopup.currentLat != null &&
      responderPopup.currentLng != null ? (
        <Popup
          longitude={responderPopup.currentLng}
          latitude={responderPopup.currentLat}
          anchor="top"
          closeButton={false}
          closeOnClick={false}
          offset={22}
          className="resq-popup"
        >
          <ResponderPopupCard
            responder={responderPopup}
            onClose={() => setResponderPopupId(null)}
          />
        </Popup>
      ) : null}
    </MapGL>
  );
}

// ---- Incident marker ----------------------------------------------------

const TYPE_EMOJI: Record<Incident["type"], string> = {
  medical: "🩹",
  fire: "🔥",
  crime: "🚨",
  accident: "🚗",
};

function IncidentMarker({
  incident,
  dim,
  emphasised,
}: {
  incident: Incident;
  dim: boolean;
  emphasised: boolean;
}) {
  const visual = STATUS_VISUAL[incident.status];
  const typeColor = TYPE_COLOR[incident.type];
  const dotColor = visual.dim ? "#525252" : typeColor;
  const ringSize = visual.ring === "double" ? 48 : visual.ring === "dashed" ? 44 : 0;
  return (
    <div
      style={{
        width: 48,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: dim ? 0.3 : 1,
        transform: `scale(${emphasised ? 1.12 : 1})`,
        transformOrigin: "center top",
        transition: "opacity 200ms ease, transform 200ms ease",
        pointerEvents: dim ? "none" : "auto",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {visual.pulse ? (
          <span
            className="animate-pulse-ring"
            style={{
              position: "absolute",
              inset: 4,
              borderRadius: 9999,
              background: typeColor,
              opacity: 0.5,
            }}
          />
        ) : null}
        {visual.ring === "dashed" ? (
          <span
            style={{
              position: "absolute",
              width: ringSize,
              height: ringSize,
              borderRadius: 9999,
              border: `2px dashed ${typeColor}`,
            }}
          />
        ) : null}
        {visual.ring === "double" ? (
          <span
            style={{
              position: "absolute",
              width: ringSize,
              height: ringSize,
              borderRadius: 9999,
              border: `2px solid ${typeColor}`,
            }}
          />
        ) : null}
        {/* Filled circular avatar w/ emoji. Matches the reference pattern
            of a logo-bearing pin rather than an undifferentiated dot. */}
        <span
          style={{
            position: "relative",
            width: 32,
            height: 32,
            borderRadius: 9999,
            background: dotColor,
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.92), 0 4px 14px rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {visual.glyph === "check" ? (
            <Glyph d="M5 12l5 5L20 7" />
          ) : visual.glyph === "cross" ? (
            <Glyph d="M6 6l12 12M18 6L6 18" />
          ) : (
            <span style={{ filter: "saturate(1.2)" }}>
              {TYPE_EMOJI[incident.type]}
            </span>
          )}
        </span>
      </div>
      {/* Severity / triage pill below the marker — the "100" / "15" chips
          in the reference. Hidden for closed states or when there's no
          triage score yet (avoids a meaningless empty pill). */}
      {!visual.dim && incident.aiTriageScore != null ? (
        <span
          style={{
            marginTop: -4,
            background: "#ffffff",
            color: "#0a0a0a",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            padding: "3px 6px",
            borderRadius: 9999,
            boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          {incident.aiTriageScore}
        </span>
      ) : null}
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Responder marker ---------------------------------------------------

const RESPONDER_COLOR: Record<ResponderPin["status"], string> = {
  available: "#22c55e",
  busy: "#f59e0b",
  off_duty: "#737373",
};

function ResponderMarker({
  responder,
  dim,
  emphasised,
}: {
  responder: ResponderPin;
  dim: boolean;
  emphasised: boolean;
}) {
  const color = RESPONDER_COLOR[responder.status];
  return (
    <div
      style={{
        width: 28,
        height: 28,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: dim ? 0.3 : 1,
        transform: `scale(${emphasised ? 1.25 : 1})`,
        transformOrigin: "center",
        transition: "opacity 200ms ease, transform 200ms ease",
        pointerEvents: dim ? "none" : "auto",
        cursor: "pointer",
      }}
    >
      {/* Diamond shape via rotated square — different silhouette from the
          circular incident dot so they're easy to tell apart at a glance. */}
      <span
        style={{
          position: "absolute",
          width: 18,
          height: 18,
          background: color,
          transform: "rotate(45deg)",
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.85), 0 2px 6px rgba(0,0,0,0.6)",
        }}
      />
      <span
        style={{
          position: "relative",
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        R
      </span>
    </div>
  );
}

// ---- Popups -------------------------------------------------------------

function IncidentPopupCard({
  incident,
  onOpenDetails,
  onClose,
}: {
  incident: Incident;
  onOpenDetails: () => void;
  onClose: () => void;
}) {
  return (
    <div className="animate-card-pop min-w-[240px] max-w-[280px] space-y-2.5 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-3.5 text-neutral-100 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TYPE_COLOR[incident.type] }}
          />
          <span className="text-sm font-semibold">{TYPE_LABEL[incident.type]}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-press text-neutral-500 transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge tone={STATUS_TONE[incident.status]} size="sm">
          {STATUS_LABEL[incident.status]}
        </Badge>
        {incident.aiSeverity ? <Badge size="sm">{incident.aiSeverity}</Badge> : null}
      </div>
      <div className="text-xs text-neutral-300">
        {incident.locationText ?? "Location pending"}
      </div>
      <div className="flex items-center justify-between text-[11px] tabular-nums text-neutral-500">
        <span className="font-mono">{incident.callerPhone ?? "Unknown caller"}</span>
        <span>{timeAgo(incident.createdAt)}</span>
      </div>
      {incident.aiTriageScore != null ? (
        <div className="text-[11px] uppercase tracking-wider text-neutral-500">
          Triage{" "}
          <span className="font-semibold tabular-nums text-neutral-200">
            {incident.aiTriageScore}/10
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onOpenDetails}
        className="btn-press mt-1 w-full rounded-xl bg-resq-red px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-resq-red/20 hover:bg-red-700"
      >
        Open details →
      </button>
    </div>
  );
}

function ResponderPopupCard({
  responder,
  onClose,
}: {
  responder: ResponderPin;
  onClose: () => void;
}) {
  return (
    <div className="animate-card-pop min-w-[220px] max-w-[280px] space-y-2 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-3.5 text-neutral-100 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5"
            style={{
              background: RESPONDER_COLOR[responder.status],
              transform: "rotate(45deg)",
              display: "inline-block",
            }}
          />
          <span className="text-sm font-semibold">{responder.name}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-press text-neutral-500 transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <Badge
        size="sm"
        tone={
          responder.status === "available"
            ? "emerald"
            : responder.status === "busy"
              ? "amber"
              : "neutral"
        }
      >
        {responder.status.replace("_", " ")}
      </Badge>
      <div className="text-xs text-neutral-300">
        {responder.skills.length > 0 ? responder.skills.join(", ") : "—"}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-neutral-500">
        {responder.phone}
      </div>
      {responder.incidentIds.length > 0 ? (
        <div className="rounded-lg bg-neutral-900/80 px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-neutral-300">
          On {responder.incidentIds.length} incident
          {responder.incidentIds.length > 1 ? "s" : ""}
        </div>
      ) : null}
    </div>
  );
}
