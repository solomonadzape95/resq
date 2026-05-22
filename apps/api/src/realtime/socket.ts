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

const explicitOrigins = env.WEB_ORIGIN.split(",").map((s) => s.trim());
const lanOriginRegex = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|192\.168\.\d+\.\d+(:\d+)?|10\.\d+\.\d+\.\d+(:\d+)?|172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+(:\d+)?)$/;

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      // Same allow-list shape as the REST CORS: explicit origins always,
      // localhost + private-LAN in dev so cross-device demos work.
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (explicitOrigins.includes(origin)) return cb(null, true);
        if (env.NODE_ENV !== "production" && lanOriginRegex.test(origin)) {
          return cb(null, true);
        }
        cb(new Error(`CORS: socket origin ${origin} not allowed`));
      },
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
