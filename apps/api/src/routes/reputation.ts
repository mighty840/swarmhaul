import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function reputationRoutes(app: FastifyInstance) {
  // Get agent reputation
  app.get<{ Params: { pubkey: string } }>("/:pubkey", async (req, reply) => {
    const rep = await prisma.agentReputation.findUnique({
      where: { agentPubkey: req.params.pubkey },
    });
    if (!rep) return reply.code(404).send({ error: "Agent not found" });
    return rep;
  });

  // Leaderboard — top agents by reliability
  app.get("/leaderboard", async () => {
    return prisma.agentReputation.findMany({
      orderBy: { reliabilityScore: "desc" },
      take: 20,
    });
  });
}
