/**
 * API stress test: measures throughput and latency under concurrent load.
 *
 * Run: bunx tsx scripts/stress-test.ts [--concurrency=20] [--duration=10]
 *
 * Requires the API to be running at $SWARMHAUL_API (default: http://localhost:3001)
 * and seeded with demo data (run seed-demo-db.ts first).
 */

const API = process.env.SWARMHAUL_API ?? "http://localhost:3001";

const args = process.argv.slice(2);
const CONCURRENCY = Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 20);
const DURATION_SEC = Number(args.find((a) => a.startsWith("--duration="))?.split("=")[1] ?? 10);

interface EndpointSpec {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: () => Record<string, unknown>;
}

const READ_ENDPOINTS: EndpointSpec[] = [
  { name: "GET /health",              method: "GET",  path: "/health" },
  { name: "GET /packages",            method: "GET",  path: "/packages" },
  { name: "GET /economy/stats",       method: "GET",  path: "/economy/stats" },
  { name: "GET /economy/activity",    method: "GET",  path: "/economy/activity" },
  { name: "GET /reputation/leaderboard", method: "GET", path: "/reputation/leaderboard" },
  { name: "GET /mcp/tools",           method: "GET",  path: "/mcp/tools" },
];

const WRITE_ENDPOINTS: EndpointSpec[] = [
  {
    name: "POST /packages (create)",
    method: "POST",
    path: "/packages",
    body: () => ({
      shipperPubkey: `stress-shipper-${Math.random().toString(36).slice(2, 8)}`,
      originLat: 48.137 + Math.random() * 0.04,
      originLng: 11.55 + Math.random() * 0.08,
      destLat: 48.137 + Math.random() * 0.04,
      destLng: 11.55 + Math.random() * 0.08,
      description: `Stress test package ${Date.now()}`,
      weightKg: 1 + Math.random() * 10,
      volumeLitres: 1 + Math.random() * 20,
      maxBudgetSol: 0.5 + Math.random() * 1,
    }),
  },
];

const includeWrites = args.includes("--writes");
const ENDPOINTS = includeWrites ? [...READ_ENDPOINTS, ...WRITE_ENDPOINTS] : READ_ENDPOINTS;

interface RequestResult {
  endpoint: string;
  status: number;
  latencyMs: number;
  ok: boolean;
}

async function fireRequest(spec: EndpointSpec): Promise<RequestResult> {
  const start = performance.now();
  try {
    const opts: RequestInit = {
      method: spec.method,
      headers: { "Content-Type": "application/json" },
    };
    if (spec.body) opts.body = JSON.stringify(spec.body());

    const res = await fetch(`${API}${spec.path}`, opts);
    // Consume body to release connection
    await res.text();

    return {
      endpoint: spec.name,
      status: res.status,
      latencyMs: performance.now() - start,
      ok: res.ok,
    };
  } catch {
    return {
      endpoint: spec.name,
      status: 0,
      latencyMs: performance.now() - start,
      ok: false,
    };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  // Verify API is reachable
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  } catch (err) {
    console.error(`Cannot reach API at ${API} — is it running?`);
    process.exit(1);
  }

  console.log(`\nSwarmHaul API Stress Test`);
  console.log(`========================`);
  console.log(`Target:      ${API}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Duration:    ${DURATION_SEC}s`);
  console.log(`Endpoints:   ${ENDPOINTS.length}`);
  console.log();

  const results: RequestResult[] = [];
  const endTime = Date.now() + DURATION_SEC * 1000;
  let inflight = 0;

  async function worker() {
    while (Date.now() < endTime) {
      const spec = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      inflight++;
      const result = await fireRequest(spec);
      inflight--;
      results.push(result);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  const globalStart = Date.now();
  await Promise.all(workers);
  const totalTimeSec = (Date.now() - globalStart) / 1000;

  // Aggregate stats
  const total = results.length;
  const successes = results.filter((r) => r.ok).length;
  const failures = total - successes;
  const allLatencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  console.log(`Results`);
  console.log(`-------`);
  console.log(`Total requests:  ${total}`);
  console.log(`Successes:       ${successes} (${((successes / total) * 100).toFixed(1)}%)`);
  console.log(`Failures:        ${failures}`);
  console.log(`Duration:        ${totalTimeSec.toFixed(1)}s`);
  console.log(`Throughput:      ${(total / totalTimeSec).toFixed(1)} req/s`);
  console.log();
  console.log(`Latency (ms)     p50     p90     p95     p99     max`);
  console.log(
    `  overall       ${percentile(allLatencies, 50).toFixed(0).padStart(5)}   ${percentile(allLatencies, 90).toFixed(0).padStart(5)}   ${percentile(allLatencies, 95).toFixed(0).padStart(5)}   ${percentile(allLatencies, 99).toFixed(0).padStart(5)}   ${percentile(allLatencies, 100).toFixed(0).padStart(5)}`,
  );

  // Per-endpoint breakdown
  console.log();
  console.log(`Per-endpoint breakdown:`);
  for (const spec of ENDPOINTS) {
    const epResults = results.filter((r) => r.endpoint === spec.name);
    if (epResults.length === 0) continue;
    const epLatencies = epResults.map((r) => r.latencyMs).sort((a, b) => a - b);
    const epFails = epResults.filter((r) => !r.ok).length;
    console.log(
      `  ${spec.name.padEnd(32)} n=${String(epResults.length).padStart(5)}  p50=${percentile(epLatencies, 50).toFixed(0).padStart(4)}ms  p99=${percentile(epLatencies, 99).toFixed(0).padStart(4)}ms  err=${epFails}`,
    );
  }

  // Status code distribution
  const statusCounts = new Map<number, number>();
  for (const r of results) {
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
  }
  console.log();
  console.log(`Status codes:`);
  for (const [status, count] of [...statusCounts.entries()].sort()) {
    console.log(`  ${status}: ${count}`);
  }

  // Exit with error if failure rate > 5%
  if (failures / total > 0.05) {
    console.error(`\nFAIL: error rate ${((failures / total) * 100).toFixed(1)}% exceeds 5% threshold`);
    process.exit(1);
  }

  console.log(`\nPASS`);
}

main().catch((err) => {
  console.error("stress-test error:", err);
  process.exit(1);
});
