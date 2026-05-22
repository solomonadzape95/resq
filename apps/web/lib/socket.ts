"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@resq/shared/events";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// Socket URL falls back through the same chain as the REST API: explicit
// env override, then window.location.hostname:4000 (so phones hitting the
// dev box via LAN IP also reach the right host), then localhost.
function resolveSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

export function getSocket() {
  if (typeof window === "undefined") return null;
  if (socket) return socket;
  socket = io(resolveSocketUrl(), {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return socket;
}
