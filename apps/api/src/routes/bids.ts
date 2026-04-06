import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { evaluateSwarmFormation } from "../services/swarm-coordinator.js";

export async function bidRoutes(app: FastifyInstance) {
  app.get<{ Params: { packageId: string } }>(
    "/:packageId",
    async (req) => {
      return prisma.bid.findMany({
        where: { packageId: req.params.packageId },
        orderBy: { createdAt: "desc" },
      });
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

    // Track agent reputation (accepted bid)
    await prisma.agentReputation.upsert({
      where: { agentPubkey: body.agentPubkey },
      create: {
        agentPubkey: body.agentPubkey,
        legsAccepted: 1,
        reliabilityScore: 50,
      },
      update: {
        legsAccepted: { increment: 1 },
      },
    });

    broadcast({
      type: "BID_RECEIVED",
      bid: {
        id: bid.id,
        packageId: bid.packageId,
        agentPubkey: bid.agentPubkey,
        proposedLeg: {
          id: "",
          swarmId: "",
          agentPubkey: bid.agentPubkey,
          pickupLocation: { lat: bid.pickupLat, lng: bid.pickupLng },
          dropoffLocation: { lat: bid.dropoffLat, lng: bid.dropoffLng },
          distanceKm: bid.distanceKm,
          estimatedDurationMin: bid.estimatedDurationMin,
          agreedPaymentSol: bid.costSol,
          status: "pending",
        },
        costSol: bid.costSol,
        reasoning: bid.reasoning ?? undefined,
        expiresAt: bid.expiresAt,
      },
    });

    // Trigger swarm formation evaluation
    evaluateSwarmFormation(bid.packageId).catch((err) =>
      app.log.error(err, "Swarm evaluation failed"),
    );

    return reply.code(201).send(bid);
  });
}
