import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";

// Claim window — UTC boundaries
const WINDOW_OPEN  = new Date("2026-05-11T00:00:00.000Z");
const WINDOW_CLOSE = new Date("2026-05-17T23:59:59.999Z");

function windowStatus(): "before" | "open" | "closed" {
  const now = new Date();
  if (now < WINDOW_OPEN)  return "before";
  if (now > WINDOW_CLOSE) return "closed";
  return "open";
}

const ClaimBody = z.object({
  devnetPubkey:  z.string().min(32).max(44),
  mainnetPubkey: z.string().min(32).max(44),
});

export async function rewardClaimRoutes(app: FastifyInstance) {
  // GET /reward-claims/window — current window status + dates + live count (public)
  app.get("/window", async () => {
    const totalClaims = await prisma.rewardClaim.count();
    return {
      status: windowStatus(),
      opensAt:  WINDOW_OPEN.toISOString(),
      closesAt: WINDOW_CLOSE.toISOString(),
      totalClaims,
    };
  });

  // GET /reward-claims/public — all claims, no mainnet addresses (public leaderboard)
  app.get("/public", async () => {
    const claims = await prisma.rewardClaim.findMany({
      orderBy: { devnetEarningsLamports: "desc" },
      select: { id: true, devnetPubkey: true, devnetEarningsLamports: true, claimedAt: true, status: true },
    });
    return claims;
  });

  // GET /reward-claims/my?devnetPubkey=xxx — check own claim status
  app.get("/my", async (req, reply) => {
    const { devnetPubkey } = req.query as { devnetPubkey?: string };
    if (!devnetPubkey) return reply.code(400).send({ error: "devnetPubkey required" });
    const claim = await prisma.rewardClaim.findUnique({ where: { devnetPubkey } });
    if (!claim) return reply.code(404).send({ error: "no claim found" });
    return claim;
  });

  // POST /reward-claims — submit a claim
  app.post("/", { schema: { body: ClaimBody } }, async (req, reply) => {
    const { devnetPubkey, mainnetPubkey } = req.body as z.infer<typeof ClaimBody>;

    if (windowStatus() !== "open") {
      return reply.code(403).send({
        error: "Claim window is not open",
        status: windowStatus(),
        opensAt:  WINDOW_OPEN.toISOString(),
        closesAt: WINDOW_CLOSE.toISOString(),
      });
    }

    // Check for duplicate
    const existing = await prisma.rewardClaim.findUnique({ where: { devnetPubkey } });
    if (existing) {
      return reply.code(409).send({
        error: "Already claimed",
        claim: existing,
      });
    }

    // Sum all completed digital leg payments for this agent
    const legs = await prisma.digitalLeg.findMany({
      where: { agentPubkey: devnetPubkey, status: "completed", paymentLamports: { not: null } },
      select: { paymentLamports: true },
    });
    const devnetEarningsLamports = legs.reduce(
      (sum, l) => sum + (l.paymentLamports ?? 0n),
      0n,
    );

    const claim = await prisma.rewardClaim.create({
      data: { devnetPubkey, mainnetPubkey, devnetEarningsLamports },
    });

    return reply.code(201).send(claim);
  });

  // GET /reward-claims — admin: all claims with computed totals
  // Simple route — no auth (internal only, not exposed in any public-facing docs)
  app.get("/", async () => {
    const claims = await prisma.rewardClaim.findMany({
      orderBy: [{ devnetEarningsLamports: "desc" }, { claimedAt: "asc" }],
    });
    const totalLamports = claims.reduce((s, c) => s + c.devnetEarningsLamports, 0n);
    return {
      totalClaims:   claims.length,
      pendingClaims: claims.filter((c) => c.status === "pending").length,
      paidClaims:    claims.filter((c) => c.status === "paid").length,
      totalLamports: totalLamports.toString(),
      totalSol:      Number(totalLamports) / 1_000_000_000,
      claims,
    };
  });

  // PATCH /reward-claims/:id/mark-paid — admin: mark as paid after distribution
  app.patch("/:id/mark-paid", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { txSig } = req.body as { txSig?: string };
    const claim = await prisma.rewardClaim.findUnique({ where: { id } });
    if (!claim) return reply.code(404).send({ error: "not found" });
    return prisma.rewardClaim.update({
      where: { id },
      data: { status: "paid", paidAt: new Date(), paidTxSig: txSig ?? null },
    });
  });
}
