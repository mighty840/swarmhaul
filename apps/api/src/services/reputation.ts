import { prisma } from "../db/client.js";

export async function updateReputationOnDigitalLegComplete(agentPubkey: string): Promise<void> {
  await prisma.agentReputation.upsert({
    where: { agentPubkey },
    create: {
      agentPubkey,
      legsCompleted: 1,
      legsAccepted: 1,
      reliabilityScore: 55,
    },
    update: {
      legsCompleted: { increment: 1 },
      legsAccepted: { increment: 1 },
      // Each digital leg completion nudges reliability up by ~0.5 points (capped at 100)
      reliabilityScore: { increment: 0.5 },
    },
  });
}
