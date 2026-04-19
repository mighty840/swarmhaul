/**
 * App factory: builds the Fastify instance without listening.
 * Used by both the production entrypoint (index.ts) and integration tests.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { packageRoutes } from "./routes/packages.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { bidRoutes } from "./routes/bids.js";
import { swarmRoutes } from "./routes/swarms.js";
import { reputationRoutes } from "./routes/reputation.js";
import { reputationModelRoutes } from "./routes/reputation-model.js";
import { economyRoutes } from "./routes/economy.js";
import { mcpRoutes } from "./routes/mcp.js";
import { addClient } from "./services/ws-broadcaster.js";
import { authHook } from "./services/auth.js";

export async function buildApp(opts?: { logger?: boolean }) {
  // 16KB JSON body cap — our largest legitimate payload (a bid with
  // reasoning text) is under 2KB; 16KB leaves generous headroom while
  // blocking spam payloads from bloating DB writes.
  const app = Fastify({
    logger: opts?.logger ?? false,
    bodyLimit: 16 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:4321")
    .split(",")
    .map((s) => s.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
  });

  // Per-IP rate limit. Defaults are the safe public-demo values —
  // override via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW env vars if a
  // specific deployment needs different behaviour (e.g. internal
  // stress benchmarks).
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    // Health, metrics and the WebSocket are exempt so Orca's liveness
    // probe and long-lived dashboard sessions don't get throttled.
    skip: (req) =>
      req.url === "/health" ||
      req.url === "/ws" ||
      req.url.startsWith("/ws?"),
    keyGenerator: (req) =>
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.ip,
  });

  await app.register(websocket);

  const requireAuth = process.env.REQUIRE_AUTH === "true";
  app.addHook("preHandler", authHook({ required: requireAuth }));

  const commit = process.env.COMMIT_SHA ?? "dev";
  const buildTime = process.env.BUILD_TIME ?? new Date().toISOString();
  app.get("/health", async () => ({
    status: "ok",
    service: "swarmhaul-api",
    commit,
    commitShort: commit.slice(0, 7),
    buildTime,
  }));

  app.get("/ws", { websocket: true }, (socket) => {
    addClient(socket);
    socket.send(JSON.stringify({ type: "CONNECTED", timestamp: new Date() }));
  });

  await app.register(packageRoutes, { prefix: "/packages" });
  await app.register(vehicleRoutes, { prefix: "/vehicles" });
  await app.register(bidRoutes, { prefix: "/bids" });
  await app.register(swarmRoutes, { prefix: "/swarms" });
  await app.register(reputationRoutes, { prefix: "/reputation" });
  await app.register(reputationModelRoutes, { prefix: "/reputation-model" });
  await app.register(economyRoutes, { prefix: "/economy" });
  await app.register(mcpRoutes, { prefix: "/mcp" });

  return app;
}
