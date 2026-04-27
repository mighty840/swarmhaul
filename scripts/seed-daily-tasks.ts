/**
 * Daily task seeder — posts a rotating batch of digital tasks and courier
 * packages so the swarm always has work to bid on.
 *
 * Usage:
 *   bun scripts/seed-daily-tasks.ts              # post one batch now
 *   bun scripts/seed-daily-tasks.ts --loop       # post every 6 hours
 *   bun scripts/seed-daily-tasks.ts --dry-run    # print what would be posted
 *
 * Set SWARMHAUL_API to override the endpoint (default: https://api.swarmhaul.defited.com).
 * Set SHIPPER_PUBKEY to set the shipper address used for all tasks.
 */

const API = process.env.SWARMHAUL_API ?? "https://api.swarmhaul.defited.com";

// Coordinator / demo shipper pubkey — same one used in dev.ts seeding
const SHIPPER =
  process.env.SHIPPER_PUBKEY ?? "CoordVU6t3TCMbCmqkgxaTbGKn3CWHqFrpRsmJ6xppjF";

const DRY_RUN = process.argv.includes("--dry-run");
const LOOP    = process.argv.includes("--loop");
const LOOP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Digital task pool ────────────────────────────────────────────────────────

const DIGITAL_TASKS = [
  {
    title: "Write a Solana protocol comparison",
    description:
      "Research and write a 400-word comparison of SwarmHaul, Fetch.ai, and Ocean Protocol. Focus on on-chain settlement mechanics and agent identity approaches.",
    maxBudgetSol: 0.09,
  },
  {
    title: "Summarise the top 5 MCP tools for Solana agents",
    description:
      "Review the SwarmHaul MCP endpoint at https://api.swarmhaul.defited.com/mcp/tools and write concise descriptions of the 5 most useful tools for a new agent joining the swarm.",
    maxBudgetSol: 0.06,
  },
  {
    title: "Draft a tweet thread about agent reputation systems",
    description:
      "Write a 5-tweet thread explaining how on-chain reputation works in multi-agent protocols. Use SwarmHaul's α=0.7 fairness floor and γ=0.08 swarm nudge as concrete examples.",
    maxBudgetSol: 0.06,
  },
  {
    title: "Analyse the Colosseum Frontier hackathon RFBs",
    description:
      "Summarise RFB-01 (Agent Reputation), RFB-02 (Real-Time Coordination), and RFB-05 (Multi-Agent Orchestration) in 150 words each. Highlight what a winning project needs to demonstrate.",
    maxBudgetSol: 0.09,
  },
  {
    title: "Write agent onboarding documentation",
    description:
      "Create a concise onboarding guide for an AI agent connecting to SwarmHaul for the first time. Cover: registration, MCP tool usage, bidding on digital legs, and checking earnings.",
    maxBudgetSol: 0.09,
  },
  {
    title: "Translate SwarmHaul quickstart to Spanish",
    description:
      "Translate the SwarmHaul agent quickstart guide into Spanish. Keep all technical terms (DID, VC, PDA, lamports) in English. Target audience: Spanish-speaking Solana developers.",
    maxBudgetSol: 0.06,
  },
  {
    title: "Generate 10 creative delivery task descriptions",
    description:
      "Write 10 varied package delivery task descriptions suitable for the SwarmHaul demo swarm. Each should have a realistic origin/destination pair in Munich and a plausible item description (50 chars max each).",
    maxBudgetSol: 0.06,
  },
  {
    title: "Explain Verifiable Credentials for non-technical users",
    description:
      "Write a plain-English explainer (300 words) on how DID + Verifiable Credentials work in the context of autonomous agent identity. No jargon — assume reader knows only what a wallet is.",
    maxBudgetSol: 0.06,
  },
  {
    title: "Research DePIN projects on Solana",
    description:
      "List and briefly describe 5 DePIN (Decentralised Physical Infrastructure) projects currently live on Solana devnet or mainnet. Include their settlement mechanism and agent participation model.",
    maxBudgetSol: 0.09,
  },
  {
    title: "Propose a tokenomics model for swarm incentives",
    description:
      "Design a 3-paragraph tokenomics proposal for a protocol where AI agents earn tokens proportional to their completed task legs and reputation score. Include staking and slashing mechanics.",
    maxBudgetSol: 0.09,
  },
];

// ── Courier package pool (Munich-area routes) ────────────────────────────────

const COURIER_PACKAGES = [
  { desc: "Medical samples, handle with care",     oLat: 48.137, oLng: 11.575, dLat: 48.155, dLng: 11.600, kg: 0.5,  vol: 2,   sol: 0.04 },
  { desc: "Restaurant supply run — chilled goods", oLat: 48.150, oLng: 11.550, dLat: 48.130, dLng: 11.570, kg: 5.0,  vol: 20,  sol: 0.07 },
  { desc: "Electronics repair — fragile",          oLat: 48.165, oLng: 11.580, dLat: 48.120, dLng: 11.545, kg: 1.2,  vol: 5,   sol: 0.06 },
  { desc: "Legal documents — time sensitive",      oLat: 48.120, oLng: 11.570, dLat: 48.170, dLng: 11.610, kg: 0.3,  vol: 1,   sol: 0.05 },
  { desc: "Grocery order — ambient temperature",   oLat: 48.145, oLng: 11.595, dLat: 48.135, dLng: 11.555, kg: 8.0,  vol: 30,  sol: 0.08 },
  { desc: "Art print — rolled tube, handle flat",  oLat: 48.160, oLng: 11.565, dLat: 48.140, dLng: 11.585, kg: 0.8,  vol: 8,   sol: 0.05 },
  { desc: "Computer parts — antistatic bag",       oLat: 48.130, oLng: 11.600, dLat: 48.160, dLng: 11.560, kg: 2.5,  vol: 10,  sol: 0.06 },
  { desc: "Flowers — upright, no heat",            oLat: 48.175, oLng: 11.590, dLat: 48.125, dLng: 11.575, kg: 1.0,  vol: 12,  sol: 0.07 },
  { desc: "Prototype PCB — return after review",   oLat: 48.140, oLng: 11.545, dLat: 48.165, dLng: 11.605, kg: 0.4,  vol: 3,   sol: 0.05 },
  { desc: "Catering supplies — next-day venue",    oLat: 48.115, oLng: 11.580, dLat: 48.155, dLng: 11.530, kg: 15.0, vol: 60,  sol: 0.10 },
];

// ── Posting logic ────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Slight coordinate jitter so tasks don't all stack on the same location
function jitter(v: number, delta = 0.008): number {
  return Math.round((v + (Math.random() - 0.5) * delta) * 10000) / 10000;
}

async function postDigitalTask(t: typeof DIGITAL_TASKS[number]): Promise<void> {
  if (DRY_RUN) {
    console.log(`[DRY] Digital: "${t.title}" — ${t.maxBudgetSol} SOL`);
    return;
  }
  const res = await fetch(`${API}/digital-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipperPubkey: SHIPPER,
      title: t.title,
      description: t.description,
      maxBudgetSol: t.maxBudgetSol,
    }),
  });
  if (res.ok) {
    const data = await res.json() as { id: string; legs: unknown[] };
    console.log(`[Seeder] Digital posted: "${t.title}" id=${data.id} legs=${(data.legs as unknown[]).length}`);
  } else {
    console.error(`[Seeder] Digital failed (${res.status}):`, await res.text());
  }
}

async function postCourierPackage(p: typeof COURIER_PACKAGES[number]): Promise<void> {
  if (DRY_RUN) {
    console.log(`[DRY] Courier: "${p.desc}" ${p.oLat},${p.oLng} → ${p.dLat},${p.dLng} — ${p.sol} SOL`);
    return;
  }
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipperPubkey: SHIPPER,
      originLat: jitter(p.oLat),
      originLng: jitter(p.oLng),
      destLat: jitter(p.dLat),
      destLng: jitter(p.dLng),
      description: p.desc,
      weightKg: p.kg,
      volumeLitres: p.vol,
      maxBudgetSol: p.sol,
    }),
  });
  if (res.ok) {
    const data = await res.json() as { id: string };
    console.log(`[Seeder] Courier posted: "${p.desc}" id=${data.id}`);
  } else {
    console.error(`[Seeder] Courier failed (${res.status}):`, await res.text());
  }
}

async function runBatch(): Promise<void> {
  const now = new Date().toISOString();
  console.log(`\n[Seeder] Posting batch at ${now}`);

  // 3 digital tasks + 4 courier packages per batch — enough to keep the
  // swarm busy without flooding the leaderboard with noise
  const digitalBatch = [pick(DIGITAL_TASKS), pick(DIGITAL_TASKS), pick(DIGITAL_TASKS)];
  const courierBatch = [
    pick(COURIER_PACKAGES),
    pick(COURIER_PACKAGES),
    pick(COURIER_PACKAGES),
    pick(COURIER_PACKAGES),
  ];

  await Promise.all([
    ...digitalBatch.map(postDigitalTask),
    ...courierBatch.map(postCourierPackage),
  ]);

  console.log(`[Seeder] Batch complete.`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

await runBatch();

if (LOOP) {
  console.log(`[Seeder] Loop mode — next batch in ${LOOP_INTERVAL_MS / 3600000}h`);
  setInterval(runBatch, LOOP_INTERVAL_MS);
}
