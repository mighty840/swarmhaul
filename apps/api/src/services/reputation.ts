import { prisma } from "../db/client.js";

const PRIOR = 10;

function bayesianScore(completed: number, accepted: number): number {
  return Math.min(100, Math.round(((completed + PRIOR / 2) / (accepted + PRIOR)) * 100));
}

export async function updateReputationOnDigitalLegComplete(
  agentPubkey: string,
  success: boolean,
): Promise<void> {
  const rep = await prisma.agentReputation.upsert({
    where: { agentPubkey },
    create: {
      agentPubkey,
      legsAccepted: 1,
      legsCompleted: success ? 1 : 0,
      reliabilityScore: success ? bayesianScore(1, 1) : bayesianScore(0, 1),
    },
    update: {
      legsAccepted: { increment: 1 },
      ...(success ? { legsCompleted: { increment: 1 } } : {}),
    },
  });

  const score = bayesianScore(
    success ? rep.legsCompleted + 1 : rep.legsCompleted,
    rep.legsAccepted + 1,
  );

  await prisma.agentReputation.update({
    where: { agentPubkey },
    data: { reliabilityScore: score },
  });
}
