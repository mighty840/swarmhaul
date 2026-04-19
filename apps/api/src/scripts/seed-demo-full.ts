/**
 * Full demo seed — populates every view with realistic content so the
 * pitch video doesn't need a live dispatch cycle.
 *
 * Run inside the API container:
 *   orca exec swarmhaul-api -- bun run src/scripts/seed-demo-full.ts
 *
 * Or locally against a running Postgres:
 *   DATABASE_URL=... bun run apps/api/src/scripts/seed-demo-full.ts
 *
 * Wipes all domain tables first (Bid, Leg, Swarm, Package,
 * AgentReputation, NegotiationMessage) then inserts a coherent set of
 * 8 agents × 14 packages with various statuses, swarms, legs and bids.
 * Everything is time-stamped across the last ~6 hours so the
 * "recent" UI lists read as a live feed.
 */
import { prisma } from "../db/client.js";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const AGENTS = [
  { pubkey: "7FBqQRTgCgCrvavzxXRAnug8xiX9NmjaqJXc59KiQFyu", score: 22, done: 5, accepted: 23 },
  { pubkey: "961WAsZTgPo8WGUfLum6fW4UqKbjYjUHLJ4SyuGyVvZy", score: 58, done: 26, accepted: 45 },
  { pubkey: "8ba9B9MouLb9QbAzvxcu3ob91zPy5eGA8y21QrraWHHw", score: 87, done: 98, accepted: 113 },
  { pubkey: "4tP3kMZxLbcN7RqS2wGhJk9VxY1uZeAfBnC5XDmY8rQs", score: 72, done: 58, accepted: 81 },
  { pubkey: "BzF1dW5jN6kPqR8uYoT2xLvS4aHgK7cEmDpVyJi3nXoW", score: 44, done: 17, accepted: 39 },
  { pubkey: "Hj9eK3mN7pQrT6uV2xYaB1cDgF8iLoPwS5tUzR4hMnBv", score: 66, done: 41, accepted: 62 },
  { pubkey: "CvX8qL2mN5pR7tY9uW1aB3dEhG4iKoJsP6vZr0sH9cFx", score: 15, done: 3, accepted: 20 },
  { pubkey: "DmR4nT7kQ2pLvY8hB1xWfE3uGc5iNoJaS9tVzL6dFoCn", score: 91, done: 126, accepted: 138 },
];

const MUNICH = { lat: 48.137, lng: 11.575 };
const jitter = (base: number, spread = 0.05) =>
  base + (Math.random() - 0.5) * spread;

const PACKAGES: Array<{
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
  status: "listed" | "swarm_forming" | "in_transit" | "delivered" | "failed";
  listedHoursAgo: number;
  legsCount?: number;
  deliveredHoursAgo?: number;
}> = [
  { description: "Vintage vinyl record collection", weightKg: 3, volumeLitres: 12, maxBudgetSol: 0.8, status: "listed", listedHoursAgo: 0.05 },
  { description: "Emergency spare key — Altstadt → airport", weightKg: 0.05, volumeLitres: 0.2, maxBudgetSol: 0.35, status: "listed", listedHoursAgo: 0.25 },
  { description: "Film equipment rental return", weightKg: 22, volumeLitres: 48, maxBudgetSol: 1.4, status: "swarm_forming", listedHoursAgo: 0.5, legsCount: 1 },
  { description: "Catering order · 12-person event", weightKg: 18, volumeLitres: 70, maxBudgetSol: 1.2, status: "swarm_forming", listedHoursAgo: 0.75, legsCount: 2 },
  { description: "Pharmacy delivery · temperature controlled", weightKg: 1.5, volumeLitres: 4, maxBudgetSol: 0.9, status: "in_transit", listedHoursAgo: 1.25, legsCount: 2 },
  { description: "Gallery installation crate", weightKg: 45, volumeLitres: 120, maxBudgetSol: 2.1, status: "in_transit", listedHoursAgo: 1.75, legsCount: 3 },
  { description: "Lab samples — cryo bag", weightKg: 2.5, volumeLitres: 6, maxBudgetSol: 0.75, status: "in_transit", listedHoursAgo: 2.25, legsCount: 1 },
  { description: "Wedding catering — Westpark", weightKg: 26, volumeLitres: 90, maxBudgetSol: 1.6, status: "delivered", listedHoursAgo: 3.5, deliveredHoursAgo: 2.1, legsCount: 2 },
  { description: "3D printer parts — urgent", weightKg: 6, volumeLitres: 15, maxBudgetSol: 0.55, status: "delivered", listedHoursAgo: 4, deliveredHoursAgo: 3.2, legsCount: 1 },
  { description: "Vinyl pressings for independent label", weightKg: 14, volumeLitres: 22, maxBudgetSol: 0.8, status: "delivered", listedHoursAgo: 4.5, deliveredHoursAgo: 3.8, legsCount: 2 },
  { description: "Sensor kit for research lab", weightKg: 4, volumeLitres: 9, maxBudgetSol: 0.65, status: "delivered", listedHoursAgo: 5.5, deliveredHoursAgo: 4.9, legsCount: 1 },
  { description: "Electric guitar amplifier", weightKg: 24, volumeLitres: 60, maxBudgetSol: 0.95, status: "delivered", listedHoursAgo: 6, deliveredHoursAgo: 5.4, legsCount: 1 },
  { description: "Antique grandfather clock — fragile", weightKg: 38, volumeLitres: 180, maxBudgetSol: 3.2, status: "failed", listedHoursAgo: 4.5 },
  { description: "Kickstarter pledge fulfilment batch", weightKg: 9, volumeLitres: 24, maxBudgetSol: 1.0, status: "delivered", listedHoursAgo: 5, deliveredHoursAgo: 4.3, legsCount: 1 },
];

const REASONING_POOL = [
  "High profit margin, fits vehicle capacity, modest time impact — worth the detour to build reputation.",
  "Extremely high margin, adequate space, minor schedule adjustment. Accepting.",
  "Payload fits comfortably; detour aligns with existing route; clean reputation opportunity.",
  "Profitable leg with short added distance; my hourly rate is already covered.",
  "Weight-to-volume ratio is favourable, and this shipper has reasonable budget headroom.",
  "Marginal profit but excellent reputation-building opportunity with a trusted shipper.",
  "Temperature-controlled compartment available; small detour acceptable.",
  "Route already passes through the corridor — near-zero marginal cost to accept.",
];

async function wipe() {
  await prisma.bid.deleteMany();
  await prisma.leg.deleteMany();
  await prisma.swarm.deleteMany();
  await prisma.package.deleteMany();
  await prisma.agentReputation.deleteMany();
  await prisma.negotiationMessage.deleteMany();
}

function randomReasoning() {
  return REASONING_POOL[Math.floor(Math.random() * REASONING_POOL.length)];
}

function randomFakeSig(): string {
  // 88-char base58-ish string; just visually plausible, not verified anywhere
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 88; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function randomPda(): string {
  const alphabet =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 44; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function seed() {
  console.log("▸ wiping domain tables");
  await wipe();

  console.log("▸ seeding 8 agents");
  for (const a of AGENTS) {
    await prisma.agentReputation.create({
      data: {
        agentPubkey: a.pubkey,
        reliabilityScore: a.score,
        legsCompleted: a.done,
        legsAccepted: a.accepted,
        avgDeliveryTimeSec: 600 + Math.random() * 1800,
      },
    });
  }

  console.log(`▸ seeding ${PACKAGES.length} packages + swarms + bids`);

  for (let i = 0; i < PACKAGES.length; i++) {
    const p = PACKAGES[i];
    const listedAt = hoursAgo(p.listedHoursAgo);

    const origin = {
      lat: jitter(MUNICH.lat, 0.06),
      lng: jitter(MUNICH.lng, 0.1),
    };
    const dest = {
      lat: jitter(MUNICH.lat, 0.06),
      lng: jitter(MUNICH.lng, 0.1),
    };

    const pkg = await prisma.package.create({
      data: {
        shipperPubkey: `demo-shipper-${(i % 4) + 1}`,
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: dest.lat,
        destLng: dest.lng,
        description: p.description,
        weightKg: p.weightKg,
        volumeLitres: p.volumeLitres,
        maxBudgetSol: p.maxBudgetSol,
        status: p.status,
        listedAt,
        deliveredAt: p.deliveredHoursAgo ? hoursAgo(p.deliveredHoursAgo) : null,
        onChainPackage: randomPda(),
        onChainVault: randomPda(),
        listSignature: randomFakeSig(),
      },
    });

    // Bids from 2–4 random agents for every package (including 'listed'
    // so that the Observatory's reasoning stream has content)
    const bidderPool = AGENTS.slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 2 + Math.floor(Math.random() * 3));
    for (let b = 0; b < bidderPool.length; b++) {
      const agent = bidderPool[b];
      const offset = b * 3;
      await prisma.bid.create({
        data: {
          packageId: pkg.id,
          agentPubkey: agent.pubkey,
          pickupLat: origin.lat,
          pickupLng: origin.lng,
          dropoffLat: dest.lat,
          dropoffLng: dest.lng,
          distanceKm: 2 + Math.random() * 18,
          estimatedDurationMin: 5 + Math.floor(Math.random() * 25),
          costSol: Math.max(
            0.005,
            p.maxBudgetSol * (0.3 + Math.random() * 0.6),
          ),
          reasoning: randomReasoning(),
          expiresAt: new Date(listedAt.getTime() + 30 * 60_000),
          createdAt: minutesAgo(p.listedHoursAgo * 60 - offset),
        },
      });
    }

    // Build a swarm + legs for non-listed packages
    if (p.status !== "listed" && p.status !== "failed") {
      const legsCount = p.legsCount ?? 1;
      const chosenAgents = AGENTS.slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, legsCount);

      // Waypoints split origin → dest into N legs
      const waypoints = [
        origin,
        ...Array.from({ length: legsCount - 1 }, (_, k) => ({
          lat: origin.lat + ((dest.lat - origin.lat) * (k + 1)) / legsCount,
          lng: origin.lng + ((dest.lng - origin.lng) * (k + 1)) / legsCount,
        })),
        dest,
      ];

      const swarmStatus =
        p.status === "delivered"
          ? "settled"
          : p.status === "in_transit"
            ? "forming"
            : "forming";
      const formedAt = new Date(listedAt.getTime() + 15 * 60_000);

      const totalCost = p.maxBudgetSol * (0.85 + Math.random() * 0.1);

      const swarm = await prisma.swarm.create({
        data: {
          packageId: pkg.id,
          totalCostSol: totalCost,
          status: swarmStatus,
          onChainSwarm: randomPda(),
          formSignature: randomFakeSig(),
          formedAt,
        },
      });

      for (let li = 0; li < legsCount; li++) {
        const start = waypoints[li];
        const end = waypoints[li + 1];
        const legDistanceKm =
          Math.sqrt(
            Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2),
          ) * 111;
        const legStatus =
          p.status === "delivered"
            ? "completed"
            : p.status === "in_transit" && li === 0
              ? "completed"
              : "pending";

        await prisma.leg.create({
          data: {
            swarmId: swarm.id,
            legIndex: li,
            agentPubkey: chosenAgents[li].pubkey,
            pickupLat: start.lat,
            pickupLng: start.lng,
            dropoffLat: end.lat,
            dropoffLng: end.lng,
            distanceKm: legDistanceKm,
            estimatedDurationMin: Math.max(
              5,
              Math.round((legDistanceKm / 30) * 60),
            ),
            agreedPaymentSol: totalCost / legsCount,
            status: legStatus,
            completedAt: legStatus === "completed" ? hoursAgo(p.deliveredHoursAgo ?? 1) : null,
            confirmSignature: legStatus === "completed" ? randomFakeSig() : null,
            onChainLeg: randomPda(),
          },
        });
      }
    }
  }

  const counts = await Promise.all([
    prisma.package.count(),
    prisma.swarm.count(),
    prisma.leg.count(),
    prisma.bid.count(),
    prisma.agentReputation.count(),
  ]);
  console.log(
    `▸ seeded: packages=${counts[0]} swarms=${counts[1]} legs=${counts[2]} bids=${counts[3]} agents=${counts[4]}`,
  );

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
