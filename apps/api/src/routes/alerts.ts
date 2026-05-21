import { Router } from "express";
import { z } from "zod";
import { ROOM } from "@resq/shared/events";
import { prisma } from "../db/prisma.js";
import { getIO } from "../realtime/socket.js";
import { logger } from "../lib/logger.js";

export const alertsRouter = Router();

const createBody = z.object({
  type: z.enum(["medical", "fire", "crime", "accident"]),
  source: z.enum(["ussd", "app", "web", "sms", "voice"]).default("web"),
  callerPhone: z.string().optional(),
  callerUserId: z.string().optional(),
  locationText: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

alertsRouter.post("/", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;
  const incident = await prisma.incident.create({
    data: {
      type: data.type,
      source: data.source,
      callerPhone: data.callerPhone,
      callerUserId: data.callerUserId,
      locationText: data.locationText,
      locationLat: data.locationLat,
      locationLng: data.locationLng,
      locationConfirmed:
        data.locationLat != null && data.locationLng != null,
    },
  });

  try {
    getIO().to(ROOM.coordinator()).emit("incident:new", {
      id: incident.id,
      createdAt: incident.createdAt.toISOString(),
      type: incident.type,
      status: incident.status,
      callerPhone: incident.callerPhone,
      callerUserId: incident.callerUserId,
      source: incident.source,
      locationText: incident.locationText,
      locationLat: incident.locationLat,
      locationLng: incident.locationLng,
      locationConfirmed: incident.locationConfirmed,
      aiTriageScore: incident.aiTriageScore,
      aiSeverity: incident.aiSeverity,
      aiExtractedLocation: incident.aiExtractedLocation,
      transcriptFull: incident.transcriptFull,
      transcriptSummary: incident.transcriptSummary,
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    });
  } catch (e) {
    logger.error({ e }, "[alerts] emit failed");
  }

  return res.status(201).json(incident);
});

alertsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const active = req.query.active === "true";

  const where = active
    ? {
        status: {
          in: ["new", "triaged", "assigned", "active"] as (
            | "new"
            | "triaged"
            | "assigned"
            | "active"
          )[],
        },
      }
    : status
      ? { status: status as never }
      : {};

  const list = await prisma.incident.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      responders: {
        include: { responder: { include: { user: true } } },
      },
    },
  });
  return res.json(list);
});

alertsRouter.get("/:id", async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
    include: {
      responders: { include: { responder: { include: { user: true } } } },
      calls: true,
    },
  });
  if (!incident) return res.status(404).json({ error: "not_found" });
  return res.json(incident);
});

const statusBody = z.object({
  status: z.enum([
    "new",
    "triaged",
    "assigned",
    "active",
    "resolved",
    "false_alarm",
    "cancelled",
  ]),
});

alertsRouter.patch("/:id/status", async (req, res) => {
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await prisma.incident.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      resolvedAt:
        parsed.data.status === "resolved" ? new Date() : undefined,
    },
  });

  getIO().to(ROOM.coordinator()).emit("incident:updated", {
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
  });
  getIO().to(ROOM.incident(updated.id)).emit("incident:updated", {
    id: updated.id,
    status: updated.status,
  });

  return res.json(updated);
});

const locationBody = z.object({
  locationText: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationConfirmed: z.boolean().optional(),
});

alertsRouter.post("/:id/location", async (req, res) => {
  const parsed = locationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await prisma.incident.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  getIO().to(ROOM.coordinator()).emit("incident:updated", {
    id: updated.id,
    locationText: updated.locationText,
    locationLat: updated.locationLat,
    locationLng: updated.locationLng,
    locationConfirmed: updated.locationConfirmed,
  });
  if (updated.locationLat != null && updated.locationLng != null) {
    getIO().to(ROOM.incident(updated.id)).emit("incident:location_update", {
      id: updated.id,
      lat: updated.locationLat,
      lng: updated.locationLng,
      locationText: updated.locationText,
    });
  }
  return res.json(updated);
});

const assignBody = z.object({ responderId: z.string() });
alertsRouter.post("/:id/assign", async (req, res) => {
  const parsed = assignBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
  });
  if (!incident) return res.status(404).json({ error: "not_found" });

  const link = await prisma.incidentResponder.upsert({
    where: {
      incidentId_responderId: {
        incidentId: req.params.id,
        responderId: parsed.data.responderId,
      },
    },
    create: {
      incidentId: req.params.id,
      responderId: parsed.data.responderId,
    },
    update: {},
    include: { responder: { include: { user: true } } },
  });

  await prisma.incident.update({
    where: { id: req.params.id },
    data: { status: "assigned" },
  });

  getIO().to(ROOM.responder(parsed.data.responderId)).emit("incident:new", {
    id: incident.id,
    createdAt: incident.createdAt.toISOString(),
    type: incident.type,
    status: "assigned",
    callerPhone: incident.callerPhone,
    callerUserId: incident.callerUserId,
    source: incident.source,
    locationText: incident.locationText,
    locationLat: incident.locationLat,
    locationLng: incident.locationLng,
    locationConfirmed: incident.locationConfirmed,
    aiTriageScore: incident.aiTriageScore,
    aiSeverity: incident.aiSeverity,
    aiExtractedLocation: incident.aiExtractedLocation,
    transcriptFull: incident.transcriptFull,
    transcriptSummary: incident.transcriptSummary,
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
  });
  getIO().to(ROOM.coordinator()).emit("incident:updated", {
    id: req.params.id,
    status: "assigned",
  });

  return res.json(link);
});

// Coordinator manually re-rings the caller's simulator. Same emit as the
// auto-ring from the USSD route, just triggered by a button click.
alertsRouter.post("/:id/ring", async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
  });
  if (!incident) return res.status(404).json({ error: "not_found" });
  if (!incident.callerPhone) {
    return res.status(400).json({ error: "no_caller_phone" });
  }
  getIO().to(ROOM.phone(incident.callerPhone)).emit("call:incoming", {
    incidentId: incident.id,
    type: incident.type,
    callerName: "ResQ Coordinator",
  });
  return res.json({ ok: true, phone: incident.callerPhone });
});

const acceptBody = z.object({
  responderId: z.string(),
  status: z.enum(["accepted", "declined", "en_route", "on_scene", "resolved"]),
  etaMinutes: z.number().optional(),
});

alertsRouter.post("/:id/respond", async (req, res) => {
  const parsed = acceptBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const link = await prisma.incidentResponder.upsert({
    where: {
      incidentId_responderId: {
        incidentId: req.params.id,
        responderId: parsed.data.responderId,
      },
    },
    create: {
      incidentId: req.params.id,
      responderId: parsed.data.responderId,
      status: parsed.data.status,
      acceptedAt: parsed.data.status === "accepted" ? new Date() : null,
      etaMinutes: parsed.data.etaMinutes ?? null,
    },
    update: {
      status: parsed.data.status,
      acceptedAt: parsed.data.status === "accepted" ? new Date() : undefined,
      arrivedAt: parsed.data.status === "on_scene" ? new Date() : undefined,
      etaMinutes: parsed.data.etaMinutes ?? undefined,
    },
    include: { responder: { include: { user: true } } },
  });

  if (parsed.data.status === "accepted") {
    await prisma.incident.update({
      where: { id: req.params.id },
      data: { status: "active" },
    });
  }

  getIO().to(ROOM.coordinator()).emit("responder:accepted", {
    incidentId: req.params.id,
    responder: {
      id: link.responder.id,
      userId: link.responder.userId,
      name: link.responder.user.name ?? "Responder",
      phone: link.responder.user.phone,
      skills: link.responder.skills as never,
      verified: link.responder.verified,
      availabilityRadiusKm: link.responder.availabilityRadiusKm,
      status: link.responder.status,
      currentLat: link.responder.currentLat,
      currentLng: link.responder.currentLng,
      lastLocationUpdate:
        link.responder.lastLocationUpdate?.toISOString() ?? null,
      totalResponses: link.responder.totalResponses,
      avgResponseTime: link.responder.avgResponseTime,
    },
    etaMinutes: link.etaMinutes ?? null,
  });

  return res.json(link);
});
