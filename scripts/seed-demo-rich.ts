/**
 * Rich demo seed: 18 packages, 8 agents, mixed lifecycle states.
 * After seeding, completes legs on ~60% of swarms so the dashboard
 * has real delivered counts, volume, and a populated reputation leaderboard.
 *
 * Run: bunx tsx scripts/seed-demo-rich.ts
 */

const API = process.env.SWARMHAUL_API ?? "http://localhost:3001";

// Munich waypoints
const LOCATIONS = {
  marienplatz:      { lat: 48.137, lng: 11.575 },
  hauptbahnhof:     { lat: 48.140, lng: 11.558 },
  englischer_garten:{ lat: 48.157, lng: 11.605 },
  olympiapark:      { lat: 48.173, lng: 11.547 },
  schwabing:        { lat: 48.165, lng: 11.580 },
  giesing:          { lat: 48.115, lng: 11.595 },
  pasing:           { lat: 48.150, lng: 11.460 },
  bogenhausen:      { lat: 48.150, lng: 11.620 },
  sendling:         { lat: 48.120, lng: 11.555 },
  neuhausen:        { lat: 48.155, lng: 11.540 },
  haidhausen:       { lat: 48.132, lng: 11.600 },
  westend:          { lat: 48.138, lng: 11.540 },
};

const SHIPPERS = [
  "alice-shipper", "bob-shipper", "carol-shipper",
  "dave-shipper", "erin-shipper", "frank-shipper",
];

const AGENTS = [
  { pubkey: "agent-prius-01",    name: "PriusBot",    rate: 12, consumption: 4.5 },
  { pubkey: "agent-sprinter-02", name: "SprinterBot", rate: 18, consumption: 9.0 },
  { pubkey: "agent-tesla-03",    name: "TeslaBot",    rate: 15, consumption: 1.5 },
  { pubkey: "agent-cargo-04",    name: "CargoBot",    rate: 14, consumption: 7.0 },
  { pubkey: "agent-vespa-05",    name: "VespaBot",    rate: 8,  consumption: 2.8 },
  { pubkey: "agent-mini-06",     name: "MiniBot",     rate: 10, consumption: 5.2 },
  { pubkey: "agent-urban-07",    name: "UrbanBot",    rate: 11, consumption: 4.2 },
  { pubkey: "agent-eco-08",      name: "EcoBot",      rate: 9,  consumption: 3.1 },
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

const PACKAGES = [
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
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function postPackage(pkg: typeof PACKAGES[0], shipperPubkey: string) {
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipperPubkey,
      originLat: pkg.origin.lat,
      originLng: pkg.origin.lng,
      destLat: pkg.dest.lat,
      destLng: pkg.dest.lng,
      description: pkg.description,
      weightKg: pkg.weightKg,
      volumeLitres: pkg.volumeLitres,
      maxBudgetSol: pkg.maxBudgetSol,
    }),
  });
  return res.json() as Promise<{ id: string; onChainPackage?: string }>;
}

async function postBid(packageId: string, agent: typeof AGENTS[0], pkg: typeof PACKAGES[0]) {
  const distanceKm = haversine(pkg.origin, pkg.dest);
  const baseCost = (distanceKm / 100) * agent.consumption * 1.85 + (distanceKm / 30) * agent.rate;
  const eurToSol = 0.007;
  const costSol = +(baseCost * eurToSol * (1.15 + Math.random() * 0.2)).toFixed(4);

  if (costSol > pkg.maxBudgetSol) return null;

  const reasoning = `[${agent.name}] ${REASONINGS[Math.floor(Math.random() * REASONINGS.length)]}`;

  const res = await fetch(`${API}/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packageId,
      agentPubkey: agent.pubkey,
      pickupLat: pkg.origin.lat,
      pickupLng: pkg.origin.lng,
      dropoffLat: pkg.dest.lat,
      dropoffLng: pkg.dest.lng,
      distanceKm: +distanceKm.toFixed(2),
      estimatedDurationMin: Math.max(1, Math.round((distanceKm / 30) * 60)),
      costSol,
      reasoning,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  return res.json() as Promise<{ id: string }>;
}

async function getPackage(id: string) {
  const res = await fetch(`${API}/packages/${id}`);
  return res.json() as Promise<{
    id: string;
    status: string;
    swarm?: { id: string; legs: Array<{ id: string; agentPubkey: string; status: string }> };
  }>;
}

async function confirmLeg(legId: string, agentPubkey: string) {
  const res = await fetch(`${API}/swarms/legs/${legId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentPubkey }),
  });
  return res.ok;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 Seeding rich demo data...\n");

  // 1. Post all packages
  const created: Array<{ id: string; original: typeof PACKAGES[0] }> = [];
  for (const pkg of PACKAGES) {
    const shipper = SHIPPERS[Math.floor(Math.random() * SHIPPERS.length)];
    const c = await postPackage(pkg, shipper);
    if (c.id) {
      created.push({ id: c.id, original: pkg });
      console.log(`📦 ${pkg.description.slice(0, 42).padEnd(42)} → ${c.id.slice(0, 8)}`);
    }
    await sleep(150);
  }

  console.log(`\n🤖 Agents bidding on ${created.length} packages...\n`);

  // 2. Bid storm
  for (const c of created) {
    const biddingAgents = AGENTS.filter(() => Math.random() > 0.35);
    for (const agent of biddingAgents) {
      const bid = await postBid(c.id, agent, c.original);
      if (bid?.id) {
        process.stdout.write(".");
      }
      await sleep(50);
    }
  }
  console.log("\n\n⏳ Waiting 3s for swarm formation...\n");
  await sleep(3000);

  // 3. Complete legs on ~60% of swarms so we have a mix of lifecycle states
  const toComplete = created.slice(0, Math.floor(created.length * 0.6));
  console.log(`✅ Completing legs on ${toComplete.length} swarms to populate history...\n`);

  let completedCount = 0;
  for (const c of toComplete) {
    const pkg = await getPackage(c.id);
    if (!pkg.swarm) continue;

    // Complete all legs for this swarm
    for (const leg of pkg.swarm.legs) {
      if (leg.status === "pending") {
        const ok = await confirmLeg(leg.id, leg.agentPubkey);
        if (ok) {
          process.stdout.write("✓");
          completedCount++;
        } else {
          process.stdout.write("✗");
        }
        await sleep(200);
      }
    }
  }

  console.log(`\n\n✅ Seed complete! Completed ${completedCount} legs.\n`);

  // 4. Show final stats
  const stats = await (await fetch(`${API}/economy/stats`)).json();
  console.log("📊 Final economy stats:");
  console.log(JSON.stringify(stats, null, 2));
  console.log("\n📺 Open http://localhost:5173 to see the Observatory");
}

main().catch((err) => {
  console.error("seed error:", err);
  process.exit(1);
});
