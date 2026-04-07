import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { packageRoutes } from "./routes/packages.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { bidRoutes } from "./routes/bids.js";
import { swarmRoutes } from "./routes/swarms.js";
import { reputationRoutes } from "./routes/reputation.js";
import { economyRoutes } from "./routes/economy.js";
import { mcpRoutes } from "./routes/mcp.js";
import { addClient } from "./services/ws-broadcaster.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(websocket);

// Health check
app.get("/health", async () => ({ status: "ok", service: "swarmhaul-api" }));

// WebSocket endpoint for real-time events
app.get("/ws", { websocket: true }, (socket) => {
  addClient(socket);
  socket.send(JSON.stringify({ type: "CONNECTED", timestamp: new Date() }));
});

// REST routes
await app.register(packageRoutes, { prefix: "/packages" });
await app.register(vehicleRoutes, { prefix: "/vehicles" });
await app.register(bidRoutes, { prefix: "/bids" });
await app.register(swarmRoutes, { prefix: "/swarms" });
await app.register(reputationRoutes, { prefix: "/reputation" });
await app.register(economyRoutes, { prefix: "/economy" });
await app.register(mcpRoutes, { prefix: "/mcp" });

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`SwarmHaul API running on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
