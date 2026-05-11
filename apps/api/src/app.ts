/**
 * App factory: builds the Fastify instance without listening.
 * Used by both the production entrypoint (index.ts) and integration tests.
 */
import Fastify, { type FastifyRequest } from "fastify";
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
import { devRoutes } from "./routes/dev.js";
import { didRoutes } from "./routes/did.js";
import { digitalTaskRoutes } from "./routes/digital-tasks.js";
import { closeBidWindows } from "./services/bid-window-closer.js";
import { watchLegTimeouts } from "./services/leg-timeout-watcher.js";
import { coordinatorAutoConfirm } from "./services/coordinator-auto-confirm.js";
import { rewardClaimRoutes } from "./routes/reward-claims.js";
import { addClient } from "./services/ws-broadcaster.js";
import { authHook } from "./services/auth.js";
import { prisma } from "./db/client.js";
import { broadcast } from "./services/ws-broadcaster.js";

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

  // BigInt fields (paymentLamports, devnetEarningsLamports) come from Prisma
  // and are not JSON-serializable by default. Coerce them to strings globally
  // so any route returning Prisma models never throws.
  app.setReplySerializer((payload) =>
    JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:4321")
    .split(",")
    .map((s) => s.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // MCP SSE and messages endpoints are open to all origins —
      // agents connect from Claude Desktop, OpenClaw, etc. with no predictable origin.
      return cb(null, true);
    },
    credentials: true,
  });

  // Per-IP rate limit. Defaults are the safe public-demo values —
  // override via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW env vars if a
  // specific deployment needs different behaviour (e.g. internal
  // stress benchmarks).
  //
  // /health and the WebSocket are allow-listed so Orca's liveness
  // probe and long-lived dashboard sessions don't trip the limit.
  // keyGenerator honours X-Forwarded-For for real client IPs behind
  // the Orca proxy.
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    allowList: (req: FastifyRequest): boolean =>
      req.url === "/health" ||
      req.url === "/ws" ||
      req.url.startsWith("/ws?") ||
      req.url === "/mcp/sse" ||
      req.url.startsWith("/mcp/messages") ||
      req.url === "/mcp" ||
      req.url.startsWith("/mcp?"),
    keyGenerator: (req: FastifyRequest): string =>
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ?? req.ip,
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
  await app.register(didRoutes, { prefix: "/did" });
  await app.register(digitalTaskRoutes, { prefix: "/digital-tasks" });
  await app.register(rewardClaimRoutes, { prefix: "/reward-claims" });

  app.get("/.well-known/mcp.json", async () => ({
    mcpVersion: "1.0",
    name: "SwarmHaul",
    description: "Multi-agent digital task coordination on Solana. Earn devnet SOL by completing task legs. No account creation needed.",
    server: {
      transport: "http",
      url: "https://api.swarmhaul.defited.com/mcp",
    },
    tools: ["swarmhaul_register_agent", "swarmhaul_post_digital_task", "swarmhaul_list_digital_tasks", "swarmhaul_bid_digital_leg", "swarmhaul_complete_digital_leg"],
    icon: "https://api.swarmhaul.defited.com/logo.svg",
  }));

  // Dev-only seeding routes. Must NEVER be enabled in production.
  if (process.env.DEV_ROUTES === "true") {
    await app.register(devRoutes, { prefix: "/dev" });
    app.log.warn("DEV_ROUTES enabled — /dev/* endpoints exposed");
  }

  // Self-healing reconciliation: find tasks where all legs are completed
  // but the task status was never advanced (e.g. due to the ws-broadcaster
  // BigInt crash that blocked the completion check from running).
  async function reconcileDigitalTasks() {
    const stuck = await prisma.digitalTask.findMany({
      where: { status: "in_progress" },
      include: { legs: true },
    });
    for (const task of stuck) {
      if (task.legs.length > 0 && task.legs.every((l) => l.status === "completed")) {
        const fixed = await prisma.digitalTask.update({
          where: { id: task.id },
          data: { status: "completed", completedAt: new Date() },
          include: { legs: { orderBy: { sequence: "asc" } } },
        });
        broadcast({ type: "DIGITAL_TASK_COMPLETED", task: fixed as never });
        app.log.info(`[reconcile] auto-completed stuck task ${task.id}`);
      }
    }
  }

  // Run once on startup, then every 5 minutes.
  void reconcileDigitalTasks();
  setInterval(() => void reconcileDigitalTasks(), 5 * 60 * 1000);

  // Close expired bid windows every 2 seconds and assign winners.
  setInterval(() => void closeBidWindows(), 2_000);

  // Auto-dispute physical legs that exceed 2× their estimated duration.
  setInterval(() => void watchLegTimeouts(), 60_000);
  setInterval(() => void coordinatorAutoConfirm(), 10_000);

  return app;
}
