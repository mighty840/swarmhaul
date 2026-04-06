import { prisma } from "../db/client.js";
import { broadcast } from "./ws-broadcaster.js";
import { findOptimalRelayChain } from "./route-optimizer.js";
import type { Swarm, Leg } from "@swarmhaul/types";

const SWARM_FORMATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_BIDS_FOR_EVALUATION = 1;

/**
 * Called after a new bid is submitted.
 * Checks if we can form a viable relay chain for the package.
 */
export async function evaluateSwarmFormation(packageId: string): Promise<void> {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { swarm: true },
  });

  if (!pkg || pkg.status !== "listed" || pkg.swarm) return;

  const bids = await prisma.bid.findMany({
    where: {
      packageId,
      expiresAt: { gt: new Date() },
    },
  });

  if (bids.length < MIN_BIDS_FOR_EVALUATION) return;

  // Build relay chain from bids
  const origin = { lat: pkg.originLat, lng: pkg.originLng };
  const destination = { lat: pkg.destLat, lng: pkg.destLng };

  const chain = findOptimalRelayChain(
    origin,
    destination,
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
  );

  if (!chain) return;

  // Create swarm with legs
  const swarm = await prisma.swarm.create({
    data: {
      packageId,
      escrowAccount: `swarm-escrow-${packageId}`, // TODO: real PDA address
      totalCostSol: chain.totalCostSol,
      status: "forming",
      legs: {
        create: chain.bids.map((bid, index) => ({
          agentPubkey: bid.agentPubkey,
          pickupLat: bid.pickupLat,
          pickupLng: bid.pickupLng,
          dropoffLat: bid.dropoffLat,
          dropoffLng: bid.dropoffLng,
          distanceKm: bid.distanceKm,
          estimatedDurationMin: Math.round((bid.distanceKm / 30) * 60),
          agreedPaymentSol: bid.costSol,
          status: "pending",
        })),
      },
    },
    include: { legs: true },
  });

  // Update package status
  await prisma.package.update({
    where: { id: packageId },
    data: { status: "swarm_forming" },
  });

  // Broadcast swarm formation
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
        status: l.status as "pending" | "active" | "completed",
      })),
      totalCostSol: swarm.totalCostSol,
      escrowAccount: swarm.escrowAccount,
      formedAt: swarm.formedAt,
      status: swarm.status as "forming",
    },
  });

  // Notify winning agents
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
}

/**
 * Mark a leg as completed and check if swarm is done.
 */
export async function confirmLegCompletion(
  legId: string,
  agentPubkey: string,
): Promise<void> {
  const leg = await prisma.leg.update({
    where: { id: legId },
    data: { status: "completed", completedAt: new Date() },
    include: { swarm: { include: { legs: true, package: true } } },
  });

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

  // Update reputation
  await prisma.agentReputation.upsert({
    where: { agentPubkey },
    create: {
      agentPubkey,
      legsCompleted: 1,
      legsAccepted: 1,
      reliabilityScore: 100,
    },
    update: {
      legsCompleted: { increment: 1 },
      reliabilityScore: 100, // simplified — recalculate properly later
    },
  });

  // Check if all legs are complete
  const allComplete = leg.swarm.legs.every(
    (l) => l.id === legId || l.status === "completed",
  );

  if (allComplete) {
    await prisma.swarm.update({
      where: { id: leg.swarmId },
      data: { status: "settled" },
    });

    await prisma.package.update({
      where: { id: leg.swarm.packageId },
      data: { status: "delivered", deliveredAt: new Date() },
    });

    broadcast({
      type: "PACKAGE_DELIVERED",
      packageId: leg.swarm.packageId,
    });
  }
}
