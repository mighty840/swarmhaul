import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { buildCanonicalMessage, verifyWalletSignature } from "./auth.js";

function sign(kp: Keypair, message: string): string {
  const sig = nacl.sign.detached(
    new TextEncoder().encode(message),
    kp.secretKey,
  );
  return bs58.encode(sig);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("buildCanonicalMessage", () => {
  it("produces METHOD\\nURL\\nNONCE\\nSHA256(body)", () => {
    const msg = buildCanonicalMessage("POST", "/packages", "12345", '{"a":1}');
    const lines = msg.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/packages");
    expect(lines[2]).toBe("12345");
    expect(lines[3]).toBe(sha256Hex('{"a":1}'));
  });

  it("uppercases the method", () => {
    const msg = buildCanonicalMessage("post", "/x", "1", "");
    expect(msg.startsWith("POST")).toBe(true);
  });

  it("empty body produces SHA256 of empty string", () => {
    const msg = buildCanonicalMessage("GET", "/", "1", "");
    const hash = msg.split("\n")[3];
    expect(hash).toBe(sha256Hex(""));
  });
});

describe("verifyWalletSignature", () => {
  const wallet = Keypair.generate();
  const pubkey = wallet.publicKey.toBase58();

  it("accepts a valid signature within nonce window", () => {
    const nonce = String(Date.now());
    const message = buildCanonicalMessage("POST", "/packages", nonce, '{"test":true}');
    const sig = sign(wallet, message);

    const result = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(result.ok).toBe(true);
  });

  it("rejects a stale nonce (>60s old)", () => {
    const nonce = String(Date.now() - 120_000); // 2 min ago
    const message = buildCanonicalMessage("POST", "/packages", nonce, "{}");
    const sig = sign(wallet, message);

    const result = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/window/);
  });

  it("rejects a future nonce (>60s ahead)", () => {
    const nonce = String(Date.now() + 120_000); // 2 min ahead
    const message = buildCanonicalMessage("POST", "/packages", nonce, "{}");
    const sig = sign(wallet, message);

    const result = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/window/);
  });

  it("rejects a non-numeric nonce", () => {
    const result = verifyWalletSignature(pubkey, "not-a-number", "fake", "msg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/numeric/);
  });

  it("rejects a mismatched signature (wrong signer)", () => {
    const nonce = String(Date.now());
    const message = buildCanonicalMessage("POST", "/bids", nonce, '{"bid":1}');
    const wrongWallet = Keypair.generate();
    const sig = sign(wrongWallet, message); // signed by wrong key

    const result = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/verification failed/);
  });

  it("rejects a tampered message (body changed after signing)", () => {
    const nonce = String(Date.now());
    const originalMsg = buildCanonicalMessage("POST", "/packages", nonce, '{"budget":0.5}');
    const sig = sign(wallet, originalMsg);

    const tamperedMsg = buildCanonicalMessage("POST", "/packages", nonce, '{"budget":999}');
    const result = verifyWalletSignature(pubkey, nonce, sig, tamperedMsg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/verification failed/);
  });

  it("rejects invalid base58 pubkey", () => {
    const nonce = String(Date.now());
    const result = verifyWalletSignature("not-base58!!!", nonce, "fake", "msg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/base58|bytes/);
  });

  it("rejects pubkey with wrong length", () => {
    const nonce = String(Date.now());
    const shortKey = bs58.encode(Buffer.alloc(16)); // 16 bytes, not 32
    const result = verifyWalletSignature(shortKey, nonce, "fakesig", "msg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/32 bytes/);
  });

  it("rejects nonce replay (same nonce+pubkey used twice)", () => {
    const nonce = String(Date.now());
    const message = buildCanonicalMessage("POST", "/test", nonce, "{}");
    const sig = sign(wallet, message);

    const r1 = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(r1.ok).toBe(true);

    const r2 = verifyWalletSignature(pubkey, nonce, sig, message);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/already used/);
  });
});
