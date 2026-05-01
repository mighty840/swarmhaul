import bs58 from "bs58";
import { Connection } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { loadKeypair } from "./wallet.js";
import { computeOptimalLeg, detourExceedsLimit } from "./itinerary.js";
import { computeCost } from "./bidder.js";
import { reasonAboutBid } from "./reasoning.js";
import { buildAuthHeaders, canonicalPath } from "./signed-fetch.js";
import {
  createExecutorState,
  runExecutorPass,
  type ExecutorPackage,
} from "./executor.js";
import { runDigitalWorkerPass } from "./digital-worker.js";

const POLL_INTERVAL_MS = 10_000;

async function main() {
  const config = loadConfig();
  const keypair = loadKeypair(config.keypairPath);
  const walletPubkey = bs58.encode(keypair.publicKey.toBytes());

  // If the config's agentPubkey disagrees with the keypair file, prefer
  // the wallet — the server will sig-verify against this pubkey.
  const agentPubkey =
    config.agentPubkey === walletPubkey ? config.agentPubkey : walletPubkey;

  console.log(
    `[SwarmHaul Agent] Starting for ${config.vehicle.carMake} ${config.vehicle.carModel}`,
  );
  console.log(`[SwarmHaul Agent] Pubkey: ${agentPubkey}`);
  if (agentPubkey !== config.agentPubkey) {
    console.log(
      `[SwarmHaul Agent]   (config.agentPubkey was ${config.agentPubkey}; using keypair pubkey instead)`,
    );
  }
  console.log(`[SwarmHaul Agent] API: ${config.apiEndpoint}`);

  const rpcUrl =
    config.solanaRpcUrl ??
    process.env.SOLANA_RPC_URL ??
    "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const executorState = createExecutorState();
  // Track when we last bid on each package to avoid re-bidding before expiry
  const bidTimestamps = new Map<string, number>();
  const BID_TTL_MS = 14 * 60 * 1000; // re-bid 1 min before the 15-min expiry
  console.log(`[SwarmHaul Agent] Solana RPC: ${rpcUrl}`);
  console.log(
    `[SwarmHaul Agent] Simulated transit delay: ${config.simTransitDelayMs} ms`,
  );

  const isCourier = config.mode === "courier" || config.mode === "both";
  const isDigital = config.mode === "digital" || config.mode === "both";
  console.log(`[SwarmHaul Agent] Mode: ${config.mode} (courier=${isCourier}, digital=${isDigital})`);

  // Advertise mode to the API so the leaderboard can show mode badges.
  fetch(`${config.apiEndpoint}/reputation/${agentPubkey}/mode`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: config.mode }),
  }).catch(() => {});

  while (true) {
    if (isCourier) {
      try {
        const res = await fetch(`${config.apiEndpoint}/packages`);
        const openPackages = await res.json();

        // Execution loop: sign handoff attestations for any leg whose
        // previous-hop courier has dropped to this agent. Runs on every
        // poll using the same /packages snapshot as the bid loop.
        await runExecutorPass({
          packages: openPackages as ExecutorPackage[],
          config,
          keypair,
          connection,
          agentPubkey,
          state: executorState,
        });

        // Prune packages that are no longer open so the map doesn't grow forever
        const openIds = new Set(openPackages.map((p: { id: string }) => p.id));
        for (const id of bidTimestamps.keys()) {
          if (!openIds.has(id)) bidTimestamps.delete(id);
        }

        for (const pkg of openPackages) {
          if (pkg.status !== "listed") continue;

          // Skip if we've already placed a bid that hasn't expired yet
          const lastBid = bidTimestamps.get(pkg.id);
          if (lastBid && Date.now() - lastBid < BID_TTL_MS) continue;

          const leg = computeOptimalLeg(config.itinerary, pkg);
          if (!leg) continue;

          if (detourExceedsLimit(leg, config.bidSettings)) continue;

          const costSol = computeCost(leg, config.vehicle);

          // LLM reasoning layer — agent decides whether to bid
          const decision = await reasonAboutBid(pkg, leg, costSol, config);
          if (!decision.shouldBid) {
            console.log(`[Agent] Skipping ${pkg.id}: ${decision.reasoning}`);
            continue;
          }

          console.log(
            `[Agent] Bidding on ${pkg.id}: ${costSol} SOL — ${decision.reasoning}`,
          );

          const bidUrl = `${config.apiEndpoint}/bids`;
          const bidBody = JSON.stringify({
            packageId: pkg.id,
            agentPubkey,
            pickupLat: leg.pickupLocation.lat,
            pickupLng: leg.pickupLocation.lng,
            dropoffLat: leg.dropoffLocation.lat,
            dropoffLng: leg.dropoffLocation.lng,
            distanceKm: leg.distanceKm,
            estimatedDurationMin: Math.round(leg.estimatedDurationMin),
            costSol,
            reasoning: decision.reasoning,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          });
          const authHeaders = buildAuthHeaders(
            keypair,
            "POST",
            canonicalPath(bidUrl),
            bidBody,
          );

          const bidRes = await fetch(bidUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: bidBody,
          });
          if (!bidRes.ok) {
            const msg = await bidRes.text();
            console.error(
              `[Agent] Bid rejected (${bidRes.status}): ${msg.slice(0, 200)}`,
            );
          } else {
            bidTimestamps.set(pkg.id, Date.now());
          }
        }
      } catch (err) {
        console.error("[Agent] Poll error:", err);
      }
    }

    // Digital task worker pass
    if (isDigital) {
      try {
        await runDigitalWorkerPass(agentPubkey, config);
      } catch (err) {
        console.error("[Agent] Digital worker error:", err);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch(console.error);
