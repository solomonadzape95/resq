import http from "node:http";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { initSocket } from "./realtime/socket.js";
import { ussdRouter } from "./routes/ussd.js";
import { alertsRouter } from "./routes/alerts.js";
import { respondersRouter } from "./routes/responders.js";
import { callsRouter } from "./routes/calls.js";
import { authRouter } from "./routes/auth.js";
import { voiceRouter } from "./routes/voice.js";

const app = express();

// CORS:
//   - WEB_ORIGIN entries (production / explicit) are always allowed
//   - In dev (NODE_ENV !== 'production') any localhost/private-LAN origin
//     is also allowed, so a phone on the same wifi can hit this API.
//   - Same-origin / curl requests (no Origin header) always pass.
const explicitOrigins = env.WEB_ORIGIN.split(",").map((s) => s.trim());
const lanOriginRegex = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|192\.168\.\d+\.\d+(:\d+)?|10\.\d+\.\d+\.\d+(:\d+)?|172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+(:\d+)?)$/;
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (explicitOrigins.includes(origin)) return cb(null, true);
      if (env.NODE_ENV !== "production" && lanOriginRegex.test(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

// AT posts USSD bodies as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
// `verify` stashes the raw body buffer on the request so /voice/transcript
// can HMAC-verify the ElevenLabs webhook against the exact bytes signed.
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/healthz" } }));

app.get("/healthz", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use("/ussd", ussdRouter);
app.use("/alerts", alertsRouter);
app.use("/responders", respondersRouter);
app.use("/calls", callsRouter);
app.use("/voice", voiceRouter);
app.use("/auth", authRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "[api] unhandled");
  res.status(500).json({ error: "internal_error", message: err.message });
});

const server = http.createServer(app);
initSocket(server);

server.listen(env.PORT, () => {
  logger.info(`ResQ API listening on http://localhost:${env.PORT}`);
  logger.info(`USSD webhook → POST ${env.PUBLIC_BASE_URL}/ussd`);
});
