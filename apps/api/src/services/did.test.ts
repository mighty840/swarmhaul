import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  agentDid,
  buildDidDocument,
  issueReputationVC,
  pubkeyFromDid,
  verifyReputationVC,
  type ReputationVCPayload,
} from "./did.js";

function newKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    pubkey: bs58.encode(kp.publicKey),
    secretKey: kp.secretKey,
  };
}

describe("DID helpers", () => {
  it("round-trips did ↔ pubkey", () => {
    const pk = "57LYCghjSiryZdADutcYjyZdPXzUomRvrpsNa8Wr9pwG";
    expect(agentDid(pk)).toBe(`did:swarmhaul:${pk}`);
    expect(pubkeyFromDid(agentDid(pk))).toBe(pk);
  });

  it("rejects non-swarmhaul DIDs", () => {
    expect(() => pubkeyFromDid("did:key:zAbc")).toThrow(/did:swarmhaul/);
  });

  it("builds a conformant DID Document", () => {
    const doc = buildDidDocument({
      pubkey: "57LYCghjSiryZdADutcYjyZdPXzUomRvrpsNa8Wr9pwG",
      reputationEndpoint: "https://api.example/did/57LY.../reputation",
    });
    expect(doc["@context"]).toContain("https://www.w3.org/ns/did/v1");
    expect(doc.id).toMatch(/^did:swarmhaul:/);
    expect(doc.verificationMethod[0].type).toBe("Ed25519VerificationKey2020");
    expect(doc.verificationMethod[0].publicKeyMultibase).toMatch(/^z/);
    expect(doc.service?.[0].type).toBe("SwarmHaulReputationCredential");
  });
});

describe("VC-JWT issuance + verification", () => {
  it("verifies a VC issued by its owning coordinator", () => {
    const issuer = newKeypair();
    const subject = newKeypair();
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: {
        legsAccepted: 5,
        legsCompleted: 4,
        reliabilityScore: 80,
      },
    });
    const res = verifyReputationVC(jwt, issuer.pubkey);
    expect(res.valid).toBe(true);
    expect(res.payload?.sub).toBe(agentDid(subject.pubkey));
    expect(res.payload?.vc.credentialSubject.legsCompleted).toBe(4);
    expect(res.payload?.vc.type).toContain("SwarmHaulReputationCredential");
  });

  it("rejects a VC verified against a different issuer pubkey", () => {
    const issuer = newKeypair();
    const attacker = newKeypair();
    const subject = newKeypair();
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: { legsAccepted: 1, legsCompleted: 1, reliabilityScore: 100 },
    });
    const res = verifyReputationVC(jwt, attacker.pubkey);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/iss mismatch/);
  });

  it("rejects a VC whose payload has been tampered with", () => {
    const issuer = newKeypair();
    const subject = newKeypair();
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: { legsAccepted: 5, legsCompleted: 4, reliabilityScore: 80 },
    });

    const [header, payload, sig] = jwt.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as ReputationVCPayload;
    decoded.vc.credentialSubject.reliabilityScore = 100;
    const tamperedPayload = Buffer.from(JSON.stringify(decoded))
      .toString("base64url")
      .replace(/=+$/, "");
    const tampered = `${header}.${tamperedPayload}.${sig}`;

    const res = verifyReputationVC(tampered, issuer.pubkey);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/signature/);
  });

  it("rejects a malformed JWT", () => {
    expect(verifyReputationVC("not-a-jwt", newKeypair().pubkey).valid).toBe(false);
    expect(verifyReputationVC("one.two", newKeypair().pubkey).valid).toBe(false);
  });

  it("issued VC includes an exp claim ~24h from issuance", () => {
    const issuer = newKeypair();
    const subject = newKeypair();
    const now = new Date("2025-01-01T00:00:00Z");
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: { legsAccepted: 1, legsCompleted: 1, reliabilityScore: 50 },
      now: () => now,
    });
    const [, payloadB64] = jwt.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as { exp: number; iat: number };
    expect(payload.exp).toBe(payload.iat + 86_400);
  });

  it("accepts a VC that has not yet expired", () => {
    const issuer = newKeypair();
    const subject = newKeypair();
    // Issue with a now slightly in the past — still within the 24h window
    const issueTime = new Date(Date.now() - 60_000); // 1 min ago
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: { legsAccepted: 1, legsCompleted: 1, reliabilityScore: 50 },
      now: () => issueTime,
    });
    const res = verifyReputationVC(jwt, issuer.pubkey);
    expect(res.valid).toBe(true);
    expect(res.expired).toBeUndefined();
  });

  it("rejects an expired VC and sets expired: true with the payload", () => {
    const issuer = newKeypair();
    const subject = newKeypair();
    // Issue backdated by 25h — past the 24h TTL
    const issueTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const jwt = issueReputationVC({
      issuerPubkey: issuer.pubkey,
      issuerSecretKey: issuer.secretKey,
      subjectPubkey: subject.pubkey,
      claims: { legsAccepted: 3, legsCompleted: 2, reliabilityScore: 60 },
      now: () => issueTime,
    });
    const res = verifyReputationVC(jwt, issuer.pubkey);
    expect(res.valid).toBe(false);
    expect(res.expired).toBe(true);
    expect(res.reason).toBe("expired");
    // payload must be present so callers can extract the subject for VcExpired event
    expect(res.payload?.sub).toBe(`did:swarmhaul:${subject.pubkey}`);
  });
});
