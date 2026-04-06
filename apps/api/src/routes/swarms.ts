import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { confirmLegCompletion } from "../services/swarm-coordinator.js";

export async function swarmRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const swarm = await prisma.swarm.findUnique({
      where: { id: req.params.id },
      include: { legs: true, package: true },
    });
    if (!swarm) return reply.code(404).send({ error: "Swarm not found" });
    return swarm;
  });

  app.get<{ Params: { id: string } }>("/:id/legs", async (req) => {
    return prisma.leg.findMany({
      where: { swarmId: req.params.id },
      orderBy: { id: "asc" },
    });
  });

  // Webhook: agent confirms leg completion
  app.post<{ Params: { legId: string } }>(
    "/legs/:legId/confirm",
    async (req, reply) => {
      const { agentPubkey } = req.body as { agentPubkey: string };
      const leg = await prisma.leg.findUnique({
        where: { id: req.params.legId },
      });

      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.agentPubkey !== agentPubkey)
        return reply.code(403).send({ error: "Not your leg" });
      if (leg.status === "completed")
        return reply.code(400).send({ error: "Already completed" });

      await confirmLegCompletion(leg.id, agentPubkey);
      return { success: true };
    },
  );
}
