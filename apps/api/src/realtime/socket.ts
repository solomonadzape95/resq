import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@resq/shared/events";
import { ROOM } from "@resq/shared/events";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.WEB_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    logger.debug({ id: socket.id }, "[socket] connect");

    socket.on("join:coordinator", () => {
      socket.join(ROOM.coordinator());
    });

    socket.on("join:incident", (incidentId) => {
      if (typeof incidentId === "string") socket.join(ROOM.incident(incidentId));
    });

    socket.on("join:responder", (responderId) => {
      if (typeof responderId === "string") socket.join(ROOM.responder(responderId));
    });

    socket.on("join:phone", (phoneNumber) => {
      if (typeof phoneNumber === "string") socket.join(ROOM.phone(phoneNumber));
    });

    socket.on("responder:location", (payload) => {
      io?.to(ROOM.coordinator()).emit("responder:status", {
        responderId: payload.responderId,
        status: "available",
        lat: payload.lat,
        lng: payload.lng,
      });
    });

    socket.on("disconnect", () => {
      logger.debug({ id: socket.id }, "[socket] disconnect");
    });
  });

  logger.info("Socket.io ready");
  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialised. Call initSocket() first.");
  return io;
}
