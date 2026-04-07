import {
  createSDK,
  loadKeypairFromFile,
  type SwarmhaulSDK,
  PROGRAM_ID,
} from "@swarmhaul/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";

let _sdk: SwarmhaulSDK | null = null;
let _coordinator: Keypair | null = null;

/**
 * Lazily initialise the Solana SDK + coordinator keypair.
 *
 * The coordinator is the protocol authority. It signs form_swarm,
 * assign_leg, and settle on behalf of shippers (whose escrow it
 * orchestrates). The shipper still pays for the escrow at list_package
 * time and is the only one who can cancel.
 */
export function getSolana(): { sdk: SwarmhaulSDK; coordinator: Keypair } {
  if (_sdk && _coordinator) return { sdk: _sdk, coordinator: _coordinator };

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const keypairPath =
    process.env.PROTOCOL_AUTHORITY_KEYPAIR_PATH ??
    `${process.env.HOME}/.config/solana/id.json`;

  _coordinator = loadKeypairFromFile(keypairPath);
  _sdk = createSDK(rpcUrl, _coordinator);

  console.log(`[solana] coordinator pubkey: ${_coordinator.publicKey.toBase58()}`);
  console.log(`[solana] program id: ${PROGRAM_ID.toBase58()}`);
  console.log(`[solana] rpc: ${rpcUrl}`);

  return { sdk: _sdk, coordinator: _coordinator };
}

export function getCoordinatorPubkey(): PublicKey {
  return getSolana().coordinator.publicKey;
}

export function explorerUrl(address: string | PublicKey): string {
  const addr = typeof address === "string" ? address : address.toBase58();
  const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
  return `https://explorer.solana.com/address/${addr}?cluster=${cluster}`;
}

export function explorerTxUrl(signature: string): string {
  const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}
