import type { FastifyInstance } from "fastify";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  buildListPackageIx,
  buildCancelPackageIx,
  uuidToBytes,
} from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { getSolana, explorerUrl, explorerTxUrl } from "../services/solana.js";

const SOL_TO_LAMPORTS = 1_000_000_000n;
function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

export async function packageRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.package.findMany({
      orderBy: { listedAt: "desc" },
      include: { swarm: { include: { legs: true } } },
    });
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const pkg = await prisma.package.findUnique({
      where: { id: req.params.id },
      include: { swarm: { include: { legs: true } } },
    });
    if (!pkg) return reply.code(404).send({ error: "Package not found" });

    // Enrich with explorer links
    return {
      ...pkg,
      links: {
        explorer: pkg.onChainPackage ? explorerUrl(pkg.onChainPackage) : null,
        listTx: pkg.listSignature ? explorerTxUrl(pkg.listSignature) : null,
        formTx: pkg.swarm?.formSignature
          ? explorerTxUrl(pkg.swarm.formSignature)
          : null,
      },
    };
  });

  app.post("/", async (req, reply) => {
    const body = req.body as {
      shipperPubkey: string;
      originLat: number;
      originLng: number;
      destLat: number;
      destLng: number;
      description: string;
      weightKg: number;
      volumeLitres: number;
      maxBudgetSol: number;
    };

    // 1. Create the DB row first to get a UUID
    const pkg = await prisma.package.create({ data: body });

    // 2. Build + sign + send list_package on devnet
    //    For the hackathon demo, the coordinator pays the escrow on behalf
    //    of the shipper (since we don't yet have wallet adapter sign flow).
    //    The package coordinator field is set to the protocol authority.
    try {
      const { sdk, coordinator } = getSolana();
      const idBytes = uuidToBytes(pkg.id);
      const { ix, package: pkgPda, vault: vPda } = await buildListPackageIx(sdk, {
        shipper: coordinator.publicKey, // demo: coordinator IS the shipper on-chain
        packageId: idBytes,
        maxBudgetLamports: solToLamports(pkg.maxBudgetSol),
        coordinator: coordinator.publicKey,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = coordinator.publicKey;
      const { blockhash } = await sdk.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(coordinator);

      const signature = await sdk.connection.sendRawTransaction(tx.serialize());
      await sdk.connection.confirmTransaction(signature, "confirmed");

      const updated = await prisma.package.update({
        where: { id: pkg.id },
        data: {
          onChainPackage: pkgPda.toBase58(),
          onChainVault: vPda.toBase58(),
          listSignature: signature,
        },
      });

      broadcast({
        type: "PACKAGE_LISTED",
        package: {
          id: updated.id,
          shipper: updated.shipperPubkey,
          origin: { lat: updated.originLat, lng: updated.originLng },
          destination: { lat: updated.destLat, lng: updated.destLng },
          description: updated.description,
          weightKg: updated.weightKg,
          volumeLitres: updated.volumeLitres,
          maxBudgetSol: updated.maxBudgetSol,
          status: "listed",
          listedAt: updated.listedAt,
        },
      });

      return reply.code(201).send({
        ...updated,
        links: {
          explorer: explorerUrl(pkgPda),
          listTx: explorerTxUrl(signature),
        },
      });
    } catch (err) {
      app.log.error({ err }, "list_package on-chain failed");
      // Mark as failed but keep the row for debugging
      await prisma.package.update({
        where: { id: pkg.id },
        data: { status: "failed" },
      });
      return reply.code(500).send({
        error: "Failed to list package on-chain",
        details: String(err),
      });
    }
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const pkg = await prisma.package.findUnique({
      where: { id: req.params.id },
    });
    if (!pkg) return reply.code(404).send({ error: "Package not found" });
    if (pkg.status !== "listed")
      return reply.code(400).send({ error: "Can only cancel listed packages" });

    if (pkg.onChainPackage) {
      try {
        const { sdk, coordinator } = getSolana();
        const ix = await buildCancelPackageIx(sdk, {
          shipper: coordinator.publicKey,
          packageAccount: new PublicKey(pkg.onChainPackage),
        });
        const tx = new Transaction().add(ix);
        tx.feePayer = coordinator.publicKey;
        const { blockhash } = await sdk.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.sign(coordinator);
        await sdk.connection.sendRawTransaction(tx.serialize());
      } catch (err) {
        app.log.error({ err }, "cancel_package on-chain failed");
      }
    }

    await prisma.package.update({
      where: { id: req.params.id },
      data: { status: "failed" },
    });
    return { success: true };
  });
}
