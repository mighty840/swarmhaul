import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { buildAuthHeaders, canonicalPath } from "./signed-fetch.js";

describe("buildAuthHeaders", () => {
  it("produces a signature the API's verifier would accept", () => {
    const kp = Keypair.generate();
    const body = JSON.stringify({ foo: "bar", n: 42 });
    const headers = buildAuthHeaders(kp, "POST", "/bids", body);

    // Reconstruct canonical message exactly as the API does
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const msg = `POST\n/bids\n${headers["X-Nonce"]}\n${bodyHash}`;
    const msgBytes = new TextEncoder().encode(msg);

    const sigBytes = bs58.decode(headers["X-Signature"]);
    const pkBytes = bs58.decode(headers["X-Pubkey"]);
    expect(sigBytes.length).toBe(64);
    expect(pkBytes.length).toBe(32);
    expect(nacl.sign.detached.verify(msgBytes, sigBytes, pkBytes)).toBe(true);
  });

  it("produces a fresh nonce each call", async () => {
    const kp = Keypair.generate();
    const a = buildAuthHeaders(kp, "POST", "/bids", "");
    await new Promise((r) => setTimeout(r, 2));
    const b = buildAuthHeaders(kp, "POST", "/bids", "");
    expect(a["X-Nonce"]).not.toBe(b["X-Nonce"]);
  });
});

describe("canonicalPath", () => {
  it("strips origin + keeps path and query", () => {
    expect(canonicalPath("https://api.swarmhaul.defited.com/bids")).toBe("/bids");
    expect(canonicalPath("http://localhost:3001/bids?limit=10")).toBe(
      "/bids?limit=10",
    );
  });

  it("returns input unchanged if not a valid URL", () => {
    expect(canonicalPath("/bids")).toBe("/bids");
  });
});
