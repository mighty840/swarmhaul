import { PublicKey, Transaction } from "@solana/web3.js";
import { buildConfirmLegIx } from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { getSolana, explorerTxUrl } from "./solana.js";
import { confirmLegCompletion } from "./swarm-coordinator.js";

// Mirror of the agent default — coordinator waits the same delay before
// confirming final legs so the simulated transit feels real on the dashboard.
const TRANSIT_DELAY_MS = 15_000;

/**
 * Coordinator auto-confirms pending final legs once the simulated transit
 * delay has elapsed. This covers single-leg deliveries (and any multi-leg
 * delivery's last leg) where there is no successor courier to attest handoff.
 *
 * On-chain rule: final leg recipient == package.shipper == coordinator.
 */
export async function coordinatorAutoConfirm(): Promise<void> {
  const { sdk, coordinator } = getSolana();

  const swarms = await prisma.swarm.findMany({
    where: { status: "active" },
    include: {
      legs: true,
      package: true,
    },
  });

  for (const swarm of swarms) {
    if (!swarm.formedAt || !swarm.onChainSwarm) continue;

    const formedAt = new Date(swarm.formedAt).getTime();
    if (Date.now() - formedAt < TRANSIT_DELAY_MS) continue;

    const totalLegs = swarm.legs.length;
    if (totalLegs === 0) continue;

    const finalLeg = swarm.legs.find((l) => l.legIndex === totalLegs - 1);
    if (!finalLeg || finalLeg.status !== "pending") continue;
    if (!finalLeg.onChainLeg) continue;

    // All prior legs must be confirmed before we can confirm the final one
    const allPriorDone = swarm.legs
      .filter((l) => l.legIndex < finalLeg.legIndex)
      .every((l) => l.status === "completed");
    if (!allPriorDone) continue;

    console.log(
      `[auto-confirm] confirming final leg ${finalLeg.id} (index ${finalLeg.legIndex}/${totalLegs - 1}) for swarm ${swarm.id}`,
    );

    try {
      const ix = await buildConfirmLegIx(sdk, {
        recipient: coordinator.publicKey,
        courier: new PublicKey(finalLeg.agentPubkey),
        legAccount: new PublicKey(finalLeg.onChainLeg),
        swarmAccount: new PublicKey(swarm.onChainSwarm),
        packageAccount: new PublicKey(swarm.package.onChainPackage!),
        nextLegAccount: null,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = coordinator.publicKey;
      const { blockhash } = await sdk.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(coordinator);

      const signature = await sdk.connection.sendRawTransaction(tx.serialize());
      await sdk.connection.confirmTransaction(signature, "confirmed");

      console.log(`[auto-confirm] confirmed on-chain: ${explorerTxUrl(signature)}`);

      await confirmLegCompletion(finalLeg.id, finalLeg.agentPubkey, signature);
    } catch (err) {
      console.error(`[auto-confirm] failed for leg ${finalLeg.id}:`, err);
    }
  }
}
