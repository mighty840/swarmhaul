/**
 * Direct DB seed — bypasses API + Solana entirely.
 * Just populates Postgres with realistic rows so the dashboard
 * has lots of stuff to look at for the demo video.
 *
 * Run: DATABASE_URL=... bunx tsx scripts/seed-demo-db.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOCATIONS = {
  marienplatz:       { lat: 48.137, lng: 11.575 },
  hauptbahnhof:      { lat: 48.140, lng: 11.558 },
  englischer_garten: { lat: 48.157, lng: 11.605 },
  olympiapark:       { lat: 48.173, lng: 11.547 },
  schwabing:         { lat: 48.165, lng: 11.580 },
  giesing:           { lat: 48.115, lng: 11.595 },
  pasing:            { lat: 48.150, lng: 11.460 },
  bogenhausen:       { lat: 48.150, lng: 11.620 },
  sendling:          { lat: 48.120, lng: 11.555 },
  neuhausen:         { lat: 48.155, lng: 11.540 },
  haidhausen:        { lat: 48.132, lng: 11.600 },
  westend:           { lat: 48.138, lng: 11.540 },
};

const SHIPPERS = [
  "alice_shipper_9xKq", "bob_shipper_7mPr", "carol_shipper_3vLs",
  "dave_shipper_8nWt", "erin_shipper_2fJu", "frank_shipper_5hYv",
];

const AGENTS = [
  { pk: "PriusBot_j3xdK1BSTdKipChoLP3VgtvyHH8KPRQukSGwzGgWYfo2" },
  { pk: "SprinterBot_6uGtnCax6kF6jcdYXsHyZ7anrgSnZRtUFVciKW347zGU" },
  { pk: "TeslaBot_8wK2MzPxQ7Vn9FrLc5hBpDjE3NyGtHs4XuR1YoA6VbCf" },
  { pk: "CargoBot_4jD7Qr8tZ9XbN2KmLwHpYvE5GcFsRaBnUxT3WqJi6oPh" },
  { pk: "VespaBot_2FhN8rKxQvT9BcLmDy5WpE7JaGzRsXuYoH4VbNqA1iPt" },
  { pk: "MiniBot_9zAxK4jHpNvT7BsLyR3WcE8DmQgFsUoXhY2VbNqJ5iPt" },
  { pk: "UrbanBot_5kPvNxT9HsLyR3WcE8DmQgFjAxK4BfUoXhY2VbNqJ7iPt" },
  { pk: "EcoBot_7tWcE8DmQgFjAxK4kPvNxT9HsLyR3BfUoXhY2VbNqJ5iPy" },
];

const REASONINGS = [
  "Route overlaps with my Marienplatz commute. Detour minimal, profit margin 35%.",
  "Heavy item but my Sprinter has the volume. Worth the slight detour.",
  "Direct route, autonomous mode handles this well. Reputation play.",
  "I've done this neighborhood before — fast and reliable. Premium pricing justified.",
  "Light item, perfect for my fuel-efficient profile. High margin, low effort.",
  "Sprinter capacity is underused this trip. Adding this costs me almost nothing.",
  "Tesla autopilot makes this near-zero effort. Bidding aggressively to build reputation.",
  "Familiar route, reliable timing. Premium for reliability is fair.",
  "Off-peak hours, low traffic. I can beat every other bid.",
  "Fits my existing delivery window. Marginal cost is fuel only.",
  "High-rep agents won't touch this cheap job — my opening to earn reputation.",
  "Bad weather pricing. Smaller vehicles will drop out, I'm raising my rate.",
];

interface PkgSpec {
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
  origin: { lat: number; lng: number };
  dest: { lat: number; lng: number };
}

const PACKAGES: PkgSpec[] = [
  { description: "Vintage vinyl record collection", weightKg: 3.5, volumeLitres: 8,  maxBudgetSol: 0.6, origin: LOCATIONS.marienplatz,    dest: LOCATIONS.englischer_garten },
  { description: "Birthday cake (handle with care)", weightKg: 2,   volumeLitres: 12, maxBudgetSol: 0.4, origin: LOCATIONS.schwabing,      dest: LOCATIONS.bogenhausen },
  { description: "Laptop for repair shop",           weightKg: 2.8, volumeLitres: 5,  maxBudgetSol: 0.5, origin: LOCATIONS.hauptbahnhof,   dest: LOCATIONS.pasing },
  { description: "IKEA flat-pack furniture",         weightKg: 22,  volumeLitres: 80, maxBudgetSol: 1.2, origin: LOCATIONS.olympiapark,    dest: LOCATIONS.giesing },
  { description: "Medical supplies (urgent)",        weightKg: 1.5, volumeLitres: 4,  maxBudgetSol: 0.8, origin: LOCATIONS.marienplatz,    dest: LOCATIONS.pasing },
  { description: "Fresh flowers for wedding",        weightKg: 1.8, volumeLitres: 20, maxBudgetSol: 0.5, origin: LOCATIONS.westend,        dest: LOCATIONS.haidhausen },
  { description: "Legal documents sealed",           weightKg: 0.5, volumeLitres: 1,  maxBudgetSol: 0.7, origin: LOCATIONS.hauptbahnhof,   dest: LOCATIONS.bogenhausen },
  { description: "Craft beer delivery (24 bottles)", weightKg: 15,  volumeLitres: 25, maxBudgetSol: 0.6, origin: LOCATIONS.giesing,        dest: LOCATIONS.schwabing },
  { description: "Artwork (framed, fragile)",        weightKg: 4,   volumeLitres: 30, maxBudgetSol: 0.9, origin: LOCATIONS.haidhausen,     dest: LOCATIONS.neuhausen },
  { description: "Gaming console trade-in",          weightKg: 3,   volumeLitres: 6,  maxBudgetSol: 0.4, origin: LOCATIONS.pasing,         dest: LOCATIONS.sendling },
  { description: "Pharmacy refill (cold chain)",     weightKg: 0.8, volumeLitres: 3,  maxBudgetSol: 0.9, origin: LOCATIONS.sendling,       dest: LOCATIONS.englischer_garten },
  { description: "Auction house artifact",           weightKg: 6,   volumeLitres: 15, maxBudgetSol: 1.1, origin: LOCATIONS.bogenhausen,    dest: LOCATIONS.marienplatz },
  { description: "Sports equipment (bicycle)",       weightKg: 12,  volumeLitres: 60, maxBudgetSol: 0.7, origin: LOCATIONS.olympiapark,    dest: LOCATIONS.hauptbahnhof },
  { description: "Catering order for event",         weightKg: 8,   volumeLitres: 35, maxBudgetSol: 0.8, origin: LOCATIONS.neuhausen,      dest: LOCATIONS.haidhausen },
  { description: "3D printer parts",                 weightKg: 4.5, volumeLitres: 10, maxBudgetSol: 0.5, origin: LOCATIONS.westend,        dest: LOCATIONS.schwabing },
  { description: "Emergency spare key",              weightKg: 0.1, volumeLitres: 0.5,maxBudgetSol: 0.3, origin: LOCATIONS.marienplatz,    dest: LOCATIONS.giesing },
  { description: "Film equipment rental return",     weightKg: 18,  volumeLitres: 45, maxBudgetSol: 1.0, origin: LOCATIONS.schwabing,      dest: LOCATIONS.hauptbahnhof },
  { description: "Lab samples (time-sensitive)",     weightKg: 1,   volumeLitres: 2,  maxBudgetSol: 1.2, origin: LOCATIONS.bogenhausen,    dest: LOCATIONS.pasing },
];

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("🧹 Wiping existing demo data...");
  await prisma.leg.deleteMany({});
  await prisma.swarm.deleteMany({});
  await prisma.bid.deleteMany({});
  await prisma.package.deleteMany({});
  await prisma.agentReputation.deleteMany({});
  await prisma.vehicleProfile.deleteMany({});

  console.log("📦 Creating 18 packages with varied lifecycle states...");

  const lifecycleMix: string[] = [
    "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", // 8 delivered
    "in_transit", "in_transit", "in_transit",  // 3 in transit
    "swarm_forming", "swarm_forming",          // 2 forming
    "listed", "listed", "listed", "listed", "listed", // 5 open
  ];

  const createdPackages: { id: string; status: string; spec: PkgSpec }[] = [];

  for (let i = 0; i < PACKAGES.length; i++) {
    const spec = PACKAGES[i];
    const status = lifecycleMix[i];
    const listedMinutesAgo = Math.floor(rand(5, 240));
    const pkg = await prisma.package.create({
      data: {
        shipperPubkey: pick(SHIPPERS),
        originLat: spec.origin.lat,
        originLng: spec.origin.lng,
        destLat: spec.dest.lat,
        destLng: spec.dest.lng,
        description: spec.description,
        weightKg: spec.weightKg,
        volumeLitres: spec.volumeLitres,
        maxBudgetSol: spec.maxBudgetSol,
        status,
        listedAt: new Date(Date.now() - listedMinutesAgo * 60 * 1000),
        deliveredAt: status === "delivered" ? new Date(Date.now() - Math.floor(listedMinutesAgo / 2) * 60 * 1000) : null,
        onChainPackage: `PkgPDA${i.toString().padStart(2, "0")}${Math.random().toString(36).slice(2, 30)}`,
        onChainVault: `VaultPDA${i.toString().padStart(2, "0")}${Math.random().toString(36).slice(2, 28)}`,
        listSignature: `${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}`,
      },
    });
    createdPackages.push({ id: pkg.id, status, spec });
  }

  console.log(`✓ Created ${createdPackages.length} packages`);

  console.log("💸 Creating bids...");
  let bidCount = 0;
  for (const pkg of createdPackages) {
    const biddingAgents = AGENTS.filter(() => Math.random() > 0.3);
    for (const agent of biddingAgents) {
      const distanceKm = haversine(pkg.spec.origin, pkg.spec.dest);
      const baseCost = distanceKm * rand(0.08, 0.18);
      const costSol = Math.min(pkg.spec.maxBudgetSol * rand(0.5, 0.95), baseCost);
      await prisma.bid.create({
        data: {
          packageId: pkg.id,
          agentPubkey: agent.pk,
          pickupLat: pkg.spec.origin.lat,
          pickupLng: pkg.spec.origin.lng,
          dropoffLat: pkg.spec.dest.lat,
          dropoffLng: pkg.spec.dest.lng,
          distanceKm: +distanceKm.toFixed(2),
          estimatedDurationMin: Math.max(1, Math.round((distanceKm / 30) * 60)),
          costSol: +costSol.toFixed(4),
          reasoning: `[${agent.pk.split("_")[0]}] ${pick(REASONINGS)}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          createdAt: new Date(Date.now() - Math.floor(rand(0, 120)) * 60 * 1000),
        },
      });
      bidCount++;
    }
  }
  console.log(`✓ Created ${bidCount} bids`);

  console.log("🌊 Creating swarms + legs for non-listed packages...");
  let swarmCount = 0;
  let legCount = 0;

  for (const pkg of createdPackages) {
    if (pkg.status === "listed") continue;

    const legCountForSwarm = Math.random() > 0.6 ? 2 : Math.random() > 0.5 ? 3 : 1;
    const totalCostSol = +rand(0.08, pkg.spec.maxBudgetSol * 0.9).toFixed(4);

    const swarmStatus =
      pkg.status === "delivered" ? "settled"
      : pkg.status === "in_transit" ? "active"
      : "forming";

    const swarm = await prisma.swarm.create({
      data: {
        packageId: pkg.id,
        totalCostSol,
        status: swarmStatus,
        onChainSwarm: `SwarmPDA${swarmCount}${Math.random().toString(36).slice(2, 30)}`,
        formSignature: `${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}`,
        formedAt: new Date(Date.now() - Math.floor(rand(5, 200)) * 60 * 1000),
      },
    });
    swarmCount++;

    const legStatus =
      pkg.status === "delivered" ? "completed"
      : pkg.status === "in_transit" ? (Math.random() > 0.5 ? "completed" : "pending")
      : "pending";

    for (let i = 0; i < legCountForSwarm; i++) {
      const agent = pick(AGENTS);
      const distanceKm = haversine(pkg.spec.origin, pkg.spec.dest) / legCountForSwarm;
      await prisma.leg.create({
        data: {
          swarmId: swarm.id,
          legIndex: i,
          agentPubkey: agent.pk,
          pickupLat: pkg.spec.origin.lat + (Math.random() - 0.5) * 0.01,
          pickupLng: pkg.spec.origin.lng + (Math.random() - 0.5) * 0.01,
          dropoffLat: pkg.spec.dest.lat + (Math.random() - 0.5) * 0.01,
          dropoffLng: pkg.spec.dest.lng + (Math.random() - 0.5) * 0.01,
          distanceKm: +distanceKm.toFixed(2),
          estimatedDurationMin: Math.max(1, Math.round((distanceKm / 30) * 60)),
          agreedPaymentSol: +(totalCostSol / legCountForSwarm).toFixed(4),
          status: legStatus,
          completedAt: legStatus === "completed" ? new Date(Date.now() - Math.floor(rand(1, 60)) * 60 * 1000) : null,
          onChainLeg: `LegPDA${legCount}${Math.random().toString(36).slice(2, 30)}`,
          confirmSignature: legStatus === "completed" ? `${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}` : null,
        },
      });
      legCount++;
    }
  }
  console.log(`✓ Created ${swarmCount} swarms and ${legCount} legs`);

  console.log("⭐ Creating agent reputations...");
  const repStats: Record<string, { accepted: number; completed: number }> = {};
  for (const agent of AGENTS) {
    repStats[agent.pk] = { accepted: 0, completed: 0 };
  }

  const allLegs = await prisma.leg.findMany();
  for (const leg of allLegs) {
    if (!repStats[leg.agentPubkey]) repStats[leg.agentPubkey] = { accepted: 0, completed: 0 };
    repStats[leg.agentPubkey].accepted++;
    if (leg.status === "completed") repStats[leg.agentPubkey].completed++;
  }

  for (const [pk, stats] of Object.entries(repStats)) {
    const score = stats.accepted > 0 ? Math.round((stats.completed / stats.accepted) * 100) : 0;
    await prisma.agentReputation.upsert({
      where: { agentPubkey: pk },
      create: {
        agentPubkey: pk,
        legsAccepted: stats.accepted,
        legsCompleted: stats.completed,
        reliabilityScore: score,
        avgDeliveryTimeSec: 0,
      },
      update: {
        legsAccepted: stats.accepted,
        legsCompleted: stats.completed,
        reliabilityScore: score,
      },
    });
  }
  console.log(`✓ Created reputations for ${Object.keys(repStats).length} agents`);

  // Final summary
  const [pkg, swm, bid, rep, completed] = await Promise.all([
    prisma.package.count(),
    prisma.swarm.count(),
    prisma.bid.count(),
    prisma.agentReputation.count(),
    prisma.leg.count({ where: { status: "completed" } }),
  ]);
  const vol = await prisma.swarm.aggregate({ _sum: { totalCostSol: true }, where: { status: "settled" } });

  console.log("\n📊 Final counts:");
  console.log(`   packages:        ${pkg}`);
  console.log(`   swarms:          ${swm}`);
  console.log(`   bids:            ${bid}`);
  console.log(`   agents:          ${rep}`);
  console.log(`   legs completed:  ${completed}`);
  console.log(`   volume settled:  ${vol._sum.totalCostSol ?? 0} SOL`);
  console.log("\n✅ Refresh http://localhost:5173");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
