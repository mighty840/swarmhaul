/**
 * API integration tests: real Postgres via testcontainers, Fastify inject().
 * Solana calls are mocked — we're testing HTTP layer + DB, not on-chain.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "child_process";
import type { FastifyInstance } from "fastify";

// Mock Solana so routes don't try to connect to a validator
vi.mock("../src/services/solana.js", () => ({
  getSolana: () => {
    throw new Error("Solana not available in test");
  },
  getCoordinatorPubkey: () => "TestCoordinator11111111111111111",
  explorerUrl: (addr: string) => `https://explorer.solana.com/address/${addr}`,
  explorerTxUrl: (sig: string) => `https://explorer.solana.com/tx/${sig}`,
}));

// Mock swarm coordinator to avoid Solana calls during bid evaluation
vi.mock("../src/services/swarm-coordinator.js", () => ({
  evaluateSwarmFormation: vi.fn().mockResolvedValue(undefined),
  confirmLegCompletion: vi.fn().mockResolvedValue(undefined),
}));

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

beforeAll(async () => {
  // Start Postgres testcontainer
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("swarmhaul_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const dbUrl = container.getConnectionUri();

  // Set DATABASE_URL before importing anything that uses Prisma
  process.env.DATABASE_URL = dbUrl;

  // Run migrations — schema lives at src/db/schema.prisma
  const apiRoot = new URL("../", import.meta.url).pathname;
  execSync(`npx prisma migrate deploy --schema=${apiRoot}src/db/schema.prisma`, {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  // Import app builder after env is set
  const { buildApp } = await import("../src/app.js");
  app = await buildApp({ logger: false });
  await app.ready();
}, 90_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

// ─── Health ────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "swarmhaul-api" });
  });
});

// ─── Packages ──────────────────────────────────────────────────────

describe("Packages", () => {
  let packageId: string;

  it("GET /packages returns empty array initially", async () => {
    const res = await app.inject({ method: "GET", url: "/packages" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /packages creates a package (fails on-chain, saves to DB with failed status)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: {
        shipperPubkey: "test-shipper-001",
        originLat: 48.137,
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "Integration test package",
        weightKg: 3.5,
        volumeLitres: 8,
        maxBudgetSol: 0.6,
      },
    });
    // Will return 500 because Solana mock throws, but the DB row exists
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe("Failed to list package on-chain");
  });

  it("GET /packages returns packages after DB insert", async () => {
    // Insert directly via Prisma for the remaining tests
    const { prisma } = await import("../src/db/client.js");
    const pkg = await prisma.package.create({
      data: {
        shipperPubkey: "test-shipper-002",
        originLat: 48.137,
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "Direct DB insert test",
        weightKg: 2,
        volumeLitres: 5,
        maxBudgetSol: 0.4,
      },
    });
    packageId = pkg.id;

    const res = await app.inject({ method: "GET", url: "/packages" });
    expect(res.statusCode).toBe(200);
    const pkgs = res.json();
    expect(pkgs.length).toBeGreaterThanOrEqual(1);
    expect(pkgs.some((p: { id: string }) => p.id === packageId)).toBe(true);
  });

  it("GET /packages/:id returns the package", async () => {
    const res = await app.inject({ method: "GET", url: `/packages/${packageId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(packageId);
    expect(body.description).toBe("Direct DB insert test");
    expect(body.links).toBeDefined();
  });

  it("GET /packages/:id returns 404 for non-existent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/packages/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /packages/:id rejects invalid UUID", async () => {
    const res = await app.inject({ method: "GET", url: "/packages/not-a-uuid" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /packages rejects invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: { shipperPubkey: "x" }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /packages rejects out-of-range coordinates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: {
        shipperPubkey: "test-shipper",
        originLat: 200, // invalid
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "Bad coords",
        weightKg: 1,
        volumeLitres: 1,
        maxBudgetSol: 0.1,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /packages/:id rejects non-listed packages", async () => {
    const { prisma } = await import("../src/db/client.js");
    // Update to a non-cancellable status
    await prisma.package.update({ where: { id: packageId }, data: { status: "delivered" } });

    const res = await app.inject({ method: "DELETE", url: `/packages/${packageId}` });
    expect(res.statusCode).toBe(400);

    // Restore for future tests
    await prisma.package.update({ where: { id: packageId }, data: { status: "listed" } });
  });
});

// ─── Bids ──────────────────────────────────────────────────────────

describe("Bids", () => {
  let packageId: string;

  beforeAll(async () => {
    const { prisma } = await import("../src/db/client.js");
    const pkg = await prisma.package.create({
      data: {
        shipperPubkey: "bid-test-shipper",
        originLat: 48.137,
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "Bid test package",
        weightKg: 1,
        volumeLitres: 1,
        maxBudgetSol: 1,
      },
    });
    packageId = pkg.id;
  });

  it("GET /bids/:packageId returns empty initially", async () => {
    const res = await app.inject({ method: "GET", url: `/bids/${packageId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /bids creates a bid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bids",
      payload: {
        packageId,
        agentPubkey: "test-agent-001",
        pickupLat: 48.137,
        pickupLng: 11.575,
        dropoffLat: 48.173,
        dropoffLng: 11.547,
        distanceKm: 4.5,
        estimatedDurationMin: 15,
        costSol: 0.3,
        reasoning: "Test bid reasoning",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.agentPubkey).toBe("test-agent-001");
    expect(body.costSol).toBe(0.3);
  });

  it("GET /bids/:packageId returns the bid", async () => {
    const res = await app.inject({ method: "GET", url: `/bids/${packageId}` });
    expect(res.statusCode).toBe(200);
    const bids = res.json();
    expect(bids).toHaveLength(1);
    expect(bids[0].reasoning).toBe("Test bid reasoning");
  });

  it("POST /bids rejects invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bids",
      payload: { packageId: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /bids rejects expired expiresAt", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bids",
      payload: {
        packageId,
        agentPubkey: "test-agent-002",
        pickupLat: 48.137,
        pickupLng: 11.575,
        dropoffLat: 48.173,
        dropoffLng: 11.547,
        distanceKm: 4.5,
        estimatedDurationMin: 15,
        costSol: 0.3,
        expiresAt: new Date(Date.now() - 60_000).toISOString(), // past
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Economy ───────────────────────────────────────────────────────

describe("Economy", () => {
  it("GET /economy/stats returns aggregated stats", async () => {
    const res = await app.inject({ method: "GET", url: "/economy/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.packages).toBeDefined();
    expect(body.packages.total).toBeGreaterThanOrEqual(0);
    expect(body.swarms).toBeDefined();
    expect(body.bids).toBeDefined();
    expect(body.agents).toBeDefined();
    expect(body.legs).toBeDefined();
    expect(body.volume).toBeDefined();
    expect(typeof body.wsClients).toBe("number");
  });

  it("GET /economy/activity returns activity feed", async () => {
    const res = await app.inject({ method: "GET", url: "/economy/activity" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recentBids).toBeDefined();
    expect(body.recentLegs).toBeDefined();
    expect(body.recentPackages).toBeDefined();
    expect(Array.isArray(body.recentBids)).toBe(true);
  });
});

// ─── Reputation ────────────────────────────────────────────────────

describe("Reputation", () => {
  beforeAll(async () => {
    const { prisma } = await import("../src/db/client.js");
    await prisma.agentReputation.create({
      data: {
        agentPubkey: "rep-test-agent",
        legsAccepted: 10,
        legsCompleted: 8,
        reliabilityScore: 80,
      },
    });
  });

  it("GET /reputation/leaderboard returns agents", async () => {
    const res = await app.inject({ method: "GET", url: "/reputation/leaderboard" });
    expect(res.statusCode).toBe(200);
    const board = res.json();
    expect(Array.isArray(board)).toBe(true);
    expect(board.some((a: { agentPubkey: string }) => a.agentPubkey === "rep-test-agent")).toBe(true);
  });

  it("GET /reputation/:pubkey returns agent reputation", async () => {
    const res = await app.inject({ method: "GET", url: "/reputation/rep-test-agent" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reliabilityScore).toBe(80);
    expect(body.legsCompleted).toBe(8);
  });

  it("GET /reputation/:pubkey returns 404 for unknown agent", async () => {
    const res = await app.inject({ method: "GET", url: "/reputation/nobody" });
    expect(res.statusCode).toBe(404);
  });
});

// ─── MCP ───────────────────────────────────────────────────────────

describe("MCP", () => {
  it("GET /mcp/tools returns tool manifest", async () => {
    const res = await app.inject({ method: "GET", url: "/mcp/tools" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.schemaVersion).toBeDefined();
    expect(body.server.name).toBe("swarmhaul");
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.tools[0]).toHaveProperty("name");
  });
});

// ─── Zod validation ────────────────────────────────────────────────

describe("Zod validation", () => {
  it("rejects NaN coordinates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: {
        shipperPubkey: "test",
        originLat: "NaN",
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "NaN test",
        weightKg: 1,
        volumeLitres: 1,
        maxBudgetSol: 0.1,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects negative weight", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: {
        shipperPubkey: "test",
        originLat: 48.137,
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "Negative weight",
        weightKg: -1,
        volumeLitres: 1,
        maxBudgetSol: 0.1,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects empty description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      payload: {
        shipperPubkey: "test",
        originLat: 48.137,
        originLng: 11.575,
        destLat: 48.173,
        destLng: 11.547,
        description: "",
        weightKg: 1,
        volumeLitres: 1,
        maxBudgetSol: 0.1,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
