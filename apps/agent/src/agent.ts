import { loadConfig } from "./config.js";
import { computeOptimalLeg, detourExceedsLimit } from "./itinerary.js";
import { computeCost } from "./bidder.js";
import { reasonAboutBid } from "./reasoning.js";

const POLL_INTERVAL_MS = 10_000;

async function main() {
  const config = loadConfig();
  console.log(
    `[SwarmHaul Agent] Starting for ${config.vehicle.carMake} ${config.vehicle.carModel}`,
  );
  console.log(`[SwarmHaul Agent] Pubkey: ${config.agentPubkey}`);
  console.log(`[SwarmHaul Agent] API: ${config.apiEndpoint}`);

  while (true) {
    try {
      const res = await fetch(`${config.apiEndpoint}/packages`);
      const openPackages = await res.json();

      for (const pkg of openPackages) {
        if (pkg.status !== "listed") continue;

        const leg = computeOptimalLeg(config.itinerary, pkg);
        if (!leg) continue;

        if (detourExceedsLimit(leg, config.bidSettings)) continue;

        const costSol = computeCost(leg, config.vehicle);

        // LLM reasoning layer — agent decides whether to bid
        const decision = await reasonAboutBid(pkg, leg, costSol, config);
        if (!decision.shouldBid) {
          console.log(
            `[Agent] Skipping ${pkg.id}: ${decision.reasoning}`,
          );
          continue;
        }

        console.log(
          `[Agent] Bidding on ${pkg.id}: ${costSol} SOL — ${decision.reasoning}`,
        );

        await fetch(`${config.apiEndpoint}/bids`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: pkg.id,
            agentPubkey: config.agentPubkey,
            pickupLat: leg.pickupLocation.lat,
            pickupLng: leg.pickupLocation.lng,
            dropoffLat: leg.dropoffLocation.lat,
            dropoffLng: leg.dropoffLocation.lng,
            distanceKm: leg.distanceKm,
            estimatedDurationMin: leg.estimatedDurationMin,
            costSol,
            reasoning: decision.reasoning,
            expiresAt: new Date(
              Date.now() + 15 * 60 * 1000,
            ).toISOString(),
          }),
        });
      }
    } catch (err) {
      console.error("[Agent] Poll error:", err);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch(console.error);
