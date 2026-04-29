import { prisma } from "../db/client.js";
import { applyEvent, DEFAULT_CONFIG, type EventKind } from "./reputation-engine.js";

const BASE_SCORE = DEFAULT_CONFIG.baseScore; // 0.3

export async function applyReputationEvent(agentPubkey: string, kind: EventKind): Promise<void> {
  const existing = await prisma.agentReputation.findUnique({ where: { agentPubkey } });

  const currentScore = existing ? existing.reliabilityScore / 100 : BASE_SCORE;
  const newScore = applyEvent(currentScore, { kind, timestamp: Date.now() });
  const storedScore = Math.round(newScore * 1000) / 10; // 3 sig figs, stored as 0-100

  if (!existing) {
    await prisma.agentReputation.create({
      data: {
        agentPubkey,
        legsAccepted: 0,
        legsCompleted: 0,
        reliabilityScore: storedScore,
      },
    });
  } else {
    await prisma.agentReputation.update({
      where: { agentPubkey },
      data: { reliabilityScore: storedScore },
    });
  }
}

export async function updateReputationOnDigitalLegComplete(
  agentPubkey: string,
  success: boolean,
): Promise<void> {
  await prisma.agentReputation.upsert({
    where: { agentPubkey },
    create: {
      agentPubkey,
      legsAccepted: 1,
      legsCompleted: success ? 1 : 0,
      reliabilityScore: Math.round(BASE_SCORE * 1000) / 10,
    },
    update: {
      legsAccepted: { increment: 1 },
      ...(success ? { legsCompleted: { increment: 1 } } : {}),
    },
  });

  await applyReputationEvent(agentPubkey, success ? "ContractCompleted" : "ContractBreached");
}

export async function updateReputationOnPhysicalLegComplete(
  agentPubkey: string,
  success: boolean,
): Promise<void> {
  if (success) {
    await applyReputationEvent(agentPubkey, "ContractCompleted");
  } else {
    await applyReputationEvent(agentPubkey, "ContractBreached");
  }
}
