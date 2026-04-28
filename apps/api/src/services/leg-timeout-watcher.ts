import { prisma } from "../db/client.js";
import { broadcast } from "./ws-broadcaster.js";
import { updateReputationOnPhysicalLegComplete } from "./reputation.js";

// Grace period: 2× the estimated duration before auto-dispute kicks in.
const GRACE_MULTIPLIER = 2;

export async function watchLegTimeouts(): Promise<void> {
  const now = new Date();

  // Find all active swarms with legs that are stuck pending/in_progress.
  // Use swarm.formedAt as the start reference — legs become active when
  // the swarm forms on-chain.
  const swarms = await prisma.swarm.findMany({
    where: { status: "active" },
    include: {
      legs: { where: { status: { in: ["pending", "in_progress"] } } },
      package: true,
    },
  });

  for (const swarm of swarms) {
    if (!swarm.formedAt) continue;

    for (const leg of swarm.legs) {
      const deadlineMs =
        new Date(swarm.formedAt).getTime() +
        leg.estimatedDurationMin * 60 * 1000 * GRACE_MULTIPLIER;

      if (now.getTime() < deadlineMs) continue;

      // Leg is past its deadline — auto-dispute
      console.warn(
        `[timeout] leg ${leg.id} stuck in '${leg.status}' for ${Math.round((now.getTime() - deadlineMs) / 60000)} min past deadline — auto-disputing`,
      );

      await prisma.$transaction([
        prisma.leg.update({ where: { id: leg.id }, data: { status: "failed" } }),
        prisma.swarm.update({ where: { id: swarm.id }, data: { status: "failed" } }),
        prisma.package.update({ where: { id: swarm.packageId }, data: { status: "listed" } }),
      ]);

      try {
        await updateReputationOnPhysicalLegComplete(leg.agentPubkey, false);
      } catch (err) {
        console.error("[timeout] reputation update failed", err);
      }

      broadcast({
        type: "LEG_DISPUTED",
        legId: leg.id,
        swarmId: swarm.id,
        packageId: swarm.packageId,
        courierPubkey: leg.agentPubkey,
        reason: "Auto-timeout: leg exceeded estimated duration × 2",
      });
    }
  }
}
