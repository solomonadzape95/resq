import type { Incident, Responder } from "./types";

export interface ServerToClientEvents {
  "incident:new": (incident: Incident) => void;
  "incident:updated": (payload: Partial<Incident> & { id: string }) => void;
  "incident:location_update": (payload: {
    id: string;
    lat: number;
    lng: number;
    locationText: string | null;
  }) => void;
  "transcript:chunk": (payload: {
    incidentId: string;
    text: string;
    timestamp: string;
    extractedData?: Record<string, unknown>;
  }) => void;
  "responder:accepted": (payload: {
    incidentId: string;
    responder: Responder;
    etaMinutes: number | null;
  }) => void;
  "responder:status": (payload: {
    responderId: string;
    status: Responder["status"];
    lat: number | null;
    lng: number | null;
  }) => void;
  // System ringing the caller's simulator after a USSD report (or via
  // the coordinator's "Ring caller" button). The simulator subscribes to
  // ROOM.phone(phoneNumber) on mount.
  "call:incoming": (payload: {
    incidentId: string;
    type: "medical" | "fire" | "crime" | "accident";
    callerName: string;
  }) => void;
}

export interface ClientToServerEvents {
  "join:coordinator": () => void;
  "join:incident": (incidentId: string) => void;
  "join:responder": (responderId: string) => void;
  "join:phone": (phoneNumber: string) => void;
  "responder:location": (payload: {
    responderId: string;
    lat: number;
    lng: number;
  }) => void;
}

export const ROOM = {
  coordinator: () => "coordinator:global",
  incident: (id: string) => `incident:${id}`,
  responder: (id: string) => `responder:${id}`,
  phone: (phoneNumber: string) => `phone:${phoneNumber}`,
};
