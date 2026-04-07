import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Swarmhaul } from "../target/types/swarmhaul";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

function uuidToBytes(): number[] {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
}

function repPda(programId: PublicKey, agent: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agent.toBuffer()],
    programId,
  )[0];
}

async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
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
    let packagePda: PublicKey;
    let vaultPda: PublicKey;
    let swarmPda: PublicKey;
    let leg0Pda: PublicKey;
    let leg1Pda: PublicKey;

    before(async () => {
      await airdrop(provider, courier1.publicKey);
      await airdrop(provider, courier2.publicKey);

      [packagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(packageId)],
        program.programId,
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), packagePda.toBuffer()],
        program.programId,
      );
      [swarmPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swarm"), packagePda.toBuffer()],
        program.programId,
      );
      [leg0Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([0])],
        program.programId,
      );
      [leg1Pda] = PublicKey.findProgramAddressSync(
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

    it("assigns leg 0 to courier1 → courier1 reputation legs_accepted = 1", async () => {
      const courier1Rep = repPda(program.programId, courier1.publicKey);

      await program.methods
        .assignLeg(0, courier1.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.4))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          legAccount: leg0Pda,
          courierReputation: courier1Rep,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const leg = await program.account.legAccount.fetch(leg0Pda);
      expect(leg.courier.toBase58()).to.equal(courier1.publicKey.toBase58());

      const rep = await program.account.agentReputationAccount.fetch(courier1Rep);
      expect(rep.legsAccepted).to.equal(1);
      expect(rep.legsCompleted).to.equal(0);
      expect(rep.reliabilityScore).to.equal(0); // 0/1 = 0
    });

    it("assigns leg 1 → swarm becomes Active", async () => {
      await program.methods
        .assignLeg(1, courier2.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.4))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          legAccount: leg1Pda,
          courierReputation: repPda(program.programId, courier2.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.assignedLegs).to.equal(2);
      expect(swarm.status).to.deep.equal({ active: {} });
    });

    it("courier1 confirms leg 0 → paid 0.4 SOL + reputation = 100%", async () => {
      const courier1Rep = repPda(program.programId, courier1.publicKey);
      const before = await provider.connection.getBalance(courier1.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier1.publicKey,
          legAccount: leg0Pda,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          courierReputation: courier1Rep,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier1])
        .rpc();

      const after = await provider.connection.getBalance(courier1.publicKey);
      expect(after - before).to.equal(LAMPORTS_PER_SOL * 0.4);

      const rep = await program.account.agentReputationAccount.fetch(courier1Rep);
      expect(rep.legsCompleted).to.equal(1);
      expect(rep.legsAccepted).to.equal(1);
      expect(rep.reliabilityScore).to.equal(100); // 1/1 * 100

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
          courierReputation: repPda(program.programId, courier2.publicKey),
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
      expect(await provider.connection.getBalance(shipper.publicKey)).to.be.greaterThan(shipperBefore);

      const pkg = await program.account.packageAccount.fetch(packagePda);
      expect(pkg.status).to.deep.equal({ delivered: {} });
    });
  });

  // ─── Negative tests: vault drain (C-1) ─────────────────────────

  describe("security: confirm_leg cannot drain vault", () => {
    const courier = Keypair.generate();
    const attacker = Keypair.generate();
    const packageId = uuidToBytes();
    let packagePda: PublicKey;
    let vaultPda: PublicKey;
    let swarmPda: PublicKey;
    let legPda: PublicKey;

    before(async () => {
      await airdrop(provider, courier.publicKey);
      await airdrop(provider, attacker.publicKey);

      [packagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(packageId)],
        program.programId,
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), packagePda.toBuffer()],
        program.programId,
      );
      [swarmPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swarm"), packagePda.toBuffer()],
        program.programId,
      );
      [legPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([0])],
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
          courierReputation: repPda(program.programId, courier.publicKey),
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
            courierReputation: repPda(program.programId, attacker.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have rejected attacker");
      } catch (err: any) {
        expect(err.toString()).to.match(/NotAssignedCourier|AccountNotInitialized/);
      }
    });

    it("rejects double confirmation by the legitimate courier", async () => {
      const courierRep = repPda(program.programId, courier.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier.publicKey,
          legAccount: legPda,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          courierReputation: courierRep,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier])
        .rpc();

      try {
        await program.methods
          .confirmLeg()
          .accounts({
            courier: courier.publicKey,
            legAccount: legPda,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            courierReputation: courierRep,
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
    let packagePda: PublicKey;
    let vaultPda: PublicKey;
    let swarmPda: PublicKey;

    before(async () => {
      await airdrop(provider, attacker.publicKey);

      [packagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(packageId)],
        program.programId,
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), packagePda.toBuffer()],
        program.programId,
      );
      [swarmPda] = PublicKey.findProgramAddressSync(
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

  // ─── Reputation cannot be manipulated externally (C-2) ─────────

  describe("security: reputation can only move via verified protocol actions", () => {
    it("there is no standalone update_reputation instruction", () => {
      // Compile-time check: the IDL no longer contains update_reputation
      const ixNames = (program.idl as any).instructions.map((i: any) => i.name);
      expect(ixNames).to.not.include("updateReputation");
      expect(ixNames).to.not.include("update_reputation");
    });

    it("legs_accepted only increments via assign_leg (signed by coordinator)", async () => {
      const courier = Keypair.generate();
      const newPackageId = uuidToBytes();
      await airdrop(provider, courier.publicKey);

      const [pkgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(newPackageId)],
        program.programId,
      );
      const [vPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pkgPda.toBuffer()],
        program.programId,
      );
      const [sPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swarm"), pkgPda.toBuffer()],
        program.programId,
      );
      const [lPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), sPda.toBuffer(), Buffer.from([0])],
        program.programId,
      );
      const courierRep = repPda(program.programId, courier.publicKey);

      await program.methods
        .listPackage(newPackageId, new anchor.BN(LAMPORTS_PER_SOL), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .formSwarm(1, new anchor.BN(LAMPORTS_PER_SOL * 0.3))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .assignLeg(0, courier.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.3))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          legAccount: lPda,
          courierReputation: courierRep,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Initial state: accepted=1, completed=0, score=0
      let rep = await program.account.agentReputationAccount.fetch(courierRep);
      expect(rep.legsAccepted).to.equal(1);
      expect(rep.legsCompleted).to.equal(0);
      expect(rep.reliabilityScore).to.equal(0);

      // After confirm: completed=1, score=100
      await program.methods
        .confirmLeg()
        .accounts({
          courier: courier.publicKey,
          legAccount: lPda,
          swarmAccount: sPda,
          packageAccount: pkgPda,
          vault: vPda,
          courierReputation: courierRep,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier])
        .rpc();

      rep = await program.account.agentReputationAccount.fetch(courierRep);
      expect(rep.legsCompleted).to.equal(1);
      expect(rep.reliabilityScore).to.equal(100);
    });
  });

  // ─── Cancel + refund ───────────────────────────────────────────

  describe("cancel_package refunds shipper", () => {
    it("cancels listed package and refunds vault", async () => {
      const newPackageId = uuidToBytes();
      const [pkgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(newPackageId)],
        program.programId,
      );
      const [vPda] = PublicKey.findProgramAddressSync(
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
