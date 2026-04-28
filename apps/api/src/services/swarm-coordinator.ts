import { PublicKey } from "@solana/web3.js";
import { coordinatorFormAndAssignSwarm, coordinatorSettleSwarm } from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { broadcast } from "./ws-broadcaster.js";
import { findOptimalRelayChain } from "./route-optimizer.js";
import { getSolana, explorerTxUrl } from "./solana.js";
import { allocateReputationWeightedPayments } from "./reputation-engine.js";
import { updateReputationOnPhysicalLegComplete } from "./reputation.js";

const SWARM_FORMATION_TTL_MS = 15 * 60 * 1000;
const MIN_BIDS_FOR_EVALUATION = 1;
const SOL_TO_LAMPORTS = 1_000_000_000n;

function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

/**
 * Called after a new bid is submitted. If a viable relay chain exists,
 * forms the swarm both in the database AND on-chain via form_swarm +
 * assign_leg in a single Solana transaction signed by the coordinator.
 *
 * Wrapped in a Prisma serializable transaction to prevent duplicate
 * swarm creation under concurrent bid storms.
 */
export async function evaluateSwarmFormation(packageId: string): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const pkg = await tx.package.findUnique({
        where: { id: packageId },
        include: { swarm: true },
      });

      if (!pkg || pkg.status !== "listed" || pkg.swarm) return null;
      if (!pkg.onChainPackage) {
        console.warn(
          `[coordinator] package ${packageId} has no on-chain account yet — skipping`,
        );
        return null;
      }

      const bids = await tx.bid.findMany({
        where: { packageId, expiresAt: { gt: new Date() } },
      });
      if (bids.length < MIN_BIDS_FOR_EVALUATION) return null;

      // Fetch reputation for every bidder up front — used both by the
      // optimizer (for a small bounded nudge toward higher-rep chains)
      // and by the payment allocator (for surplus distribution).
      const bidderPubkeys = Array.from(new Set(bids.map((b) => b.agentPubkey)));
      const reputationRows = await tx.agentReputation.findMany({
        where: { agentPubkey: { in: bidderPubkeys } },
      });
      const repMap = new Map<string, number>(
        reputationRows.map((r) => [r.agentPubkey, r.reliabilityScore / 100]),
      );

      const chain = findOptimalRelayChain(
        { lat: pkg.originLat, lng: pkg.originLng },
        { lat: pkg.destLat, lng: pkg.destLng },
        bids.map((b) => ({
          bidId: b.id,
          agentPubkey: b.agentPubkey,
          pickupLat: b.pickupLat,
          pickupLng: b.pickupLng,
          dropoffLat: b.dropoffLat,
          dropoffLng: b.dropoffLng,
          costSol: b.costSol,
          distanceKm: b.distanceKm,
        })),
        pkg.maxBudgetSol,
        { reputationScores: repMap },
      );

      if (!chain) return null;
      const allocation = allocateReputationWeightedPayments(
        chain.bids.map((b) => ({ agentPubkey: b.agentPubkey, bidSol: b.costSol })),
        repMap,
        pkg.maxBudgetSol,
      );
      const paymentByAgent = new Map(
        allocation.payments.map((p) => [p.agentPubkey, p.totalSol]),
      );

      // Mark package status atomically; the on-chain call happens AFTER
      // commit so we can't double-form even under race conditions.
      const swarm = await tx.swarm.create({
        data: {
          packageId,
          totalCostSol: allocation.totalPaidSol,
          status: "forming",
          legs: {
            create: chain.bids.map((bid, index) => ({
              legIndex: index,
              agentPubkey: bid.agentPubkey,
              pickupLat: bid.pickupLat,
              pickupLng: bid.pickupLng,
              dropoffLat: bid.dropoffLat,
              dropoffLng: bid.dropoffLng,
              distanceKm: bid.distanceKm,
              estimatedDurationMin: Math.round((bid.distanceKm / 30) * 60),
              agreedPaymentSol: paymentByAgent.get(bid.agentPubkey) ?? bid.costSol,
              status: "pending",
            })),
          },
        },
        include: { legs: true },
      });

      await tx.package.update({
        where: { id: packageId },
        data: { status: "swarm_forming" },
      });

      return { pkg, swarm, chain, allocation };
    },
    { isolationLevel: "Serializable", timeout: 10_000 },
  );

  if (!result) return;
  const { pkg, swarm, chain, allocation } = result;

  // Now make the on-chain call. If this fails, we mark the swarm as failed
  // but don't roll back the DB row (lets us retry / debug).
  try {
    const { sdk, coordinator } = getSolana();
    const onChainPkg = new PublicKey(pkg.onChainPackage!);

    const paymentByAgent = new Map(
      allocation.payments.map((p) => [p.agentPubkey, p.totalSol]),
    );
    const { swarm: swarmPda, signature } = await coordinatorFormAndAssignSwarm(
      sdk,
      coordinator,
      onChainPkg,
      solToLamports(allocation.totalPaidSol),
      chain.bids.map((bid) => ({
        courier: new PublicKey(bid.agentPubkey),
        paymentLamports: solToLamports(
          paymentByAgent.get(bid.agentPubkey) ?? bid.costSol,
        ),
      })),
    );

    // Persist on-chain addresses + per-leg PDAs. Once form_swarm +
    // assign_leg land, on-chain `SwarmAccount.status` is `Active`, so
    // the DB mirror should move from `forming` → `active` too. Without
    // this the dashboard's second status pill is stuck on "forming"
    // all the way until settle.
    await prisma.swarm.update({
      where: { id: swarm.id },
      data: {
        onChainSwarm: swarmPda.toBase58(),
        formSignature: signature,
        status: "active",
      },
    });

    // Update each leg with its on-chain address
    const { legPda } = await import("@swarmhaul/sdk");
    for (const leg of swarm.legs) {
      const [lPda] = legPda(swarmPda, leg.legIndex);
      await prisma.leg.update({
        where: { id: leg.id },
        data: { onChainLeg: lPda.toBase58() },
      });
    }

    // Mirror on-chain reputation to Postgres — assign_leg bumped legsAccepted for each courier
    for (const bid of chain.bids) {
      await prisma.agentReputation.upsert({
        where: { agentPubkey: bid.agentPubkey },
        create: {
          agentPubkey: bid.agentPubkey,
          legsAccepted: 1,
          legsCompleted: 0,
          reliabilityScore: 0,
        },
        update: {
          legsAccepted: { increment: 1 },
        },
      });
    }

    console.log(
      `[coordinator] swarm formed on-chain: ${swarmPda.toBase58()} — ${explorerTxUrl(signature)}`,
    );

    broadcast({
      type: "SWARM_FORMED",
      swarm: {
        id: swarm.id,
        packageId: swarm.packageId,
        legs: swarm.legs.map((l) => ({
          id: l.id,
          swarmId: l.swarmId,
          agentPubkey: l.agentPubkey,
          pickupLocation: { lat: l.pickupLat, lng: l.pickupLng },
          dropoffLocation: { lat: l.dropoffLat, lng: l.dropoffLng },
          distanceKm: l.distanceKm,
          estimatedDurationMin: l.estimatedDurationMin,
          agreedPaymentSol: l.agreedPaymentSol,
          status: "pending",
        })),
        totalCostSol: swarm.totalCostSol,
        escrowAccount: swarmPda.toBase58(),
        formedAt: swarm.formedAt,
        status: "active",
      },
    });

    for (const bid of chain.bids) {
      broadcast({
        type: "BID_RECEIVED",
        bid: {
          id: bid.bidId,
          packageId,
          agentPubkey: bid.agentPubkey,
          proposedLeg: {
            id: "",
            swarmId: swarm.id,
            agentPubkey: bid.agentPubkey,
            pickupLocation: { lat: bid.pickupLat, lng: bid.pickupLng },
            dropoffLocation: { lat: bid.dropoffLat, lng: bid.dropoffLng },
            distanceKm: bid.distanceKm,
            estimatedDurationMin: Math.round((bid.distanceKm / 30) * 60),
            agreedPaymentSol: bid.costSol,
            status: "pending",
          },
          costSol: bid.costSol,
          expiresAt: new Date(Date.now() + SWARM_FORMATION_TTL_MS),
        },
      });
    }
  } catch (err) {
    console.error("[coordinator] on-chain swarm formation failed", err);
    await prisma.swarm.update({
      where: { id: swarm.id },
      data: { status: "failed" },
    });
    await prisma.package.update({
      where: { id: packageId },
      data: { status: "listed" }, // allow retry
    });
  }
}

/**
 * Called via webhook after a courier confirms their leg ON-CHAIN
 * (the courier must sign confirm_leg directly — the API only mirrors
 * the resulting state and triggers settlement when all legs are done).
 *
 * Wrapped in serializable tx to prevent double-broadcast under concurrent
 * confirmations.
 */
export async function confirmLegCompletion(
  legId: string,
  agentPubkey: string,
  confirmSignature?: string,
): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const updatedLeg = await tx.leg.update({
        where: { id: legId },
        data: {
          status: "completed",
          completedAt: new Date(),
          confirmSignature,
        },
      });

      // Re-query inside the transaction so we see this leg's update
      const swarm = await tx.swarm.findUnique({
        where: { id: updatedLeg.swarmId },
        include: { legs: true, package: true },
      });
      if (!swarm) return null;

      const allComplete = swarm.legs.every((l) => l.status === "completed");
      const wasAlreadySettled = swarm.status === "settled";
      let packageStatusChanged: "in_transit" | "delivered" | null = null;

      if (allComplete && !wasAlreadySettled) {
        await tx.swarm.update({
          where: { id: swarm.id },
          data: { status: "settled" },
        });
        await tx.package.update({
          where: { id: swarm.packageId },
          data: { status: "delivered", deliveredAt: new Date() },
        });
        packageStatusChanged = "delivered";
      } else if (swarm.package.status === "swarm_forming") {
        // First confirm flips the DB mirror to match the on-chain
        // package.status = InTransit transition that confirm_leg.rs
        // performs. Without this the dashboard sits on "swarm_forming"
        // all the way until the final leg confirms — masking multi-leg
        // progress.
        await tx.package.update({
          where: { id: swarm.packageId },
          data: { status: "in_transit" },
        });
        packageStatusChanged = "in_transit";
      }

      return {
        leg: updatedLeg,
        swarm,
        allComplete: allComplete && !wasAlreadySettled,
        packageStatusChanged,
      };
    },
    { isolationLevel: "Serializable", timeout: 10_000 },
  );

  if (!result) return;
  const { leg, swarm, allComplete, packageStatusChanged } = result;

  if (packageStatusChanged) {
    broadcast({
      type: "PACKAGE_STATUS_CHANGED",
      packageId: swarm.packageId,
      status: packageStatusChanged,
    });
  }

  // Mirror on-chain reputation to Postgres using the canonical reputation engine.
  try {
    await prisma.agentReputation.upsert({
      where: { agentPubkey },
      create: { agentPubkey, legsAccepted: 1, legsCompleted: 1, reliabilityScore: 30 },
      update: { legsCompleted: { increment: 1 } },
    });
    await updateReputationOnPhysicalLegComplete(agentPubkey, true);

    const rep = await prisma.agentReputation.findUnique({ where: { agentPubkey } });
    if (rep) {
      broadcast({
        type: "REPUTATION_UPDATED",
        reputation: {
          agentPubkey,
          legsCompleted: rep.legsCompleted,
          legsAccepted: rep.legsAccepted,
          avgDeliveryTimeSec: 0,
          reliabilityScore: rep.reliabilityScore,
          registeredAt: rep.updatedAt,
        },
      });
    }
  } catch (err) {
    console.error("[coordinator] reputation sync failed", err);
  }

  broadcast({
    type: "LEG_COMPLETED",
    leg: {
      id: leg.id,
      swarmId: leg.swarmId,
      agentPubkey: leg.agentPubkey,
      pickupLocation: { lat: leg.pickupLat, lng: leg.pickupLng },
      dropoffLocation: { lat: leg.dropoffLat, lng: leg.dropoffLng },
      distanceKm: leg.distanceKm,
      estimatedDurationMin: leg.estimatedDurationMin,
      agreedPaymentSol: leg.agreedPaymentSol,
      status: "completed",
    },
  });

  if (allComplete && swarm.onChainSwarm && swarm.package.onChainPackage) {
    // Trigger on-chain settle
    try {
      const { sdk, coordinator } = getSolana();
      const sig = await coordinatorSettleSwarm(
        sdk,
        coordinator,
        new PublicKey(swarm.package.onChainPackage),
        new PublicKey(swarm.onChainSwarm),
        new PublicKey(swarm.package.shipperPubkey),
      );
      console.log(`[coordinator] swarm settled on-chain — ${explorerTxUrl(sig)}`);
    } catch (err) {
      console.error("[coordinator] on-chain settle failed", err);
    }

    broadcast({
      type: "PACKAGE_DELIVERED",
      packageId: swarm.packageId,
    });
  }
}
