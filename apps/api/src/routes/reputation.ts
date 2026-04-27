import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ReputationPubkeyParam } from "../schemas/index.js";

type RepParams = z.infer<typeof ReputationPubkeyParam>;

export async function reputationRoutes(app: FastifyInstance) {
  // Leaderboard MUST come before /:pubkey or it will be matched as a pubkey
  app.get("/leaderboard", async () => {
    const agents = await prisma.agentReputation.findMany({
      orderBy: { reliabilityScore: "desc" },
      take: 20,
    });

    const pubkeys = agents.map((a) => a.agentPubkey);
    const earningsRows = await prisma.digitalLeg.groupBy({
      by: ["agentPubkey"],
      where: {
        agentPubkey: { in: pubkeys },
        status: "completed",
        paymentLamports: { not: null },
      },
      _sum: { paymentLamports: true },
    });

    const earningsMap = new Map(
      earningsRows.map((r) => [r.agentPubkey, r._sum.paymentLamports ?? 0n]),
    );

    return agents.map((a) => ({
      ...a,
      totalEarningsLamports: String(earningsMap.get(a.agentPubkey) ?? 0n),
    }));
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

  // Agents call this on startup to advertise their work mode.
  // Creates the reputation row if it doesn't exist yet.
  app.put(
    "/:pubkey/mode",
    {
      schema: {
        params: ReputationPubkeyParam,
        body: z.object({ mode: z.enum(["courier", "digital", "both"]) }),
      },
    },
    async (req) => {
      const { pubkey } = req.params as RepParams;
      const { mode } = req.body as { mode: string };
      const rep = await prisma.agentReputation.upsert({
        where: { agentPubkey: pubkey },
        update: { mode },
        create: { agentPubkey: pubkey, mode },
      });
      return { agentPubkey: rep.agentPubkey, mode: rep.mode };
    },
  );
}
