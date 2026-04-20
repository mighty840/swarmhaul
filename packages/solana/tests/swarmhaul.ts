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

  // NOTE: confirm_leg is recipient-signs. For single-leg swarms the
  // recipient is the package shipper. Multi-leg intermediate-hop
  // handoff auth is covered in a dedicated describe() block below.
  describe("happy path: list → form → assign → shipper confirms → settle", () => {
    const courier1 = Keypair.generate();
    const packageId = uuidToBytes();
    const budgetLamports = new anchor.BN(LAMPORTS_PER_SOL);
    let packagePda: PublicKey;
    let vaultPda: PublicKey;
    let swarmPda: PublicKey;
    let leg0Pda: PublicKey;

    before(async () => {
      await airdrop(provider, courier1.publicKey);

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

    it("forms swarm with 1 leg (coordinator-only)", async () => {
      await program.methods
        .formSwarm(1, new anchor.BN(LAMPORTS_PER_SOL * 0.4))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: packagePda,
          swarmAccount: swarmPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.totalLegs).to.equal(1);
      expect(swarm.assignedLegs).to.equal(0);
      expect(swarm.status).to.deep.equal({ forming: {} });
    });

    it("assigns leg 0 to courier1 → swarm becomes Active", async () => {
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

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.assignedLegs).to.equal(1);
      expect(swarm.status).to.deep.equal({ active: {} });

      const rep = await program.account.agentReputationAccount.fetch(courier1Rep);
      expect(rep.legsAccepted).to.equal(1);
      expect(rep.legsCompleted).to.equal(0);
    });

    it("shipper (recipient) confirms leg → courier paid 0.4 SOL + rep 100%", async () => {
      const courier1Rep = repPda(program.programId, courier1.publicKey);
      const before = await provider.connection.getBalance(courier1.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          recipient: shipper.publicKey,
          courier: courier1.publicKey,
          legAccount: leg0Pda,
          nextLegAccount: null,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          courierReputation: courier1Rep,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await provider.connection.getBalance(courier1.publicKey);
      expect(after - before).to.equal(LAMPORTS_PER_SOL * 0.4);

      const rep = await program.account.agentReputationAccount.fetch(courier1Rep);
      expect(rep.legsCompleted).to.equal(1);
      expect(rep.legsAccepted).to.equal(1);
      expect(rep.reliabilityScore).to.equal(100);

      const pkg = await program.account.packageAccount.fetch(packagePda);
      expect(pkg.status).to.deep.equal({ inTransit: {} });

      const swarm = await program.account.swarmAccount.fetch(swarmPda);
      expect(swarm.completedLegs).to.equal(1);
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

      // M-4: swarm account should be closed (rent returned to shipper)
      try {
        await program.account.swarmAccount.fetch(swarmPda);
        expect.fail("swarm account should be closed after settle");
      } catch (err: any) {
        expect(err.toString()).to.match(/Account does not exist|Could not find/);
      }
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

    it("rejects courier self-confirming (must be shipper)", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: courier.publicKey,
            courier: courier.publicKey,
            legAccount: legPda,
            nextLegAccount: null,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            courierReputation: repPda(program.programId, courier.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([courier])
          .rpc();
        expect.fail("should have rejected courier self-confirmation");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedRecipient/);
      }
    });

    it("rejects random attacker posing as recipient", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: attacker.publicKey,
            courier: courier.publicKey,
            legAccount: legPda,
            nextLegAccount: null,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            courierReputation: repPda(program.programId, courier.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have rejected attacker");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedRecipient/);
      }
    });

    it("rejects double confirmation by the shipper", async () => {
      const courierRep = repPda(program.programId, courier.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          recipient: shipper.publicKey,
          courier: courier.publicKey,
          legAccount: legPda,
          nextLegAccount: null,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          courierReputation: courierRep,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: shipper.publicKey,
            courier: courier.publicKey,
            legAccount: legPda,
            nextLegAccount: null,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            courierReputation: courierRep,
            systemProgram: SystemProgram.programId,
          })
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

      // After confirm (signed by shipper/recipient): completed=1, score=100
      await program.methods
        .confirmLeg()
        .accounts({
          recipient: shipper.publicKey,
          courier: courier.publicKey,
          legAccount: lPda,
          nextLegAccount: null,
          swarmAccount: sPda,
          packageAccount: pkgPda,
          vault: vPda,
          courierReputation: courierRep,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      rep = await program.account.agentReputationAccount.fetch(courierRep);
      expect(rep.legsCompleted).to.equal(1);
      expect(rep.reliabilityScore).to.equal(100);
    });
  });

  // ─── Multi-leg handoff auth ──────────────────────────────────
  //
  // Protocol v2: intermediate legs must be confirmed by the next-hop
  // courier (handoff attestation), the final leg by the shipper, and
  // legs must confirm in strict index order.

  describe("multi-leg handoff auth", () => {
    const courier0 = Keypair.generate();
    const courier1 = Keypair.generate();
    const wrongCourier = Keypair.generate();
    const packageId = uuidToBytes();
    let pkgPda: PublicKey;
    let vPda: PublicKey;
    let sPda: PublicKey;
    let l0Pda: PublicKey;
    let l1Pda: PublicKey;

    before(async () => {
      await airdrop(provider, courier0.publicKey);
      await airdrop(provider, courier1.publicKey);
      await airdrop(provider, wrongCourier.publicKey);

      [pkgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(packageId)],
        program.programId,
      );
      [vPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pkgPda.toBuffer()],
        program.programId,
      );
      [sPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("swarm"), pkgPda.toBuffer()],
        program.programId,
      );
      [l0Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), sPda.toBuffer(), Buffer.from([0])],
        program.programId,
      );
      [l1Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("leg"), sPda.toBuffer(), Buffer.from([1])],
        program.programId,
      );

      await program.methods
        .listPackage(packageId, new anchor.BN(LAMPORTS_PER_SOL), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .formSwarm(2, new anchor.BN(LAMPORTS_PER_SOL * 0.6))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .assignLeg(0, courier0.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.3))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          legAccount: l0Pda,
          courierReputation: repPda(program.programId, courier0.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .assignLeg(1, courier1.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.3))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          legAccount: l1Pda,
          courierReputation: repPda(program.programId, courier1.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects out-of-order confirm (leg 1 before leg 0)", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: shipper.publicKey,
            courier: courier1.publicKey,
            legAccount: l1Pda,
            nextLegAccount: null,
            swarmAccount: sPda,
            packageAccount: pkgPda,
            vault: vPda,
            courierReputation: repPda(program.programId, courier1.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should reject out-of-order confirm");
      } catch (err: any) {
        expect(err.toString()).to.match(/LegOutOfOrder/);
      }
    });

    it("rejects intermediate confirm without next_leg_account", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: courier1.publicKey,
            courier: courier0.publicKey,
            legAccount: l0Pda,
            nextLegAccount: null,
            swarmAccount: sPda,
            packageAccount: pkgPda,
            vault: vPda,
            courierReputation: repPda(program.programId, courier0.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([courier1])
          .rpc();
        expect.fail("should require next_leg_account for intermediate leg");
      } catch (err: any) {
        expect(err.toString()).to.match(/MissingNextLeg/);
      }
    });

    it("rejects intermediate confirm by shipper (wrong recipient)", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: shipper.publicKey,
            courier: courier0.publicKey,
            legAccount: l0Pda,
            nextLegAccount: l1Pda,
            swarmAccount: sPda,
            packageAccount: pkgPda,
            vault: vPda,
            courierReputation: repPda(program.programId, courier0.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("shipper should not confirm an intermediate leg");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedRecipient/);
      }
    });

    it("rejects intermediate confirm by wrong next-hop courier", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: wrongCourier.publicKey,
            courier: courier0.publicKey,
            legAccount: l0Pda,
            nextLegAccount: l1Pda,
            swarmAccount: sPda,
            packageAccount: pkgPda,
            vault: vPda,
            courierReputation: repPda(program.programId, courier0.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([wrongCourier])
          .rpc();
        expect.fail("wrong courier should not confirm an intermediate leg");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedRecipient/);
      }
    });

    it("courier1 confirms leg 0 (handoff) → courier0 paid 0.3 SOL", async () => {
      const before = await provider.connection.getBalance(courier0.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          recipient: courier1.publicKey,
          courier: courier0.publicKey,
          legAccount: l0Pda,
          nextLegAccount: l1Pda,
          swarmAccount: sPda,
          packageAccount: pkgPda,
          vault: vPda,
          courierReputation: repPda(program.programId, courier0.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .signers([courier1])
        .rpc();

      const after = await provider.connection.getBalance(courier0.publicKey);
      expect(after - before).to.equal(LAMPORTS_PER_SOL * 0.3);

      const swarm = await program.account.swarmAccount.fetch(sPda);
      expect(swarm.completedLegs).to.equal(1);

      const pkg = await program.account.packageAccount.fetch(pkgPda);
      expect(pkg.status).to.deep.equal({ inTransit: {} });
    });

    it("rejects final confirm with unexpected next_leg_account", async () => {
      try {
        await program.methods
          .confirmLeg()
          .accounts({
            recipient: shipper.publicKey,
            courier: courier1.publicKey,
            legAccount: l1Pda,
            // passing l0 back in as next_leg_account is nonsense for the
            // final leg — the program must reject rather than silently accept.
            nextLegAccount: l0Pda,
            swarmAccount: sPda,
            packageAccount: pkgPda,
            vault: vPda,
            courierReputation: repPda(program.programId, courier1.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("final leg must not accept a next_leg_account");
      } catch (err: any) {
        // Anchor validates the next_leg_account constraint (leg_index
        // relationship) before the handler runs, so the outer LegOutOfOrder
        // constraint fires first when the supplied "next" isn't really next.
        expect(err.toString()).to.match(/LegOutOfOrder|UnexpectedNextLeg/);
      }
    });

    it("shipper confirms final leg → courier1 paid, swarm fully complete", async () => {
      const before = await provider.connection.getBalance(courier1.publicKey);

      await program.methods
        .confirmLeg()
        .accounts({
          recipient: shipper.publicKey,
          courier: courier1.publicKey,
          legAccount: l1Pda,
          nextLegAccount: null,
          swarmAccount: sPda,
          packageAccount: pkgPda,
          vault: vPda,
          courierReputation: repPda(program.programId, courier1.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await provider.connection.getBalance(courier1.publicKey);
      expect(after - before).to.equal(LAMPORTS_PER_SOL * 0.3);

      const swarm = await program.account.swarmAccount.fetch(sPda);
      expect(swarm.completedLegs).to.equal(2);
      expect(swarm.totalLegs).to.equal(2);
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

      // M-4: package account should be closed (rent returned to shipper)
      try {
        await program.account.packageAccount.fetch(pkgPda);
        expect.fail("package account should be closed after cancel");
      } catch (err: any) {
        expect(err.toString()).to.match(/Account does not exist|Could not find/);
      }
    });
  });

  // ─── Additional negative tests: auth, bounds, state machine ─────

  describe("security: assign_leg + settle authorization + edge cases", () => {
    const attacker = Keypair.generate();
    const courier = Keypair.generate();
    const packageId = uuidToBytes();
    let packagePda: PublicKey;
    let vaultPda: PublicKey;
    let swarmPda: PublicKey;
    let legPda: PublicKey;

    before(async () => {
      await airdrop(provider, attacker.publicKey);
      await airdrop(provider, courier.publicKey);

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

      // Setup: list + form with 1 leg
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
    });

    it("rejects assign_leg by non-coordinator", async () => {
      try {
        await program.methods
          .assignLeg(0, courier.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.5))
          .accounts({
            coordinator: attacker.publicKey,
            packageAccount: packagePda,
            swarmAccount: swarmPda,
            legAccount: legPda,
            courierReputation: repPda(program.programId, courier.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("attacker should not assign legs");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedCoordinator/);
      }
    });

    it("rejects assign_leg with out-of-bounds index", async () => {
      try {
        const [badLegPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("leg"), swarmPda.toBuffer(), Buffer.from([99])],
          program.programId,
        );
        await program.methods
          .assignLeg(99, courier.publicKey, new anchor.BN(LAMPORTS_PER_SOL * 0.1))
          .accounts({
            coordinator: shipper.publicKey,
            packageAccount: packagePda,
            swarmAccount: swarmPda,
            legAccount: badLegPda,
            courierReputation: repPda(program.programId, courier.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should reject out-of-bounds leg index");
      } catch (err: any) {
        expect(err.toString()).to.match(/LegIndexOutOfBounds/);
      }
    });

    it("rejects settle before all legs are complete", async () => {
      // First assign the leg so swarm becomes Active
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

      // Now try to settle without confirming the leg
      try {
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
        expect.fail("should reject settle before legs complete");
      } catch (err: any) {
        expect(err.toString()).to.match(/LegsNotComplete/);
      }
    });

    it("rejects settle by non-coordinator", async () => {
      // Confirm the leg first (signed by shipper/recipient) so settle WOULD succeed
      await program.methods
        .confirmLeg()
        .accounts({
          recipient: shipper.publicKey,
          courier: courier.publicKey,
          legAccount: legPda,
          nextLegAccount: null,
          swarmAccount: swarmPda,
          packageAccount: packagePda,
          vault: vaultPda,
          courierReputation: repPda(program.programId, courier.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .settle()
          .accounts({
            coordinator: attacker.publicKey,
            swarmAccount: swarmPda,
            packageAccount: packagePda,
            vault: vaultPda,
            shipper: shipper.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("attacker should not settle");
      } catch (err: any) {
        expect(err.toString()).to.match(/UnauthorizedCoordinator/);
      }
    });
  });

  describe("security: cancel_package authorization + state", () => {
    it("rejects cancel by non-shipper", async () => {
      const attacker = Keypair.generate();
      await airdrop(provider, attacker.publicKey);

      const pkgId = uuidToBytes();
      const [pkgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(pkgId)],
        program.programId,
      );
      const [vPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pkgPda.toBuffer()],
        program.programId,
      );

      await program.methods
        .listPackage(pkgId, new anchor.BN(LAMPORTS_PER_SOL * 0.2), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .cancelPackage()
          .accounts({
            shipper: attacker.publicKey,
            packageAccount: pkgPda,
            vault: vPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("non-shipper should not cancel");
      } catch (err: any) {
        expect(err.toString()).to.match(/ConstraintRaw|Constraint|2003/);
      }
    });

    it("rejects cancel after swarm has formed (status != Listed)", async () => {
      const pkgId = uuidToBytes();
      const [pkgPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("package"), Buffer.from(pkgId)],
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

      await program.methods
        .listPackage(pkgId, new anchor.BN(LAMPORTS_PER_SOL * 0.2), shipper.publicKey)
        .accounts({
          shipper: shipper.publicKey,
          packageAccount: pkgPda,
          vault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .formSwarm(1, new anchor.BN(LAMPORTS_PER_SOL * 0.1))
        .accounts({
          coordinator: shipper.publicKey,
          packageAccount: pkgPda,
          swarmAccount: sPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Package is now SwarmForming, not Listed
      try {
        await program.methods
          .cancelPackage()
          .accounts({
            shipper: shipper.publicKey,
            packageAccount: pkgPda,
            vault: vPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should not cancel after swarm forms");
      } catch (err: any) {
        expect(err.toString()).to.match(/CannotCancel/);
      }
    });
  });

  // ─── H-4: vehicle registration cannot be silently overwritten ───

  describe("security: register_vehicle uses init (not init_if_needed)", () => {
    const courier = Keypair.generate();

    before(async () => {
      await airdrop(provider, courier.publicKey);
    });

    it("first registration succeeds", async () => {
      const [vehiclePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vehicle"), courier.publicKey.toBuffer()],
        program.programId,
      );

      await program.methods
        .registerVehicle(
          new anchor.BN(100_000),
          320,
          false,
        )
        .accounts({
          owner: courier.publicKey,
          vehicleProfile: vehiclePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([courier])
        .rpc();

      const profile = await program.account.vehicleProfileAccount.fetch(vehiclePda);
      expect(profile.bootVolumeLitres).to.equal(320);
    });

    it("second registration (same owner) is rejected", async () => {
      const [vehiclePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vehicle"), courier.publicKey.toBuffer()],
        program.programId,
      );

      try {
        await program.methods
          .registerVehicle(
            new anchor.BN(200_000),
            500,
            true,
          )
          .accounts({
            owner: courier.publicKey,
            vehicleProfile: vehiclePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([courier])
          .rpc();
        expect.fail("should reject duplicate registration");
      } catch (err: any) {
        // Anchor rejects init on an already-initialized PDA
        expect(err.toString()).to.match(/already in use|already been used/i);
      }
    });

    it("update_vehicle works for existing owner", async () => {
      const [vehiclePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vehicle"), courier.publicKey.toBuffer()],
        program.programId,
      );

      await program.methods
        .updateVehicle(
          new anchor.BN(200_000),
          500,
          true,
        )
        .accounts({
          owner: courier.publicKey,
          vehicleProfile: vehiclePda,
        })
        .signers([courier])
        .rpc();

      const profile = await program.account.vehicleProfileAccount.fetch(vehiclePda);
      expect(profile.bootVolumeLitres).to.equal(500);
      expect(profile.isAutonomous).to.equal(true);
    });
  });
});
