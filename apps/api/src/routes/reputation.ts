import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import { ReputationPubkeyParam } from "../schemas/index.js";

type RepParams = z.infer<typeof ReputationPubkeyParam>;

export async function reputationRoutes(app: FastifyInstance) {
  // Leaderboard MUST come before /:pubkey or it will be matched as a pubkey
  app.get("/leaderboard", async () => {
    return prisma.agentReputation.findMany({
      orderBy: { reliabilityScore: "desc" },
      take: 20,
    });
  });

  app.get(
    "/:pubkey",
    { schema: { params: ReputationPubkeyParam } },
    async (req, reply) => {
      const { pubkey } = req.params as RepParams;
      const rep = await prisma.agentReputation.findUnique({
        where: { agentPubkey: pubkey },
      });
      if (!rep) return reply.code(404).send({ error: "Agent not found" });
      return rep;
    },
  );
}
