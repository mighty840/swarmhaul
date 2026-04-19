/**
 * Fetch wrapper that signs mutating requests with the agent's ed25519
 * keypair so the API's REQUIRE_AUTH middleware accepts them.
 *
 * Matches the canonical-message contract in apps/api/src/services/auth.ts:
 *   <METHOD>\n<URL>\n<NONCE>\n<SHA256_HEX(BODY)>
 *
 * Returns the signing headers to merge into any fetch call. Callers pass
 * the ALREADY-SERIALISED body string — signing + sha256 must run on the
 * exact bytes the server receives, not a re-stringified object.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import type { Keypair } from "@solana/web3.js";

export interface AuthHeaders {
  "X-Pubkey": string;
  "X-Nonce": string;
  "X-Signature": string;
}

export function buildAuthHeaders(
  keypair: Keypair,
  method: string,
  url: string,
  body: string,
): AuthHeaders {
  const nonce = Date.now().toString();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = `${method.toUpperCase()}\n${url}\n${nonce}\n${bodyHash}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return {
    "X-Pubkey": bs58.encode(keypair.publicKey.toBytes()),
    "X-Nonce": nonce,
    "X-Signature": bs58.encode(signature),
  };
}

/**
 * Canonical-URL helper: the server validates the signature against the
 * URL path including query string, exactly as Fastify reports it on
 * req.url. Strip the origin here so both sides agree.
 */
export function canonicalPath(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return `${u.pathname}${u.search}`;
  } catch {
    return fullUrl;
  }
}
