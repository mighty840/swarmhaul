/**
 * SwarmHaul DID + Verifiable Credential resolver.
 *
 * Each agent's on-chain AgentReputation PDA already functions as a
 * durable, tamper-proof identity. This module exposes it as a
 * W3C DID + VC primitive so third parties can verify an agent's
 * track record without trusting the SwarmHaul API.
 *
 * DID method: `did:swarmhaul:<solana_pubkey_base58>`
 *   - Resolved to a standard DID Document containing the Ed25519
 *     public key, one verification method, and a service endpoint
 *     pointing at the reputation VC.
 *
 * VC format: compact VC-JWT (`<b64url-header>.<b64url-payload>.<b64url-sig>`)
 *   - Issuer DID = the coordinator's DID.
 *   - Subject = the agent's DID.
 *   - Claims: legsAccepted, legsCompleted, reliabilityScore,
 *     onChainPDA, mirroredAt.
 *   - Signed with the coordinator's Ed25519 key via tweetnacl.
 *
 * The verification path is symmetric: anyone holding the coordinator
 * DID Document (which this API also serves) can check a VC without
 * any further coordination.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { reputationPda } from "@swarmhaul/sdk";

export const DID_METHOD = "swarmhaul";
export const DID_PREFIX = `did:${DID_METHOD}:`;
export const VC_CONTEXT = "https://www.w3.org/2018/credentials/v1";
export const VC_TYPE_REPUTATION = "SwarmHaulReputationCredential";

export function agentDid(pubkey: string): string {
  return `${DID_PREFIX}${pubkey}`;
}

/**
 * Pull the Solana pubkey out of a `did:swarmhaul:*` identifier.
 * Throws if the DID isn't in the expected form.
 */
export function pubkeyFromDid(did: string): string {
  if (!did.startsWith(DID_PREFIX)) {
    throw new Error(`Not a did:${DID_METHOD} identifier: ${did}`);
  }
  return did.slice(DID_PREFIX.length);
}

/**
 * DID Document for a SwarmHaul agent (or the coordinator, same shape).
 *
 * The `publicKeyMultibase` encoding is the ed25519-pub multicodec
 * (0xed01) followed by the 32-byte public key, all base58btc-encoded
 * with the `z` multibase prefix — the same encoding used by did:key.
 */
export interface DidDocument {
  "@context": string[];
  id: string;
  verificationMethod: {
    id: string;
    type: "Ed25519VerificationKey2020";
    controller: string;
    publicKeyMultibase: string;
  }[];
  authentication: string[];
  assertionMethod: string[];
  service?: {
    id: string;
    type: string;
    serviceEndpoint: string;
  }[];
}

export function buildDidDocument(opts: {
  pubkey: string;
  reputationEndpoint?: string;
}): DidDocument {
  const did = agentDid(opts.pubkey);
  const keyId = `${did}#key-1`;
  const pubkeyBytes = bs58.decode(opts.pubkey);
  // ed25519-pub multicodec: 0xed 0x01 prefix + 32-byte key → base58btc,
  // then the "z" multibase identifier.
  const multicodec = new Uint8Array(2 + pubkeyBytes.length);
  multicodec[0] = 0xed;
  multicodec[1] = 0x01;
  multicodec.set(pubkeyBytes, 2);
  const publicKeyMultibase = `z${bs58.encode(multicodec)}`;
  const doc: DidDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
  };
  if (opts.reputationEndpoint) {
    doc.service = [
      {
        id: `${did}#reputation`,
        type: "SwarmHaulReputationCredential",
        serviceEndpoint: opts.reputationEndpoint,
      },
    ];
  }
  return doc;
}

// ─── VC-JWT encoding ──────────────────────────────────────────────

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? Buffer.from(input) : Buffer.from(input);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = 4 - (input.length % 4 || 4);
  const padded = input + "=".repeat(pad % 4);
  return Uint8Array.from(
    Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
}

export interface ReputationClaims {
  legsAccepted: number;
  legsCompleted: number;
  reliabilityScore: number;
  onChainPDA: string;
  mirroredAt: string;
}

export interface ReputationVCPayload {
  iss: string;
  sub: string;
  iat: number;
  nbf: number;
  exp: number; // unix seconds — VCs expire after 24h
  jti: string;
  vc: {
    "@context": string[];
    type: string[];
    issuer: string;
    issuanceDate: string;
    credentialSubject: ReputationClaims & { id: string };
  };
}

export function issueReputationVC(opts: {
  subjectPubkey: string;
  issuerPubkey: string;
  issuerSecretKey: Uint8Array;
  claims: Omit<ReputationClaims, "onChainPDA" | "mirroredAt"> & {
    mirroredAt?: string;
  };
  now?: () => Date;
}): string {
  const now = (opts.now ?? (() => new Date()))();
  const issuanceDate = now.toISOString();
  const subject = agentDid(opts.subjectPubkey);
  const issuer = agentDid(opts.issuerPubkey);
  const [rPda] = reputationPda(new PublicKey(opts.subjectPubkey));

  const nowSec = Math.floor(now.getTime() / 1000);
  const payload: ReputationVCPayload = {
    iss: issuer,
    sub: subject,
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + 86_400, // 24h TTL
    jti: `urn:uuid:${crypto.randomUUID()}`,
    vc: {
      "@context": [VC_CONTEXT],
      type: ["VerifiableCredential", VC_TYPE_REPUTATION],
      issuer,
      issuanceDate,
      credentialSubject: {
        id: subject,
        legsAccepted: opts.claims.legsAccepted,
        legsCompleted: opts.claims.legsCompleted,
        reliabilityScore: opts.claims.reliabilityScore,
        onChainPDA: rPda.toBase58(),
        mirroredAt: opts.claims.mirroredAt ?? issuanceDate,
      },
    },
  };

  const header = { alg: "EdDSA", typ: "JWT", kid: `${issuer}#key-1` };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = nacl.sign.detached(
    new TextEncoder().encode(signingInput),
    opts.issuerSecretKey,
  );
  const sigB64 = b64url(sig);
  return `${signingInput}.${sigB64}`;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  expired?: boolean;
  payload?: ReputationVCPayload;
}

/**
 * Verify a VC-JWT. Pass the issuer's Ed25519 public key (base58) that
 * the caller expects — typically resolved from the `iss` DID via this
 * API's DID document endpoint.
 */
export function verifyReputationVC(jwt: string, issuerPubkey: string): VerifyResult {
  const parts = jwt.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed JWT" };
  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string };
  let payload: ReputationVCPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64)));
    payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payloadB64)),
    ) as ReputationVCPayload;
  } catch {
    return { valid: false, reason: "invalid base64/json" };
  }
  if (header.alg !== "EdDSA") {
    return { valid: false, reason: `unsupported alg: ${header.alg}` };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec - 60) {
    return { valid: false, reason: "expired", expired: true, payload };
  }
  if (payload.iss !== agentDid(issuerPubkey)) {
    return {
      valid: false,
      reason: `iss mismatch: expected ${agentDid(issuerPubkey)}, got ${payload.iss}`,
    };
  }
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = b64urlDecode(sigB64);
  const pubkeyBytes = bs58.decode(issuerPubkey);
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(signingInput),
    sig,
    pubkeyBytes,
  );
  if (!ok) return { valid: false, reason: "signature verification failed" };
  if (payload.nbf && payload.nbf > nowSec + 60) {
    return { valid: false, reason: "not-yet-valid (nbf in the future)" };
  }
  return { valid: true, payload };
}
