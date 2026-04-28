import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  coordinatorFormAndAssignTaskSwarm,
  taskLegPda,
} from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { broadcast } from "./ws-broadcaster.js";
import { broadcastMcpNotification } from "./mcp-broadcaster.js";
import { getSolana } from "./solana.js";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

async function maybeFormTaskSwarm(taskId: string): Promise<void> {
  const task = await prisma.digitalTask.findUnique({
    where: { id: taskId },
    include: { legs: { orderBy: { sequence: "asc" } } },
  });
  if (!task?.onChainTask) return;

  const allAssigned = task.legs.every(
    (l) => ["assigned", "in_progress", "completed"].includes(l.status),
  );
  if (!allAssigned) return;

  try {
    const { sdk, coordinator } = getSolana();
    const perLegLamports =
      BigInt(Math.floor(task.maxBudgetSol * LAMPORTS_PER_SOL)) / BigInt(task.legs.length);

    const agents = task.legs.map((l) => ({
      agent: new PublicKey(l.agentPubkey!),
      paymentLamports: perLegLamports,
    }));

    const { taskSwarm, signature: formSig } = await withRetry(() =>
      coordinatorFormAndAssignTaskSwarm(
        sdk,
        coordinator,
        new PublicKey(task.onChainTask!),
        perLegLamports * BigInt(task.legs.length),
        agents,
      ),
    );

    const legUpdates = task.legs.map((l, i) => {
      const [legPda] = taskLegPda(taskSwarm, i);
      return prisma.digitalLeg.update({
        where: { id: l.id },
        data: { onChainLeg: legPda.toBase58(), paymentLamports: perLegLamports },
      });
    });

    await Promise.all([
      prisma.digitalTask.update({ where: { id: taskId }, data: { onChainSwarm: taskSwarm.toBase58() } }),
      ...legUpdates,
    ]);

    console.log(`[bid-window] task swarm formed on-chain — ${taskSwarm.toBase58()} tx ${formSig}`);
  } catch (err) {
    console.error("[bid-window] form_task_swarm failed", err);
  }
}

export async function closeBidWindows(): Promise<void> {
  const now = new Date();

  const expired = await prisma.digitalLeg.findMany({
    where: { status: "bidding", biddingClosesAt: { lte: now } },
    include: { bids: { orderBy: { bidSol: "asc" } } },
  });

  for (const leg of expired) {
    if (leg.bids.length === 0) {
      // No bids arrived — revert to open so agents can try again
      await prisma.digitalLeg.update({
        where: { id: leg.id },
        data: { status: "open", biddingClosesAt: null },
      });
      continue;
    }

    // Winner: lowest bid
    const winner = leg.bids[0];
    const updated = await prisma.digitalLeg.update({
      where: { id: leg.id },
      data: { agentPubkey: winner.agentPubkey, bidSol: winner.bidSol, status: "assigned" },
    });

    broadcast({ type: "DIGITAL_LEG_ASSIGNED", taskId: leg.taskId, leg: updated as never });

    const competedMsg =
      leg.bids.length > 1
        ? ` (beat ${leg.bids.length - 1} competitor${leg.bids.length > 2 ? "s" : ""})`
        : "";
    void broadcastMcpNotification(
      `Leg ${leg.sequence + 1} awarded to ${winner.agentPubkey.slice(0, 8)}… at ${winner.bidSol} SOL${competedMsg}`,
    );

    // If all legs are now assigned, form the on-chain swarm
    void maybeFormTaskSwarm(leg.taskId);
  }
}
