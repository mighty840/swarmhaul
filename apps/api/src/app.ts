/**
 * App factory: builds the Fastify instance without listening.
 * Used by both the production entrypoint (index.ts) and integration tests.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
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
  const app = Fastify({ logger: opts?.logger ?? false }).withTypeProvider<ZodTypeProvider>();

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

  await app.register(websocket);

  const requireAuth = process.env.REQUIRE_AUTH === "true";
  app.addHook("preHandler", authHook({ required: requireAuth }));

  app.get("/health", async () => ({ status: "ok", service: "swarmhaul-api" }));

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
