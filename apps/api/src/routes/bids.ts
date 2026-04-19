import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { evaluateSwarmFormation } from "../services/swarm-coordinator.js";
import { BidCreateBody, BidPackageIdParam } from "../schemas/index.js";

type BidBody = z.infer<typeof BidCreateBody>;
type BidParams = z.infer<typeof BidPackageIdParam>;

export async function bidRoutes(app: FastifyInstance) {
  app.get(
    "/:packageId",
    { schema: { params: BidPackageIdParam } },
    async (req) => {
      const { packageId } = req.params as BidParams;
      return prisma.bid.findMany({
        where: { packageId },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/",
    {
      schema: { body: BidCreateBody },
      config: {
        rateLimit: {
          max: Number(process.env.BID_RATE_LIMIT_MAX ?? 20),
          timeWindow: process.env.BID_RATE_LIMIT_WINDOW ?? "1 minute",
        },
      },
    },
    async (req, reply) => {
      const body = req.body as BidBody;

      // If authed: require body.agentPubkey to match the authed wallet
      // (no impersonation). In demo mode, accept the body field as-is.
      if (req.authedPubkey && req.authedPubkey !== body.agentPubkey) {
        return reply.code(403).send({
          error: "agentPubkey in body does not match authed wallet",
        });
      }

      const bid = await prisma.bid.create({
        data: {
          packageId: body.packageId,
          agentPubkey: body.agentPubkey,
          pickupLat: body.pickupLat,
          pickupLng: body.pickupLng,
          dropoffLat: body.dropoffLat,
          dropoffLng: body.dropoffLng,
          distanceKm: body.distanceKm,
          estimatedDurationMin: body.estimatedDurationMin,
          costSol: body.costSol,
          reasoning: body.reasoning ?? null,
          expiresAt: body.expiresAt,
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

      evaluateSwarmFormation(bid.packageId).catch((err) =>
        app.log.error({ err }, "Swarm evaluation failed"),
      );

      return reply.code(201).send(bid);
    },
  );
}
