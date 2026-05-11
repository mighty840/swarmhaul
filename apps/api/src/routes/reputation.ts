import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "../db/client.js";
import { getSolana } from "../services/solana.js";
import { reputationPda } from "@swarmhaul/sdk";
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
    async (req, reply) => {
      const { pubkey } = req.params as RepParams;

      let agentKey: PublicKey;
      try {
        agentKey = new PublicKey(pubkey);
      } catch {
        return reply.code(400).send({ error: "Invalid pubkey" });
      }

      const { sdk } = getSolana();
      const [pda] = reputationPda(agentKey);

      // Fetch up to 100 signatures that wrote to this PDA, newest-first
      let sigs: { signature: string; blockTime?: number | null }[] = [];
      try {
        sigs = await sdk.connection.getSignaturesForAddress(pda, { limit: 100 });
      } catch {
        return reply.code(502).send({ error: "RPC unavailable" });
      }

      if (sigs.length === 0) return { pubkey, events: [] };

      // Fetch transactions in parallel to classify each as assign or confirm
      const txResults = await Promise.allSettled(
        sigs.map((s) =>
          sdk.connection.getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          }),
        ),
      );

      type RepEvent = {
        timestamp: number;
        type: "assign" | "confirm";
        sig: string;
        legsAccepted: number;
        legsCompleted: number;
        score: number;
      };

      // Walk oldest→newest, reconstructing score
      const events: RepEvent[] = [];
      let legsAccepted = 0;
      let legsCompleted = 0;

      // Reverse so we process chronologically
      const ordered = [...sigs].reverse();
      const orderedResults = [...txResults].reverse();

      for (let i = 0; i < ordered.length; i++) {
        const sig = ordered[i];
        const result = orderedResults[i];
        const ts = sig.blockTime ?? 0;

        let type: "assign" | "confirm" = "assign";
        if (result.status === "fulfilled" && result.value) {
          const logs = result.value.meta?.logMessages ?? [];
          const isConfirm = logs.some(
            (l) =>
              l.includes("Instruction: ConfirmLeg") ||
              l.includes("Instruction: ConfirmTaskLeg"),
          );
          type = isConfirm ? "confirm" : "assign";
        }

        if (type === "assign") {
          legsAccepted++;
        } else {
          legsCompleted++;
        }

        const score =
          legsAccepted === 0
            ? 0
            : Math.floor((legsCompleted / legsAccepted) * 100);

        events.push({
          timestamp: ts,
          type,
          sig: sig.signature,
          legsAccepted,
          legsCompleted,
          score,
        });
      }

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
