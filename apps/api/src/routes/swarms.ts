import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import { confirmLegCompletion } from "../services/swarm-coordinator.js";
import { SwarmIdParam, LegIdParam, LegConfirmBody } from "../schemas/index.js";

type SwarmParams = z.infer<typeof SwarmIdParam>;
type LegParams = z.infer<typeof LegIdParam>;
type LegBody = z.infer<typeof LegConfirmBody>;

export async function swarmRoutes(app: FastifyInstance) {
  app.get(
    "/:id",
    { schema: { params: SwarmIdParam } },
    async (req, reply) => {
      const { id } = req.params as SwarmParams;
      const swarm = await prisma.swarm.findUnique({
        where: { id },
        include: { legs: true, package: true },
      });
      if (!swarm) return reply.code(404).send({ error: "Swarm not found" });
      return swarm;
    },
  );

  app.get(
    "/:id/legs",
    { schema: { params: SwarmIdParam } },
    async (req) => {
      const { id } = req.params as SwarmParams;
      return prisma.leg.findMany({
        where: { swarmId: id },
        orderBy: { id: "asc" },
      });
    },
  );

  // Webhook: agent confirms leg completion
  app.post(
    "/legs/:legId/confirm",
    { schema: { params: LegIdParam, body: LegConfirmBody } },
    async (req, reply) => {
      const { legId } = req.params as LegParams;
      const body = req.body as LegBody;

      const leg = await prisma.leg.findUnique({ where: { id: legId } });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });

      // Authed mode: signer must match leg.agentPubkey
      // Demo mode: trust body.agentPubkey (still must match leg)
      const claimedPubkey = req.authedPubkey ?? body.agentPubkey;
      if (claimedPubkey !== body.agentPubkey)
        return reply.code(403).send({
          error: "agentPubkey in body does not match authed wallet",
        });
      if (leg.agentPubkey !== claimedPubkey)
        return reply.code(403).send({ error: "Not your leg" });
      if (leg.status === "completed")
        return reply.code(400).send({ error: "Already completed" });

      await confirmLegCompletion(leg.id, body.agentPubkey, body.confirmSignature);
      return { success: true };
    },
  );
}
