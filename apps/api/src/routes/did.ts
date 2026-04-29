/**
 * DID + VC resolver routes.
 *
 *   GET /did/:pubkey                 → DID Document for an agent
 *   GET /did/:pubkey/reputation      → signed reputation VC (VC-JWT)
 *   GET /did/coordinator             → coordinator's DID Document
 *                                      (shorthand; resolves via the
 *                                      protocol-authority keypair)
 *   POST /did/verify                 → verify a VC against its issuer
 *
 * All responses are stateless/pure except for `/reputation`, which
 * reads the Postgres mirror of the on-chain AgentReputation PDA.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { getSolana } from "../services/solana.js";
import {
  agentDid,
  buildDidDocument,
  issueReputationVC,
  verifyReputationVC,
  pubkeyFromDid,
} from "../services/did.js";
import { applyReputationEvent } from "../services/reputation.js";

// One VcValidated event per subject per VC lifetime (24h). Prevents a
// self-verify loop from inflating reputation without bound.
const vcValidatedCooldown = new Map<string, number>(); // pubkey → last fired ms
const VC_VALIDATED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const PubkeyParam = z.object({
  pubkey: z.string().min(32).max(44),
});

const VerifyBody = z.object({
  jwt: z.string().min(10),
});

export async function didRoutes(app: FastifyInstance) {
  // Build the VC's service endpoint URL from whatever host handled the
  // request so the DID Document self-describes correctly on api.* and
  // localhost alike.
  function reputationEndpoint(req: {
    protocol: string;
    hostname: string;
  }, pubkey: string): string {
    return `${req.protocol}://${req.hostname}/did/${pubkey}/reputation`;
  }

  app.get(
    "/coordinator",
    async (req) => {
      const { coordinator } = getSolana();
      const pk = coordinator.publicKey.toBase58();
      return buildDidDocument({
        pubkey: pk,
        reputationEndpoint: reputationEndpoint(req, pk),
      });
    },
  );

  app.get(
    "/:pubkey",
    { schema: { params: PubkeyParam } },
    async (req) => {
      const { pubkey } = req.params as { pubkey: string };
      return buildDidDocument({
        pubkey,
        reputationEndpoint: reputationEndpoint(req, pubkey),
      });
    },
  );

  app.get(
    "/:pubkey/reputation",
    { schema: { params: PubkeyParam } },
    async (req, reply) => {
      const { pubkey } = req.params as { pubkey: string };
      const rep = await prisma.agentReputation.findUnique({
        where: { agentPubkey: pubkey },
      });
      if (!rep) {
        return reply.code(404).send({
          error: "agent has no reputation record",
          did: agentDid(pubkey),
        });
      }

      const { coordinator } = getSolana();
      const jwt = issueReputationVC({
        subjectPubkey: pubkey,
        issuerPubkey: coordinator.publicKey.toBase58(),
        issuerSecretKey: coordinator.secretKey,
        claims: {
          legsAccepted: rep.legsAccepted,
          legsCompleted: rep.legsCompleted,
          reliabilityScore: rep.reliabilityScore,
          mirroredAt: rep.updatedAt.toISOString(),
        },
      });

      reply.header("Content-Type", "application/vc+ld+json+jwt");
      return { jwt, issuer: agentDid(coordinator.publicKey.toBase58()) };
    },
  );

  app.post(
    "/verify",
    { schema: { body: VerifyBody } },
    async (req) => {
      const { jwt } = req.body as { jwt: string };
      // Decode enough to know which issuer to check against.
      const parts = jwt.split(".");
      if (parts.length !== 3) {
        return { valid: false, reason: "malformed JWT" };
      }
      let issPubkey: string;
      try {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as { iss?: string };
        if (!payload.iss) return { valid: false, reason: "payload missing iss" };
        issPubkey = pubkeyFromDid(payload.iss);
      } catch {
        return { valid: false, reason: "invalid base64/json payload" };
      }
      const result = verifyReputationVC(jwt, issPubkey);

      // Fire reputation events on the VC subject — best-effort, non-blocking.
      if (result.payload?.sub) {
        try {
          const subjectPubkey = pubkeyFromDid(result.payload.sub);
          if (result.valid) {
            const lastFired = vcValidatedCooldown.get(subjectPubkey) ?? 0;
            if (Date.now() - lastFired > VC_VALIDATED_COOLDOWN_MS) {
              vcValidatedCooldown.set(subjectPubkey, Date.now());
              void applyReputationEvent(subjectPubkey, "VcValidated");
            }
          } else if (result.expired) {
            void applyReputationEvent(subjectPubkey, "VcExpired");
          }
        } catch { /* non-swarmhaul DID — ignore */ }
      }

      return result;
    },
  );
}
