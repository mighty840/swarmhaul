/**
 * Dev-only seeding routes. Registered from app.ts only when
 * `DEV_ROUTES === "true"` — must NEVER be enabled in production.
 *
 * These helpers exist to make click-through testing of protocol changes
 * tractable without having to wrangle agent itineraries or wait on
 * stochastic bid flows.
 */
import type { FastifyInstance } from "fastify";
import { PublicKey, Transaction } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import { buildListPackageIx, uuidToBytes } from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { getSolana } from "../services/solana.js";
import { evaluateSwarmFormation } from "../services/swarm-coordinator.js";

// Agent pubkeys from /tmp/swarmhaul-e2e/agent-{alpha,bravo}.config.json.
// These are the local dev fixtures; on a different host override via
// DEV_SEED_COURIER_0 / DEV_SEED_COURIER_1 env vars.
const COURIER_0 =
  process.env.DEV_SEED_COURIER_0 ?? "7FBqQRTgCgCrvavzxXRAnug8xiX9NmjaqJXc59KiQFyu";
const COURIER_1 =
  process.env.DEV_SEED_COURIER_1 ?? "961WAsZTgPo8WGUfLum6fW4UqKbjYjUHLJ4SyuGyVvZy";

function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

export async function devRoutes(app: FastifyInstance) {
  // Dev convenience: accept any content-type (or none) for POSTs inside
  // this plugin scope. The routes take no input other than query params,
  // so a bare `curl -X POST http://…/dev/seed-multi-leg` should just
  // work.
  app.addContentTypeParser(
    "*",
    { parseAs: "string" },
    (_req, _body, done) => done(null, {}),
  );

  /**
   * POST /dev/reset-reputation?pubkeys=A,B,C
   *
   * Resets AgentReputation rows for the listed pubkeys back to baseline
   * (reliabilityScore 50, legsCompleted 0, legsAccepted 0). Useful to
   * let external hackathon agents compete fairly after our demo agents
   * have accumulated a head start.
   *
   * If no pubkeys param is given, resets ALL known agents.
   */
  app.post("/reset-reputation", async (req, reply) => {
    const raw = (req.query as Record<string, string>).pubkeys ?? "";
    const targets = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (targets.length === 0) {
      return reply
        .code(400)
        .send({ error: "Provide ?pubkeys=A,B,C — refusing to reset all without explicit list" });
    }

    const results = await Promise.all(
      targets.map((pk) =>
        prisma.agentReputation.upsert({
          where: { agentPubkey: pk },
          update: {
            reliabilityScore: 50,
            legsCompleted: 0,
            legsAccepted: 0,
            avgDeliveryTimeSec: 0,
          },
          create: {
            agentPubkey: pk,
            reliabilityScore: 50,
            legsCompleted: 0,
            legsAccepted: 0,
            avgDeliveryTimeSec: 0,
          },
        }),
      ),
    );

    return { reset: results.map((r) => ({ agentPubkey: r.agentPubkey, reliabilityScore: r.reliabilityScore })) };
  });

  /**
   * POST /dev/seed-multi-leg
   *
   * Creates a 2-leg swarm end-to-end:
   *   1. Lists a package on-chain with the coordinator keypair as the
   *      shipper (so the dashboard's final-leg CONFIRM button fires
   *      whichever wallet is holding the coordinator keypair).
   *   2. Inserts two complementary bids (origin→mid, mid→dest) from
   *      COURIER_0 and COURIER_1. Geometry is chosen so the natural
   *      pool of running agent daemons doesn't overlap (detour > limit),
   *      which keeps the seeded chain deterministic.
   *   3. Triggers `evaluateSwarmFormation` synchronously, which runs
   *      the on-chain `form_swarm` + `assign_leg` instructions using
   *      the coordinator keypair.
   *
   * Returns the resulting package + swarm + legs, plus the dashboard
   * URL to open and instructions for completing the multi-leg confirm
   * flow from here.
   */
  app.post("/seed-multi-leg", async (_req, reply) => {
    const { sdk, coordinator } = getSolana();

    const shipperPubkey = coordinator.publicKey.toBase58();
    const origin = { lat: 48.0, lng: 11.0 };
    const destination = { lat: 48.5, lng: 12.0 };
    const mid = {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
    const maxBudgetSol = 0.2;

    const pkg = await prisma.package.create({
      data: {
        shipperPubkey,
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: destination.lat,
        destLng: destination.lng,
        description: "DEV seed · multi-leg relay (coordinator-as-shipper)",
        weightKg: 3,
        volumeLitres: 10,
        maxBudgetSol,
      },
    });

    try {
      const idBytes = uuidToBytes(pkg.id);
      const { ix, package: pkgPda, vault: vPda } = await buildListPackageIx(sdk, {
        shipper: coordinator.publicKey,
        packageId: idBytes,
        maxBudgetLamports: solToLamports(maxBudgetSol),
        coordinator: coordinator.publicKey,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = coordinator.publicKey;
      const { blockhash } = await sdk.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(coordinator);

      const signature = await sdk.connection.sendRawTransaction(tx.serialize());
      await sdk.connection.confirmTransaction(signature, "confirmed");

      await prisma.package.update({
        where: { id: pkg.id },
        data: {
          onChainPackage: pkgPda.toBase58(),
          onChainVault: vPda.toBase58(),
          listSignature: signature,
        },
      });
    } catch (err) {
      app.log.error({ err }, "dev seed: list_package failed");
      await prisma.package.update({
        where: { id: pkg.id },
        data: { status: "failed" },
      });
      return reply.code(500).send({
        error: "on-chain list_package failed",
        details: String(err),
      });
    }

    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.bid.createMany({
      data: [
        {
          packageId: pkg.id,
          agentPubkey: COURIER_0,
          pickupLat: origin.lat,
          pickupLng: origin.lng,
          dropoffLat: mid.lat,
          dropoffLng: mid.lng,
          distanceKm: 40,
          estimatedDurationMin: 60,
          costSol: 0.04,
          reasoning: "DEV seed · leg 0 (origin → mid)",
          expiresAt,
        },
        {
          packageId: pkg.id,
          agentPubkey: COURIER_1,
          pickupLat: mid.lat,
          pickupLng: mid.lng,
          dropoffLat: destination.lat,
          dropoffLng: destination.lng,
          distanceKm: 40,
          estimatedDurationMin: 60,
          costSol: 0.04,
          reasoning: "DEV seed · leg 1 (mid → dest)",
          expiresAt,
        },
      ],
    });

    try {
      await evaluateSwarmFormation(pkg.id);
    } catch (err) {
      app.log.error({ err }, "dev seed: swarm evaluation failed");
      return reply.code(500).send({
        error: "swarm evaluation failed after seed",
        details: String(err),
      });
    }

    const result = await prisma.package.findUnique({
      where: { id: pkg.id },
      include: {
        swarm: {
          include: { legs: { orderBy: { legIndex: "asc" } } },
        },
      },
    });

    return reply.code(201).send({
      packageId: pkg.id,
      shipperPubkey,
      package: result,
      howToTest: {
        dashboard: "http://localhost:5173 — open DISPATCH, find the newly listed package, click into Swarm Detail to see the 2 legs",
        finalLegRecipient: shipperPubkey,
        intermediateLegRecipient: COURIER_1,
        notes: [
          "Final leg is signed by the coordinator/shipper via the dashboard CONFIRM DELIVERY button — import ~/.config/solana/swarmhaul-devnet.json into Phantom to sign.",
          "Intermediate leg is now auto-signed by the next-hop agent daemon after ~15 s simulated transit.",
        ],
      },
    });
  });

  /**
   * POST /dev/seed-bids?packageId=<uuid>
   *
   * Takes an existing **listed** package (created by a real shipper via
   * the dashboard's Dispatch flow, i.e. Phantom signed list_package) and
   * injects two complementary bids that together form a 2-leg relay from
   * that package's origin to its destination. Then triggers swarm
   * formation.
   *
   * Useful when you want to click through multi-leg as yourself —
   * you stay the shipper (so CONFIRM DELIVERY on the final leg is wired
   * to your wallet), and this helper just supplies the deterministic
   * relay bids the running agent daemons wouldn't naturally produce
   * for a far-apart origin/destination.
   */
  app.post("/seed-bids", async (req, reply) => {
    const { packageId } = (req.query as { packageId?: string }) ?? {};
    if (!packageId) {
      return reply
        .code(400)
        .send({ error: "query param `packageId` required" });
    }

    const pkg = await prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) return reply.code(404).send({ error: "package not found" });
    if (pkg.status !== "listed") {
      return reply.code(409).send({
        error: `package status is '${pkg.status}', must be 'listed' for seed-bids`,
      });
    }
    if (!pkg.onChainPackage || !pkg.onChainVault) {
      return reply.code(409).send({
        error: "package has no on-chain accounts yet — shipper hasn't signed list_package",
      });
    }

    const mid = {
      lat: (pkg.originLat + pkg.destLat) / 2,
      lng: (pkg.originLng + pkg.destLng) / 2,
    };
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    // Cap per-leg cost to half the budget each so the chain fits.
    const perLegSol = Math.max(
      0.001,
      Math.min(0.04, pkg.maxBudgetSol / 2 - 0.001),
    );

    await prisma.bid.createMany({
      data: [
        {
          packageId: pkg.id,
          agentPubkey: COURIER_0,
          pickupLat: pkg.originLat,
          pickupLng: pkg.originLng,
          dropoffLat: mid.lat,
          dropoffLng: mid.lng,
          distanceKm: 40,
          estimatedDurationMin: 60,
          costSol: perLegSol,
          reasoning: "DEV seed · leg 0 (origin → mid)",
          expiresAt,
        },
        {
          packageId: pkg.id,
          agentPubkey: COURIER_1,
          pickupLat: mid.lat,
          pickupLng: mid.lng,
          dropoffLat: pkg.destLat,
          dropoffLng: pkg.destLng,
          distanceKm: 40,
          estimatedDurationMin: 60,
          costSol: perLegSol,
          reasoning: "DEV seed · leg 1 (mid → dest)",
          expiresAt,
        },
      ],
    });

    try {
      await evaluateSwarmFormation(pkg.id);
    } catch (err) {
      app.log.error({ err }, "dev seed-bids: swarm evaluation failed");
      return reply.code(500).send({
        error: "swarm evaluation failed after seeding bids",
        details: String(err),
      });
    }

    const result = await prisma.package.findUnique({
      where: { id: pkg.id },
      include: {
        swarm: {
          include: { legs: { orderBy: { legIndex: "asc" } } },
        },
      },
    });
    return reply.code(201).send({
      packageId: pkg.id,
      shipperPubkey: pkg.shipperPubkey,
      package: result,
      howToTest: {
        note: "You remain the shipper. Once the agent daemon auto-signs the intermediate handoff (~15 s), the CONFIRM DELIVERY button on the final leg is wired to your Phantom wallet — click it to complete the demo.",
        finalLegRecipient: pkg.shipperPubkey,
        intermediateLegRecipient: COURIER_1,
      },
    });
  });
}
