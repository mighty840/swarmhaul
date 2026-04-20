/**
 * @swarmhaul/sdk — TypeScript wrapper around the Solana Anchor program.
 *
 * Provides PDA derivation helpers and high-level builders for every
 * instruction in the protocol. Used by both the API server (coordinator
 * actions) and the dashboard (shipper/courier actions).
 */
import anchorPkg from "@coral-xyz/anchor";
import type { Wallet as WalletType, Program as ProgramType } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
const { AnchorProvider, Program, BN, Wallet } = anchorPkg;
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import idl from "./idl.json" with { type: "json" };
import type { Swarmhaul } from "./idl.types.js";

export type { Swarmhaul };
export { idl };

export const PROGRAM_ID = new PublicKey(
  "GW9wYUcfa6LT5vxJ12aN7nu8VxWVrM53jaZcrZak41sg",
);

// ─── PDA derivation ────────────────────────────────────────────────

export function packagePda(packageId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("package"), Buffer.from(packageId)],
    PROGRAM_ID,
  );
}

export function vaultPda(packageAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), packageAccount.toBuffer()],
    PROGRAM_ID,
  );
}

export function swarmPda(packageAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("swarm"), packageAccount.toBuffer()],
    PROGRAM_ID,
  );
}

export function legPda(swarmAccount: PublicKey, legIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("leg"), swarmAccount.toBuffer(), Buffer.from([legIndex])],
    PROGRAM_ID,
  );
}

export function reputationPda(agent: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agent.toBuffer()],
    PROGRAM_ID,
  );
}

export function vehiclePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vehicle"), owner.toBuffer()],
    PROGRAM_ID,
  );
}

// ─── UUID helpers ──────────────────────────────────────────────────

/**
 * Convert a UUID string (e.g. from Postgres) to the [u8; 16] byte array
 * the Anchor program expects.
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── SDK client ────────────────────────────────────────────────────

export interface SwarmhaulSDK {
  program: ProgramType<Swarmhaul>;
  connection: Connection;
  programId: PublicKey;
}

export function createSDK(
  rpcUrl: string,
  payer: Keypair | WalletType | "readonly",
): SwarmhaulSDK {
  const connection = new Connection(rpcUrl, "confirmed");
  let wallet: WalletType;
  if (payer === "readonly") {
    // Stub wallet for read-only operations
    wallet = {
      publicKey: PublicKey.default,
      payer: Keypair.generate(),
      signTransaction: async () => {
        throw new Error("readonly wallet");
      },
      signAllTransactions: async () => {
        throw new Error("readonly wallet");
      },
    } as unknown as WalletType;
  } else if ("payer" in payer) {
    wallet = payer;
  } else {
    wallet = new Wallet(payer) as unknown as WalletType;
  }

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new Program<Swarmhaul>(idl as any, provider);

  return { program, connection, programId: PROGRAM_ID };
}

// ─── Instruction builders ──────────────────────────────────────────

export interface ListPackageArgs {
  shipper: PublicKey;
  packageId: Uint8Array;
  maxBudgetLamports: bigint;
  coordinator: PublicKey;
}

export async function buildListPackageIx(
  sdk: SwarmhaulSDK,
  args: ListPackageArgs,
): Promise<{ ix: TransactionInstruction; package: PublicKey; vault: PublicKey }> {
  const [pkgPda] = packagePda(args.packageId);
  const [vPda] = vaultPda(pkgPda);

  const ix = await sdk.program.methods
    .listPackage(
      Array.from(args.packageId) as any,
      new BN(args.maxBudgetLamports.toString()),
      args.coordinator,
    )
    .accounts({
      shipper: args.shipper,
      packageAccount: pkgPda,
      vault: vPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  return { ix, package: pkgPda, vault: vPda };
}

export interface FormSwarmArgs {
  coordinator: PublicKey;
  packageAccount: PublicKey;
  totalLegs: number;
  totalLamports: bigint;
}

export async function buildFormSwarmIx(
  sdk: SwarmhaulSDK,
  args: FormSwarmArgs,
): Promise<{ ix: TransactionInstruction; swarm: PublicKey }> {
  const [sPda] = swarmPda(args.packageAccount);

  const ix = await sdk.program.methods
    .formSwarm(args.totalLegs, new BN(args.totalLamports.toString()))
    .accounts({
      coordinator: args.coordinator,
      packageAccount: args.packageAccount,
      swarmAccount: sPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  return { ix, swarm: sPda };
}

export interface AssignLegArgs {
  coordinator: PublicKey;
  packageAccount: PublicKey;
  swarmAccount: PublicKey;
  legIndex: number;
  courier: PublicKey;
  paymentLamports: bigint;
}

export async function buildAssignLegIx(
  sdk: SwarmhaulSDK,
  args: AssignLegArgs,
): Promise<{ ix: TransactionInstruction; leg: PublicKey; reputation: PublicKey }> {
  const [lPda] = legPda(args.swarmAccount, args.legIndex);
  const [rPda] = reputationPda(args.courier);

  const ix = await sdk.program.methods
    .assignLeg(
      args.legIndex,
      args.courier,
      new BN(args.paymentLamports.toString()),
    )
    .accounts({
      coordinator: args.coordinator,
      packageAccount: args.packageAccount,
      swarmAccount: args.swarmAccount,
      legAccount: lPda,
      courierReputation: rPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  return { ix, leg: lPda, reputation: rPda };
}

export interface ConfirmLegArgs {
  /**
   * The signer attesting receipt. For the final leg this is the
   * package shipper; for intermediate legs this is the next-hop
   * courier (matches `nextLegAccount.courier` on-chain).
   */
  recipient: PublicKey;
  /** Courier pubkey — non-signer payout destination. */
  courier: PublicKey;
  legAccount: PublicKey;
  swarmAccount: PublicKey;
  packageAccount: PublicKey;
  /**
   * LegAccount PDA of the next leg in the relay chain. Required for
   * intermediate legs, must be `null` for the final leg. The program
   * rejects mismatches (MissingNextLeg / UnexpectedNextLeg).
   */
  nextLegAccount?: PublicKey | null;
}

export async function buildConfirmLegIx(
  sdk: SwarmhaulSDK,
  args: ConfirmLegArgs,
): Promise<TransactionInstruction> {
  const [vPda] = vaultPda(args.packageAccount);
  const [rPda] = reputationPda(args.courier);

  return sdk.program.methods
    .confirmLeg()
    .accounts({
      recipient: args.recipient,
      courier: args.courier,
      legAccount: args.legAccount,
      nextLegAccount: args.nextLegAccount ?? null,
      swarmAccount: args.swarmAccount,
      packageAccount: args.packageAccount,
      vault: vPda,
      courierReputation: rPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();
}

export interface SettleArgs {
  coordinator: PublicKey;
  packageAccount: PublicKey;
  swarmAccount: PublicKey;
  shipper: PublicKey;
}

export async function buildSettleIx(
  sdk: SwarmhaulSDK,
  args: SettleArgs,
): Promise<TransactionInstruction> {
  const [vPda] = vaultPda(args.packageAccount);

  return sdk.program.methods
    .settle()
    .accounts({
      coordinator: args.coordinator,
      swarmAccount: args.swarmAccount,
      packageAccount: args.packageAccount,
      vault: vPda,
      shipper: args.shipper,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();
}

export interface CancelPackageArgs {
  shipper: PublicKey;
  packageAccount: PublicKey;
}

export async function buildCancelPackageIx(
  sdk: SwarmhaulSDK,
  args: CancelPackageArgs,
): Promise<TransactionInstruction> {
  const [vPda] = vaultPda(args.packageAccount);

  return sdk.program.methods
    .cancelPackage()
    .accounts({
      shipper: args.shipper,
      packageAccount: args.packageAccount,
      vault: vPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();
}

// ─── Coordinator helpers (server signs + sends directly) ───────────

/**
 * Coordinator-side: builds, signs and sends form_swarm + N assign_leg
 * instructions in a single transaction (or split if instructions exceed
 * compute limits).
 */
export async function coordinatorFormAndAssignSwarm(
  sdk: SwarmhaulSDK,
  coordinator: Keypair,
  packageAccount: PublicKey,
  totalLamports: bigint,
  legs: { courier: PublicKey; paymentLamports: bigint }[],
): Promise<{ swarm: PublicKey; signature: string }> {
  const formIx = await buildFormSwarmIx(sdk, {
    coordinator: coordinator.publicKey,
    packageAccount,
    totalLegs: legs.length,
    totalLamports,
  });

  const assignIxs = await Promise.all(
    legs.map((leg, idx) =>
      buildAssignLegIx(sdk, {
        coordinator: coordinator.publicKey,
        packageAccount,
        swarmAccount: formIx.swarm,
        legIndex: idx,
        courier: leg.courier,
        paymentLamports: leg.paymentLamports,
      }),
    ),
  );

  const tx = new Transaction().add(formIx.ix, ...assignIxs.map((a) => a.ix));
  tx.feePayer = coordinator.publicKey;
  const { blockhash } = await sdk.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  tx.sign(coordinator);
  const signature = await sdk.connection.sendRawTransaction(tx.serialize());
  await sdk.connection.confirmTransaction(signature, "confirmed");

  return { swarm: formIx.swarm, signature };
}

export async function coordinatorSettleSwarm(
  sdk: SwarmhaulSDK,
  coordinator: Keypair,
  packageAccount: PublicKey,
  swarmAccount: PublicKey,
  shipper: PublicKey,
): Promise<string> {
  const ix = await buildSettleIx(sdk, {
    coordinator: coordinator.publicKey,
    packageAccount,
    swarmAccount,
    shipper,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = coordinator.publicKey;
  const { blockhash } = await sdk.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(coordinator);
  const signature = await sdk.connection.sendRawTransaction(tx.serialize());
  await sdk.connection.confirmTransaction(signature, "confirmed");
  return signature;
}

// ─── Loaders ───────────────────────────────────────────────────────

export function loadKeypairFromFile(path: string): Keypair {
  const resolved = path.replace("~", process.env.HOME ?? "");
  const raw = JSON.parse(readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
