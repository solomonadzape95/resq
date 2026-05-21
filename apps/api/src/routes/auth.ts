import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";

export const authRouter = Router();

function sign(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

const registerBody = z.object({
  phone: z.string().min(6),
  password: z.string().min(6),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["caller", "responder", "coordinator", "admin"]).default("caller"),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
    },
  });
  return res.status(201).json({
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
    token: sign(user.id, user.role),
  });
});

const loginBody = z.object({
  phone: z.string(),
  password: z.string(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  return res.json({
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
    token: sign(user.id, user.role),
  });
});
