/**
 * End-to-end test of wallet signature auth.
 *
 * Run with:
 *   REQUIRE_AUTH=true bunx tsx scripts/test-auth.ts
 *
 * Verifies:
 *   - Unauthenticated POST is rejected (401)
 *   - Wrong signature is rejected (401)
 *   - Old nonce is rejected (401)
 *   - Valid signature is accepted (201)
 *   - Body tampering after signing is rejected (401 — body hash mismatch)
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";

const API = process.env.SWARMHAUL_API ?? "http://localhost:3001";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function canonicalMessage(method: string, url: string, nonce: string, body: string): string {
  return `${method.toUpperCase()}\n${url}\n${nonce}\n${sha256Hex(body)}`;
}

function signRequest(
  kp: Keypair,
  method: string,
  url: string,
  body: object,
): { headers: Record<string, string>; bodyStr: string } {
  const nonce = String(Date.now());
  const bodyStr = JSON.stringify(body);
  const message = canonicalMessage(method, url, nonce, bodyStr);
  const sigBytes = nacl.sign.detached(
    new TextEncoder().encode(message),
    kp.secretKey,
  );
  return {
    bodyStr,
    headers: {
      "Content-Type": "application/json",
      "X-Pubkey": kp.publicKey.toBase58(),
      "X-Nonce": nonce,
      "X-Signature": bs58.encode(sigBytes),
    },
  };
}

async function main() {
const wallet = Keypair.generate();
const samplePackage = {
  shipperPubkey: wallet.publicKey.toBase58(),
  originLat: 48.137,
  originLng: 11.575,
  destLat: 48.155,
  destLng: 11.605,
  description: "auth test package",
  weightKg: 1.5,
  volumeLitres: 4,
  maxBudgetSol: 0.2,
};

console.log(`▸ test wallet: ${wallet.publicKey.toBase58()}\n`);

// 1. Unauth attempt
{
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samplePackage),
  });
  console.log(`1. Unauthed POST → ${res.status}`);
  if (res.status === 401) console.log("   ✓ rejected as expected");
  else console.log("   ✗ EXPECTED 401, got", res.status, await res.text());
}

// 2. Wrong signature
{
  const fake = signRequest(Keypair.generate(), "POST", "/packages", samplePackage);
  fake.headers["X-Pubkey"] = wallet.publicKey.toBase58(); // mismatch
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: fake.headers,
    body: fake.bodyStr,
  });
  console.log(`2. Wrong signature → ${res.status}`);
  if (res.status === 401) console.log("   ✓ rejected as expected");
  else console.log("   ✗ EXPECTED 401, got", res.status, await res.text());
}

// 3. Stale nonce
{
  const signed = signRequest(wallet, "POST", "/packages", samplePackage);
  // Mutate nonce to 5 minutes ago
  const oldNonce = String(Date.now() - 5 * 60 * 1000);
  signed.headers["X-Nonce"] = oldNonce;
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: signed.headers,
    body: signed.bodyStr,
  });
  console.log(`3. Stale nonce → ${res.status}`);
  if (res.status === 401) console.log("   ✓ rejected as expected");
  else console.log("   ✗ EXPECTED 401, got", res.status, await res.text());
}

// 4. Body tampering
{
  const signed = signRequest(wallet, "POST", "/packages", samplePackage);
  // Tamper body
  const tamperedBody = JSON.stringify({ ...samplePackage, maxBudgetSol: 999 });
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: signed.headers,
    body: tamperedBody,
  });
  console.log(`4. Body tampering → ${res.status}`);
  if (res.status === 401) console.log("   ✓ rejected as expected");
  else console.log("   ✗ EXPECTED 401, got", res.status, await res.text());
}

// 5. Valid signed request
{
  const signed = signRequest(wallet, "POST", "/packages", samplePackage);
  const res = await fetch(`${API}/packages`, {
    method: "POST",
    headers: signed.headers,
    body: signed.bodyStr,
  });
  console.log(`5. Valid signature → ${res.status}`);
  if (res.status === 201) {
    const pkg = await res.json() as { id: string; onChainPackage?: string };
    console.log(`   ✓ accepted: ${pkg.id.slice(0, 8)}`);
    if (pkg.onChainPackage) console.log(`   ✓ on-chain: ${pkg.onChainPackage.slice(0, 16)}`);
  } else {
    console.log("   ✗ EXPECTED 201, got", res.status, await res.text());
  }
}

console.log("\n▸ done");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
