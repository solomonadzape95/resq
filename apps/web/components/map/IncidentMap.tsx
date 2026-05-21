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
  STATUS_VISUAL,
  TYPE_COLOR,
  TYPE_LABEL,
  timeAgo,
} from "@/lib/incidents";

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
}

export function IncidentMap({
  incidents,
  responders,
  showResponders,
  selectedId,
  onSelect,
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

  return (
    <MapGL
      ref={(m) => {
        mapRef.current = m;
      }}
      mapLib={maplibregl as never}
      initialViewState={{
        longitude: DEFAULT_CENTRE.lng,
        latitude: DEFAULT_CENTRE.lat,
        zoom: DEFAULT_CENTRE.zoom,
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
  // Outer ring sizes
  const ringSize = visual.ring === "double" ? 36 : visual.ring === "dashed" ? 32 : 0;
  return (
    <div
      style={{
        width: 40,
        height: 40,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: dim ? 0.25 : 1,
        transform: `scale(${emphasised ? 1.15 : 1})`,
        transformOrigin: "center",
        transition: "opacity 200ms ease, transform 200ms ease",
        pointerEvents: dim ? "none" : "auto",
        cursor: "pointer",
      }}
    >
      {visual.pulse ? (
        <span
          className="animate-pulse-ring"
          style={{
            position: "absolute",
            inset: 8,
            borderRadius: 9999,
            background: typeColor,
            opacity: 0.45,
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
        <>
          <span
            style={{
              position: "absolute",
              width: ringSize,
              height: ringSize,
              borderRadius: 9999,
              border: `2px solid ${typeColor}`,
            }}
          />
          <span
            style={{
              position: "absolute",
              width: 24,
              height: 24,
              borderRadius: 9999,
              border: `1px solid ${typeColor}`,
            }}
          />
        </>
      ) : null}
      <span
        style={{
          position: "relative",
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: dotColor,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.85), 0 2px 8px rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        {visual.glyph === "check" ? <Glyph d="M5 12l5 5L20 7" /> : null}
        {visual.glyph === "cross" ? <Glyph d="M6 6l12 12M18 6L6 18" /> : null}
      </span>
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
  const visual = STATUS_VISUAL[incident.status];
  return (
    <div className="min-w-[220px] max-w-[260px] space-y-2 rounded-lg bg-neutral-950 p-3 text-neutral-100 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TYPE_COLOR[incident.type] }}
          />
          <span className="text-sm font-semibold">{TYPE_LABEL[incident.type]}</span>
          {incident.aiSeverity ? (
            <span className="text-xs uppercase tracking-wide text-neutral-400">
              · {incident.aiSeverity}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${visual.badgeClass}`}>
        {STATUS_LABEL[incident.status]}
      </div>
      <div className="text-xs text-neutral-300">
        {incident.locationText ?? "Location pending"}
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span className="font-mono">{incident.callerPhone ?? "Unknown caller"}</span>
        <span>{timeAgo(incident.createdAt)}</span>
      </div>
      {incident.aiTriageScore != null ? (
        <div className="text-xs text-neutral-400">
          Triage{" "}
          <span className="font-semibold text-neutral-200">
            {incident.aiTriageScore}/10
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onOpenDetails}
        className="mt-1 w-full rounded-md bg-resq-red px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
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
    <div className="min-w-[200px] max-w-[260px] space-y-2 rounded-lg bg-neutral-950 p-3 text-neutral-100 shadow-xl">
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
          className="text-neutral-500 transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="text-xs uppercase tracking-wide text-neutral-400">
        {responder.status.replace("_", " ")}
      </div>
      <div className="text-xs text-neutral-300">
        {responder.skills.length > 0 ? responder.skills.join(", ") : "—"}
      </div>
      <div className="font-mono text-xs text-neutral-400">{responder.phone}</div>
      {responder.incidentIds.length > 0 ? (
        <div className="rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
          On {responder.incidentIds.length} incident
          {responder.incidentIds.length > 1 ? "s" : ""}
        </div>
      ) : null}
    </div>
  );
}
