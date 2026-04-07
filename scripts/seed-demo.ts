/**
 * Seed demo data: 5 packages, 4 agents bidding on them.
 * Run: bunx tsx scripts/seed-demo.ts
 */

const API = process.env.SWARMHAUL_API ?? "http://localhost:3001";

// Munich coordinates
const LOCATIONS = {
  marienplatz: { lat: 48.137, lng: 11.575 },
  hauptbahnhof: { lat: 48.140, lng: 11.558 },
  englischer_garten: { lat: 48.157, lng: 11.605 },
  olympiapark: { lat: 48.173, lng: 11.547 },
  schwabing: { lat: 48.165, lng: 11.580 },
  giesing: { lat: 48.115, lng: 11.595 },
  pasing: { lat: 48.150, lng: 11.460 },
  bogenhausen: { lat: 48.150, lng: 11.620 },
};

const SHIPPERS = ["alice-shipper", "bob-shipper", "carol-shipper"];

const AGENTS = [
  {
    pubkey: "agent-prius-01",
    name: "PriusBot",
    vehicle: "Toyota Prius",
    rate: 12,
    reasoningStyle: "fuel-efficient",
  },
  {
    pubkey: "agent-sprinter-02",
    name: "SprinterBot",
    vehicle: "Mercedes Sprinter",
    rate: 18,
    reasoningStyle: "high-volume",
  },
  {
    pubkey: "agent-tesla-03",
    name: "TeslaBot",
    vehicle: "Tesla Model Y",
    rate: 15,
    reasoningStyle: "autonomous",
  },
  {
    pubkey: "agent-cargo-04",
    name: "CargoBot",
    vehicle: "Ford Transit",
    rate: 14,
    reasoningStyle: "city-veteran",
  },
];

const PACKAGES = [
  {
    description: "Vintage vinyl record collection",
    weightKg: 3.5,
    volumeLitres: 8,
    maxBudgetSol: 0.6,
    origin: LOCATIONS.marienplatz,
    dest: LOCATIONS.englischer_garten,
  },
  {
    description: "Birthday cake (handle with care)",
    weightKg: 2,
    volumeLitres: 12,
    maxBudgetSol: 0.4,
    origin: LOCATIONS.schwabing,
    dest: LOCATIONS.bogenhausen,
  },
  {
    description: "Laptop for repair shop",
    weightKg: 2.8,
    volumeLitres: 5,
    maxBudgetSol: 0.5,
    origin: LOCATIONS.hauptbahnhof,
    dest: LOCATIONS.pasing,
  },
  {
    description: "IKEA flat-pack furniture",
    weightKg: 22,
    volumeLitres: 80,
    maxBudgetSol: 1.2,
    origin: LOCATIONS.olympiapark,
    dest: LOCATIONS.giesing,
  },
  {
    description: "Medical supplies (urgent)",
    weightKg: 1.5,
    volumeLitres: 4,
    maxBudgetSol: 0.8,
    origin: LOCATIONS.marienplatz,
    dest: LOCATIONS.pasing,
  },
];

const REASONINGS = [
  "Route overlaps with my Marienplatz commute. Detour minimal, profit margin 35%.",
  "Heavy item but my Sprinter has the volume. Worth the slight detour.",
  "Direct route, autonomous mode handles this well. Reputation play.",
  "I've done this neighborhood before — fast and reliable. Premium pricing justified.",
  "Light package, perfect for my fuel-efficient profile. High margin, low effort.",
  "Sprinter capacity is underused this trip. Adding this package costs me almost nothing.",
  "Tesla autopilot makes this near-zero effort. Bidding aggressively to build reputation.",
  "Familiar route, reliable timing. Premium for reliability is fair.",
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
      sinLng *
      sinLng;
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
  return res.json();
}

async function postBid(packageId: string, agent: typeof AGENTS[0], pkg: typeof PACKAGES[0]) {
  const distanceKm = haversine(pkg.origin, pkg.dest);
  const baseCost = (distanceKm / 100) * 4.5 * 1.85 + (distanceKm / 30) * agent.rate;
  const eurToSol = 0.007;
  const costSol = +(baseCost * eurToSol * 1.25).toFixed(4);

  if (costSol > pkg.maxBudgetSol) return null;

  const reasoning = REASONINGS[Math.floor(Math.random() * REASONINGS.length)];

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
      distanceKm,
      estimatedDurationMin: Math.round((distanceKm / 30) * 60),
      costSol,
      reasoning: `[${agent.name}] ${reasoning}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
  });
  return res.json();
}

async function main() {
  console.log("🚀 Seeding SwarmHaul demo data...\n");

  // 1. Post packages
  const packages = [];
  for (const pkg of PACKAGES) {
    const shipper = SHIPPERS[Math.floor(Math.random() * SHIPPERS.length)];
    const created = await postPackage(pkg, shipper);
    console.log(`📦 ${pkg.description} → ${created.id.slice(0, 8)}`);
    packages.push({ ...created, original: pkg });
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n🤖 Agents bidding...\n");

  // 2. Each agent bids on each package
  for (const created of packages) {
    for (const agent of AGENTS) {
      // 70% chance to bid
      if (Math.random() > 0.3) {
        const bid = await postBid(created.id, agent, created.original);
        if (bid) {
          console.log(
            `  ${agent.name} → ${created.original.description.slice(0, 30)}: ${bid.costSol} SOL`,
          );
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  console.log("\n✅ Seed complete!");
  console.log("\n📊 Open http://localhost:5173 to see the Economy Observatory");
}

main().catch(console.error);
