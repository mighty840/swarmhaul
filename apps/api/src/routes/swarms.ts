import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { PublicKey, Transaction } from "@solana/web3.js";
import { buildConfirmLegIx } from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { confirmLegCompletion } from "../services/swarm-coordinator.js";
import { getSolana } from "../services/solana.js";
import {
  SwarmIdParam,
  LegIdParam,
  LegConfirmBody,
  LegBuildConfirmTxBody,
} from "../schemas/index.js";

type SwarmParams = z.infer<typeof SwarmIdParam>;
type LegParams = z.infer<typeof LegIdParam>;
type LegBody = z.infer<typeof LegConfirmBody>;
type LegBuildConfirmBody = z.infer<typeof LegBuildConfirmTxBody>;

interface LegWithChain {
  legIndex: number;
  swarm: {
    legs: Array<{ legIndex: number; agentPubkey: string; onChainLeg: string | null }>;
    package: { shipperPubkey: string };
  };
}

type RecipientResolution =
  | {
      pubkey: string;
      nextLegOnChain: string | null;
      forbiddenMsg: string;
    }
  | { error: string; status: number };

// Multi-leg handoff auth: for the final leg (legIndex === totalLegs - 1),
// the legitimate recipient is the package shipper. For every earlier
// leg, the legitimate recipient is the *next* leg's assigned courier
// (the next-hop agent attests handoff by signing).
function resolveExpectedRecipient(leg: LegWithChain): RecipientResolution {
  const totalLegs = leg.swarm.legs.length;
  const isFinalLeg = leg.legIndex === totalLegs - 1;
  if (isFinalLeg) {
    return {
      pubkey: leg.swarm.package.shipperPubkey,
      nextLegOnChain: null,
      forbiddenMsg: "Only the shipper can confirm the final leg",
    };
  }
  const nextLeg = leg.swarm.legs.find((l) => l.legIndex === leg.legIndex + 1);
  if (!nextLeg) {
    return {
      error: `Swarm is missing leg ${leg.legIndex + 1} — cannot confirm intermediate handoff`,
      status: 409,
    };
  }
  return {
    pubkey: nextLeg.agentPubkey,
    nextLegOnChain: nextLeg.onChainLeg,
    forbiddenMsg: "Only the next-hop courier can confirm an intermediate leg",
  };
}

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

  // Mirror: shipper or next-hop courier confirms delivery after
  // signing confirm_leg on-chain. `body.agentPubkey` still identifies
  // the courier who earned the payout — it's passed through to the
  // reputation-bump logic, not used for auth.
  app.post(
    "/legs/:legId/confirm",
    { schema: { params: LegIdParam, body: LegConfirmBody } },
    async (req, reply) => {
      const { legId } = req.params as LegParams;
      const body = req.body as LegBody;

      const leg = await prisma.leg.findUnique({
        where: { id: legId },
        include: { swarm: { include: { package: true, legs: true } } },
      });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.status === "completed")
        return reply.code(400).send({ error: "Already completed" });

      const expected = resolveExpectedRecipient(leg);
      if ("error" in expected) return reply.code(expected.status).send({ error: expected.error });

      const claimedRecipient =
        req.authedPubkey ?? body.recipientPubkey ?? expected.pubkey;
      if (claimedRecipient !== expected.pubkey)
        return reply.code(403).send({ error: expected.forbiddenMsg });

      if (leg.agentPubkey !== body.agentPubkey)
        return reply.code(400).send({
          error: "body.agentPubkey must match the leg's assigned courier",
        });

      await confirmLegCompletion(leg.id, body.agentPubkey, body.confirmSignature);
      return { success: true };
    },
  );

  // Build unsigned confirm_leg tx for the recipient's wallet to sign.
  // We don't touch the DB here — persistence happens in the mirror
  // endpoint above once the tx lands on chain.
  app.post(
    "/legs/:legId/build-confirm-tx",
    { schema: { params: LegIdParam, body: LegBuildConfirmTxBody } },
    async (req, reply) => {
      const { legId } = req.params as LegParams;
      const body = req.body as LegBuildConfirmBody;

      const leg = await prisma.leg.findUnique({
        where: { id: legId },
        include: { swarm: { include: { package: true, legs: true } } },
      });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.status === "completed")
        return reply.code(400).send({ error: "Already completed" });

      const pkg = leg.swarm.package;
      if (req.authedPubkey && req.authedPubkey !== body.recipientPubkey)
        return reply.code(403).send({
          error: "recipientPubkey must match authed wallet",
        });
      const expected = resolveExpectedRecipient(leg);
      if ("error" in expected) return reply.code(expected.status).send({ error: expected.error });
      if (body.recipientPubkey !== expected.pubkey)
        return reply.code(403).send({ error: expected.forbiddenMsg });
      if (!leg.onChainLeg || !leg.swarm.onChainSwarm || !pkg.onChainPackage)
        return reply.code(409).send({
          error: "Leg has no on-chain accounts yet — swarm still forming",
        });

      try {
        const { sdk } = getSolana();
        const recipient = new PublicKey(body.recipientPubkey);
        const ix = await buildConfirmLegIx(sdk, {
          recipient,
          courier: new PublicKey(leg.agentPubkey),
          legAccount: new PublicKey(leg.onChainLeg),
          nextLegAccount: expected.nextLegOnChain
            ? new PublicKey(expected.nextLegOnChain)
            : null,
          swarmAccount: new PublicKey(leg.swarm.onChainSwarm),
          packageAccount: new PublicKey(pkg.onChainPackage),
        });

        const { blockhash, lastValidBlockHeight } =
          await sdk.connection.getLatestBlockhash();
        const tx = new Transaction().add(ix);
        tx.feePayer = recipient;
        tx.recentBlockhash = blockhash;

        const serialized = tx
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString("base64");

        return reply.code(200).send({
          transaction: serialized,
          blockhash,
          lastValidBlockHeight,
        });
      } catch (err) {
        app.log.error({ err }, "build_confirm_leg_tx failed");
        return reply.code(500).send({
          error: "Failed to build confirm_leg tx",
          details: String(err),
        });
      }
    },
  );
}
