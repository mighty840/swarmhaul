import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Swarmhaul } from "../target/types/swarmhaul";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

function uuidToBytes(): number[] {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
}

describe("swarmhaul", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.swarmhaul as Program<Swarmhaul>;
  const shipper = provider.wallet;
  const courier1 = Keypair.generate();
  const courier2 = Keypair.generate();
  const authority = provider.wallet;

  const packageId = uuidToBytes();
  const budgetLamports = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL

  let packagePda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let swarmPda: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop to couriers
    for (const kp of [courier1, courier2]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive PDAs
    [packagePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("package"), Buffer.from(packageId)],
      program.programId,
    );
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), packagePda.toBuffer()],
      program.programId,
    );
    [swarmPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("swarm"), packagePda.toBuffer()],
      program.programId,
    );
  });

  it("lists a package with escrow", async () => {
    await program.methods
      .listPackage(packageId, budgetLamports)
      .accounts({
        shipper: shipper.publicKey,
        packageAccount: packagePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const pkg = await program.account.packageAccount.fetch(packagePda);
    expect(pkg.status).to.deep.equal({ listed: {} });
    expect(pkg.maxBudgetLamports.toNumber()).to.equal(LAMPORTS_PER_SOL);

    const vaultBalance = await provider.connection.getBalance(vaultPda);
    expect(vaultBalance).to.equal(LAMPORTS_PER_SOL);
  });

  it("registers a vehicle profile", async () => {
    const [vehiclePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vehicle"), courier1.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .registerVehicle(
        new anchor.BN(100_000), // hourly rate lamports
        320, // boot volume litres
        false, // not autonomous
      )
      .accounts({
        owner: courier1.publicKey,
        vehicleProfile: vehiclePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([courier1])
      .rpc();

    const profile = await program.account.vehicleProfileAccount.fetch(vehiclePda);
    expect(profile.owner.toBase58()).to.equal(courier1.publicKey.toBase58());
    expect(profile.bootVolumeLitres).to.equal(320);
    expect(profile.isAutonomous).to.equal(false);
  });

  it("forms a swarm", async () => {
    const totalLegs = 2;
    const totalLamports = new anchor.BN(LAMPORTS_PER_SOL * 0.8);

    await program.methods
      .formSwarm(totalLegs, totalLamports)
      .accounts({
        authority: authority.publicKey,
        packageAccount: packagePda,
        swarmAccount: swarmPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    expect(swarm.totalLegs).to.equal(2);
    expect(swarm.completedLegs).to.equal(0);
    expect(swarm.status).to.deep.equal({ forming: {} });

    const pkg = await program.account.packageAccount.fetch(packagePda);
    expect(pkg.status).to.deep.equal({ swarmForming: {} });
  });

  it("courier 1 joins swarm (leg 0)", async () => {
    await program.methods
      .joinSwarm(0)
      .accounts({
        courier: courier1.publicKey,
        swarmAccount: swarmPda,
        packageAccount: packagePda,
      })
      .signers([courier1])
      .rpc();

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    // Not yet active — still forming (need leg 1)
    expect(swarm.status).to.deep.equal({ forming: {} });
  });

  it("courier 2 joins swarm (leg 1) — swarm becomes active", async () => {
    await program.methods
      .joinSwarm(1)
      .accounts({
        courier: courier2.publicKey,
        swarmAccount: swarmPda,
        packageAccount: packagePda,
      })
      .signers([courier2])
      .rpc();

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    expect(swarm.status).to.deep.equal({ active: {} });

    const pkg = await program.account.packageAccount.fetch(packagePda);
    expect(pkg.status).to.deep.equal({ inTransit: {} });
  });

  it("courier 1 confirms leg 0 — receives payment", async () => {
    const paymentLamports = new anchor.BN(LAMPORTS_PER_SOL * 0.4);
    const balanceBefore = await provider.connection.getBalance(
      courier1.publicKey,
    );

    await program.methods
      .confirmLeg(paymentLamports)
      .accounts({
        courier: courier1.publicKey,
        swarmAccount: swarmPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([courier1])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(
      courier1.publicKey,
    );
    expect(balanceAfter).to.be.greaterThan(balanceBefore);

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    expect(swarm.completedLegs).to.equal(1);
  });

  it("courier 2 confirms leg 1 — receives payment", async () => {
    const paymentLamports = new anchor.BN(LAMPORTS_PER_SOL * 0.4);

    await program.methods
      .confirmLeg(paymentLamports)
      .accounts({
        courier: courier2.publicKey,
        swarmAccount: swarmPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([courier2])
      .rpc();

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    expect(swarm.completedLegs).to.equal(2);
  });

  it("settles the swarm — package delivered, surplus returned", async () => {
    await program.methods
      .settle()
      .accounts({
        authority: authority.publicKey,
        swarmAccount: swarmPda,
        packageAccount: packagePda,
        vault: vaultPda,
        shipper: shipper.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const swarm = await program.account.swarmAccount.fetch(swarmPda);
    expect(swarm.status).to.deep.equal({ settled: {} });

    const pkg = await program.account.packageAccount.fetch(packagePda);
    expect(pkg.status).to.deep.equal({ delivered: {} });

    const vaultBalance = await provider.connection.getBalance(vaultPda);
    expect(vaultBalance).to.equal(0);
  });

  it("updates agent reputation", async () => {
    const [repPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), courier1.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .updateReputation(1, 1, new anchor.BN(300))
      .accounts({
        authority: authority.publicKey,
        reputation: repPda,
        agent: courier1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const rep = await program.account.agentReputationAccount.fetch(repPda);
    expect(rep.legsCompleted).to.equal(1);
    expect(rep.legsAccepted).to.equal(1);
    expect(rep.reliabilityScore).to.equal(100);
  });

  it("cancels a fresh package and refunds", async () => {
    const newPackageId = uuidToBytes();
    const newBudget = new anchor.BN(LAMPORTS_PER_SOL * 0.5);

    const [newPkgPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("package"), Buffer.from(newPackageId)],
      program.programId,
    );
    const [newVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), newPkgPda.toBuffer()],
      program.programId,
    );

    await program.methods
      .listPackage(newPackageId, newBudget)
      .accounts({
        shipper: shipper.publicKey,
        packageAccount: newPkgPda,
        vault: newVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const balanceBefore = await provider.connection.getBalance(
      shipper.publicKey,
    );

    await program.methods
      .cancelPackage()
      .accounts({
        shipper: shipper.publicKey,
        packageAccount: newPkgPda,
        vault: newVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const pkg = await program.account.packageAccount.fetch(newPkgPda);
    expect(pkg.status).to.deep.equal({ failed: {} });

    const balanceAfter = await provider.connection.getBalance(
      shipper.publicKey,
    );
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
  });
});
