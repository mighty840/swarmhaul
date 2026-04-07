/**
 * Wallet signature auth.
 *
 * Pattern: each mutating request includes three headers:
 *   X-Pubkey:    base58 Solana pubkey
 *   X-Nonce:     unix epoch milliseconds (must be within ±60s of server time)
 *   X-Signature: base58 ed25519 signature over the canonical message
 *
 * Canonical message:
 *   <METHOD>\n<URL>\n<NONCE>\n<SHA256_HEX(BODY)>
 *
 * Server verifies:
 *   1. Nonce is within ±60s window (replay protection)
 *   2. Signature verifies under the pubkey for the canonical message
 *   3. The pubkey is bound to req.authedPubkey for downstream use
 *
 * Toggle via REQUIRE_AUTH env (default: false for demo). When false, requests
 * pass through unauthenticated and req.authedPubkey is null. Routes that need
 * an authed pubkey can fall back to a body field or coordinator-mode.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

const NONCE_WINDOW_MS = 60_000; // ±60s
const seenNonces = new Map<string, number>(); // for replay protection
const SEEN_NONCE_TTL_MS = 120_000;

declare module "fastify" {
  interface FastifyRequest {
    authedPubkey: string | null;
  }
}

export interface AuthOptions {
  required: boolean;
}

export function buildCanonicalMessage(
  method: string,
  url: string,
  nonce: string,
  bodyBytes: Buffer | string,
): string {
  const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");
  return `${method.toUpperCase()}\n${url}\n${nonce}\n${bodyHash}`;
}

export function verifyWalletSignature(
  pubkey: string,
  nonce: string,
  signature: string,
  message: string,
): { ok: true } | { ok: false; reason: string } {
  // 1. Nonce window check
  const nonceMs = Number(nonce);
  if (!Number.isFinite(nonceMs)) {
    return { ok: false, reason: "nonce not numeric" };
  }
  const now = Date.now();
  if (Math.abs(now - nonceMs) > NONCE_WINDOW_MS) {
    return { ok: false, reason: "nonce outside ±60s window" };
  }

  // 2. Replay protection — reject if we've seen this nonce+pubkey already
  const seenKey = `${pubkey}:${nonce}`;
  if (seenNonces.has(seenKey)) {
    return { ok: false, reason: "nonce already used" };
  }

  // 3. Signature verification
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(pubkey);
    sigBytes = bs58.decode(signature);
  } catch {
    return { ok: false, reason: "invalid base58 encoding" };
  }
  if (pubkeyBytes.length !== 32) {
    return { ok: false, reason: "pubkey must be 32 bytes" };
  }
  if (sigBytes.length !== 64) {
    return { ok: false, reason: "signature must be 64 bytes" };
  }

  const messageBytes = new TextEncoder().encode(message);
  const ok = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!ok) return { ok: false, reason: "signature verification failed" };

  // Record nonce as seen
  seenNonces.set(seenKey, now);

  // Periodic cleanup
  if (seenNonces.size > 1000) {
    for (const [k, t] of seenNonces.entries()) {
      if (now - t > SEEN_NONCE_TTL_MS) seenNonces.delete(k);
    }
  }

  return { ok: true };
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Fastify preHandler hook factory.
 *
 * Verifies signature on mutating requests; sets req.authedPubkey if valid.
 * If REQUIRE_AUTH is false, missing headers pass through with authedPubkey
 * = null (demo mode). Bad signatures always 401.
 */
export function authHook(opts: AuthOptions) {
  return async function preHandler(req: FastifyRequest, reply: FastifyReply) {
    req.authedPubkey = null;

    // Read-only requests pass through
    if (!MUTATION_METHODS.has(req.method)) return;

    // MCP discovery + health pass through
    if (req.url === "/health" || req.url === "/mcp/tools") return;

    const pubkey = req.headers["x-pubkey"] as string | undefined;
    const nonce = req.headers["x-nonce"] as string | undefined;
    const signature = req.headers["x-signature"] as string | undefined;

    if (!pubkey || !nonce || !signature) {
      if (!opts.required) return; // demo mode — let through
      return reply
        .code(401)
        .send({ error: "Missing X-Pubkey / X-Nonce / X-Signature headers" });
    }

    // Reconstruct canonical message
    const bodyStr =
      req.body && typeof req.body === "object"
        ? JSON.stringify(req.body)
        : (req.body as string | undefined) ?? "";
    const message = buildCanonicalMessage(req.method, req.url, nonce, bodyStr);

    const result = verifyWalletSignature(pubkey, nonce, signature, message);
    if (!result.ok) {
      return reply.code(401).send({ error: `auth failed: ${result.reason}` });
    }

    req.authedPubkey = pubkey;
  };
}

// Re-export the FastifyReply type so the hook compiles
import type { FastifyReply } from "fastify";
