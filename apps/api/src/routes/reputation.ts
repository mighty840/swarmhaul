import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { applyEvent, DEFAULT_CONFIG } from "../services/reputation-engine.js";
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

  // Admin reset — requires Authorization: Bearer <RESET_SECRET>
  app.post(
    "/reset",
    {
      schema: {
        body: z.object({ pubkeys: z.array(z.string()).min(1) }),
      },
    },
    async (req, reply) => {
      const secret = process.env.RESET_SECRET;
      if (!secret) return reply.code(403).send({ error: "Reset not enabled" });
      const auth = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (auth !== secret) return reply.code(401).send({ error: "Unauthorized" });

      const { pubkeys } = req.body as { pubkeys: string[] };
      const reset = await Promise.all(
        pubkeys.map((pk) =>
          prisma.agentReputation.upsert({
            where: { agentPubkey: pk },
            update: { legsCompleted: 0, legsAccepted: 0, avgDeliveryTimeSec: 0, reliabilityScore: 50 },
            create: { agentPubkey: pk, legsCompleted: 0, legsAccepted: 0, avgDeliveryTimeSec: 0, reliabilityScore: 50 },
          }),
        ),
      );
      return { reset: reset.map((r) => ({ agentPubkey: r.agentPubkey, reliabilityScore: r.reliabilityScore })) };
    },
  );

  app.get(
    "/:pubkey/history",
    { schema: { params: ReputationPubkeyParam } },
    async (req) => {
      const { pubkey } = req.params as RepParams;

      // Gather every leg completion event from both digital and physical tracks
      const [digitalLegs, physicalLegs] = await Promise.all([
        prisma.digitalLeg.findMany({
          where: { agentPubkey: pubkey, status: "completed", completedAt: { not: null } },
          select: { completedAt: true },
        }),
        prisma.leg.findMany({
          where: { agentPubkey: pubkey, status: "completed", completedAt: { not: null } },
          select: { completedAt: true },
        }),
      ]);

      type RepEvent = {
        timestamp: number;
        legsCompleted: number;
        score: number;
      };

      // Merge and sort all completions chronologically
      const completions: number[] = [
        ...digitalLegs.map((l) => l.completedAt!.getTime()),
        ...physicalLegs.map((l) => l.completedAt!.getTime()),
      ].sort((a, b) => a - b);

      if (completions.length === 0) return { pubkey, events: [] };

      // Replay the reputation engine formula for each completion
      // Matches the exact logic in services/reputation.ts
      let score = DEFAULT_CONFIG.baseScore;
      const events: RepEvent[] = completions.map((tsMs) => {
        score = applyEvent(score, { kind: "ContractCompleted", timestamp: tsMs });
        return {
          timestamp: Math.floor(tsMs / 1000),
          legsCompleted: 0, // unused by frontend
          score: Math.round(score * 1000) / 10,
        };
      });

      return { pubkey, events };
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
