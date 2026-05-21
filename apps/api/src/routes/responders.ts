import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { findCandidateResponders } from "../services/matcher.js";
import { ROOM } from "@resq/shared/events";
import { getIO } from "../realtime/socket.js";

export const respondersRouter = Router();

const registerBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  skills: z.array(z.string()).min(1),
  availabilityRadiusKm: z.number().int().min(1).max(50).default(5),
});

respondersRouter.post("/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;

  const passwordHash = data.password
    ? await bcrypt.hash(data.password, 10)
    : null;

  const user = await prisma.user.upsert({
    where: { phone: data.phone },
    create: {
      phone: data.phone,
      name: data.name,
      email: data.email,
      passwordHash,
      role: "responder",
    },
    update: {
      name: data.name,
      email: data.email,
      role: "responder",
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  const responder = await prisma.responder.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      skills: data.skills,
      availabilityRadiusKm: data.availabilityRadiusKm,
      verified: true, // auto-verify in MVP
      status: "off_duty",
    },
    update: {
      skills: data.skills,
      availabilityRadiusKm: data.availabilityRadiusKm,
    },
    include: { user: true },
  });

  return res.status(201).json(responder);
});

respondersRouter.get("/", async (_req, res) => {
  const list = await prisma.responder.findMany({
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return res.json(list);
});

respondersRouter.get("/nearby", async (req, res) => {
  const type = req.query.type as "medical" | "fire" | "crime" | "accident";
  const lat = req.query.lat != null ? Number(req.query.lat) : null;
  const lng = req.query.lng != null ? Number(req.query.lng) : null;
  if (!type) return res.status(400).json({ error: "type required" });
  const candidates = await findCandidateResponders({ type, lat, lng, limit: 10 });
  return res.json(candidates);
});

const statusBody = z.object({
  status: z.enum(["available", "busy", "off_duty"]),
});

respondersRouter.patch("/:id/status", async (req, res) => {
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await prisma.responder.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
    include: { user: true },
  });
  getIO().to(ROOM.coordinator()).emit("responder:status", {
    responderId: updated.id,
    status: updated.status,
    lat: updated.currentLat,
    lng: updated.currentLng,
  });
  return res.json(updated);
});

const locBody = z.object({ lat: z.number(), lng: z.number() });

respondersRouter.post("/:id/location", async (req, res) => {
  const parsed = locBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await prisma.responder.update({
    where: { id: req.params.id },
    data: {
      currentLat: parsed.data.lat,
      currentLng: parsed.data.lng,
      lastLocationUpdate: new Date(),
    },
  });
  getIO().to(ROOM.coordinator()).emit("responder:status", {
    responderId: updated.id,
    status: updated.status,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
  });
  return res.json({ ok: true });
});
