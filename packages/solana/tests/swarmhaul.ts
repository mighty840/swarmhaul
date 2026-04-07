import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Swarmhaul } from "../target/types/swarmhaul";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

function uuidToBytes(): number[] {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
}

async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: anchor.web3.PublicKey,
  sol = 2,
) {
  const sig = await provider.connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig);
}

describe("swarmhaul", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.swarmhaul as Program<Swarmhaul>;
  const shipper = provider.wallet;

  // ─── Happy path ────────────────────────────────────────────────

  describe("happy path: list → form → assign 2 legs → confirm → settle", () => {
    const courier1 = Keypair.generate();
    const courier2 = Keypair.generate();
    const packageId = uuidToBytes();
    const budgetLamports = new anchor.BN(LAMPORTS_PER_SOL);
    let packagePda: anchor.web3.PublicKey;
    let vaultPda: anchor.web3.PublicKey;
    let swarmPda: anchor.web3.PublicKey;
    let leg0Pda: anchor.web3.PublicKey;
    let leg1Pda: anchor.web3.PublicKey;

    before(async () => {
      await airdrop(provider, courier1.publicKey);
      await airdrop(provider, courier2.publicKey);

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
      [leg0Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([0])],
        program.programId,
      );
      [leg1Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([1])],
        program.programId,
      );
    });

    it("lists package with shipper as coordinator", async () => {
      await program.methods
        .listPackage(packageId, budgetLamports, shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const pkg = await program.account.packageAccount.fetch(packagePda);
      expect(pkg.coordinator.toBase58()).to.equal(shipper.publicKey.toBase58());
      expect(pkg.status).to.deep.equal({ listed: {} });
      expect(pkg.maxBudgetLamports.toNumber()).to.equal(LAMPORTS_PER_SOL);
      expect(await provider.connection.getBalance(vaultPda)).to.equal(LAMPORTS_PER_SOL);
    });

    it("forms swarm with 2 legs (coordinator-only)", async () => {
      await program.methods
        .formSwarm(2, new anchor.BN(LAMPORTS_PER_SOL * 0.8))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.totalLegs).to.equal(2);
      expect(swarm.assignedLegs).to.equal(0);
      expect(swarm.status).to.deep.equal({ forming: {} });
    });

    it("assigns leg 0 to courier1", async () => {
      await program.methods
        .assignLeg(0, courier1.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.4))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          legAccount: leg0Pda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const leg = await program.account.legAccount.fetch(leg0Pda);
      expect(leg.courier.toBase58()).to.equal(courier1.publicKey.toBase58());
      expect(leg.confirmed).to.equal(false);
      expect(leg.paymentLamports.toNumber()).to.equal(LAMPORTS_PER_SOL * 0.4);
    });

    it("assigns leg 1 → swarm becomes Active", async () => {
      await program.methods
        .assignLeg(1, courier2.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.4))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          legAccount: leg1Pda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.assignedLegs).to.equal(2);
      expect(swarm.status).to.deep.equal({ active: {} });
    });

    it("courier1 confirms leg 0 → receives exactly 0.4 SOL", async () => {
      const before = await provider.connection.getBalance(courier1.publicKey);
      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier1.publicKey,
          legAccount: leg0Pda,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier1])
        .rpc();

      const after = await provider.connection.getBalance(courier1.publicKey);
      expect(after - before).to.equal(LAMPORTS_PER_SOL * 0.4);

      const leg = await program.account.legAccount.fetch(leg0Pda);
      expect(leg.confirmed).to.equal(true);

      const pkg = await program.account.packageAccount.fetch(packagePda);
      expect(pkg.status).to.deep.equal({ inTransit: {} });
    });

    it("courier2 confirms leg 1", async () => {
      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier2.publicKey,
          legAccount: leg1Pda,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier2])
        .rpc();

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.completedLegs).to.equal(2);
    });

    it("settles → surplus returned, package delivered", async () => {
      const shipperBefore = await provider.connection.getBalance(shipper.publicKey);
      await program.methods
        .settle()
        .accounts({
          coordinator: shipper.publicKey,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          shipper: shipper.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect(await provider.connection.getBalance(vaultPda)).to.equal(0);
      const shipperAfter = await provider.connection.getBalance(shipper.publicKey);
      // Shipper got the 0.2 SOL surplus back (minus tx fee)
      expect(shipperAfter).to.be.greaterThan(shipperBefore);

      const pkg = await program.account.packageAccount.fetch(packagePda);
      expect(pkg.status).to.deep.equal({ delivered: {} });
    });
  });

  // ─── Negative tests: vault drain (C-1) ─────────────────────────

  describe("security: confirm_leg cannot drain vault", () => {
    const courier = Keypair.generate();
    const attacker = Keypair.generate();
    const packageId = uuidToBytes();
    let packagePda: anchor.web3.PublicKey;
    let vaultPda: anchor.web3.PublicKey;
    let swarmPda: anchor.web3.PublicKey;
    let legPda: anchor.web3.PublicKey;

    before(async () => {
      await airdrop(provider, courier.publicKey);
      await airdrop(provider, attacker.publicKey);

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
      [legPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([0])],
        program.programId,
      );

      // Setup: list, form, assign one leg
      await program.methods
        .listPackage(packageId, new anchor.BN(LAMPORTS_PER_SOL), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .formSwarm(1, new anchor.BN(LAMPORTS_PER_SOL * 0.5))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .assignLeg(0, courier.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.5))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          legAccount: legPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects random signer trying to confirm someone else's leg", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            courier: attacker.publicKey,
            legAccount: legPda,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have rejected attacker");
      } catch (err: any) {
        expect(err.toString()).to.match(/NotAssignedCourier/);
      }
    });

    it("rejects double confirmation by the legitimate courier", async () => {
      // First confirm succeeds
      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier.publicKey,
          legAccount: legPda,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier])
        .rpc();

      // Second one must fail
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            courier: courier.publicKey,
            legAccount: legPda,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([courier])
          .rpc();
        expect.fail("should have rejected double confirmation");
      } catch (err: any) {
        expect(err.toString()).to.match(/LegAlreadyConfirmed/);
      }
    });
  });

  // ─── Negative tests: form_swarm authorization (C-3) ────────────

  describe("security: only coordinator can form/assign/settle", () => {
    const attacker = Keypair.generate();
    const packageId = uuidToBytes();
    let packagePda: anchor.web3.PublicKey;
    let vaultPda: anchor.web3.PublicKey;
    let swarmPda: anchor.web3.PublicKey;

    before(async () => {
      await airdrop(provider, attacker.publicKey);

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

      await program.methods
        .listPackage(packageId, new anchor.BN(LAMPORTS_PER_SOL), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: packagePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects form_swarm by non-coordinator", async () => {
      try {
        await program.methods
          .formSwarm(2, new anchor.BN(LAMPORTS_PER_SOL * 0.5))
          .accounts({
            coordinator: attacker.publicKey,
            packageAccount: packagePda,
            swarmAccount: swarmPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("attacker should not be able to form swarm");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedCoordinator/);
      }
    });

    it("rejects form_swarm with total_lamports > max_budget", async () => {
      try {
        await program.methods
          .formSwarm(1, new anchor.BN(LAMPORTS_PER_SOL * 5))
          .accounts({
            coordinator: shipper.publicKey,
            packageAccount: packagePda,
            swarmAccount: swarmPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should reject over-budget swarm");
      } catch (err: any) {
        expect(err.toString()).to.match(/BudgetExceeded/);
      }
    });
  });

  // ─── Cancel + refund ───────────────────────────────────────────

  describe("cancel_package refunds shipper", () => {
    it("cancels listed package and refunds vault", async () => {
      const newPackageId = uuidToBytes();
      const [pkgPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(newPackageId)],
        program.programId,
      );
      const [vPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pkgPda.toBuffer()],
        program.programId,
      );

      await program.methods
        .listPackage(newPackageId, new anchor.BN(LAMPORTS_PER_SOL * 0.5), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .cancelPackage()
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect(await provider.connection.getBalance(vPda)).to.equal(0);
      const pkg = await program.account.packageAccount.fetch(pkgPda);
      expect(pkg.status).to.deep.equal({ failed: {} });
    });
  });
});
