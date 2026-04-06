import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function bidRoutes(app: FastifyInstance) {
  app.get<{ Params: { packageId: string } }>(
    "/:packageId",
    async (req, reply) => {
      const bids = await prisma.bid.findMany({
        where: { packageId: req.params.packageId },
        orderBy: { createdAt: "desc" },
      });
      return bids;
    },
  );

  app.post("/", async (req, reply) => {
    const body = req.body as {
      packageId: string;
      agentPubkey: string;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      distanceKm: number;
      estimatedDurationMin: number;
      costSol: number;
      reasoning?: string;
      expiresAt: string;
    };

    const bid = await prisma.bid.create({ data: body });
    // TODO: broadcast BID_RECEIVED via WS
    // TODO: trigger swarm coordinator check
    return reply.code(201).send(bid);
  });
}
