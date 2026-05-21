"use client";

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@resq/shared/events";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (typeof window === "undefined") return null;
  if (socket) return socket;
  const url =
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  socket = io(url, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return socket;
}
