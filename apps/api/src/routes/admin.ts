import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import {
  seedDatabase,
  wipeAll,
  wipeIncidents,
} from "../services/seedDatabase.js";

// Unauthenticated admin endpoints — used by /dashboard/admin in the web app
// to seed and prune the DB during demos. Anyone who can reach this server
// can wipe it; do NOT mount this router in production without an
// auth/firewall layer in front.
export const adminRouter = Router();

adminRouter.post("/seed", async (_req, res) => {
  try {
    const result = await seedDatabase(prisma);
    logger.info({ result }, "[admin] seed complete");
    return res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[admin] seed failed");
    return res.status(500).json({
      error: "seed_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

adminRouter.post("/wipe-incidents", async (_req, res) => {
  try {
    const result = await wipeIncidents(prisma);
    logger.info({ result }, "[admin] wipe-incidents complete");
    return res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[admin] wipe-incidents failed");
    return res.status(500).json({
      error: "wipe_incidents_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

adminRouter.post("/wipe-all", async (_req, res) => {
  try {
    await wipeAll(prisma);
    logger.warn("[admin] wipe-all complete — DB is empty");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin] wipe-all failed");
    return res.status(500).json({
      error: "wipe_all_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// One round-trip for the admin page to populate all three lists.
adminRouter.get("/inventory", async (_req, res) => {
  const [incidents, responders, users] = await Promise.all([
    prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        callerPhone: true,
        locationText: true,
        locationLat: true,
        locationLng: true,
        createdAt: true,
        aiSeverity: true,
      },
    }),
    prisma.responder.findMany({
      orderBy: { id: "desc" },
      include: { user: { select: { name: true, phone: true } } },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
  ]);
  return res.json({ incidents, responders, users });
});

// All three deletes rely on schema-level onDelete: Cascade for the join
// rows (IncidentResponder, Call) and Responder→User. See schema.prisma.

adminRouter.delete("/incidents/:id", async (req, res) => {
  try {
    await prisma.incident.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "[admin] delete incident failed");
    return res.status(500).json({
      error: "delete_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

adminRouter.delete("/responders/:id", async (req, res) => {
  try {
    await prisma.responder.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "[admin] delete responder failed");
    return res.status(500).json({
      error: "delete_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

adminRouter.delete("/users/:id", async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "[admin] delete user failed");
    return res.status(500).json({
      error: "delete_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
