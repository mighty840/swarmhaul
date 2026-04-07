import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { Transaction, PublicKey } from "@solana/web3.js";
import {
  buildListPackageIx,
  buildCancelPackageIx,
  uuidToBytes,
} from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { getSolana, explorerUrl, explorerTxUrl } from "../services/solana.js";
import { PackageCreateBody, PackageIdParam } from "../schemas/index.js";

type PackageBody = z.infer<typeof PackageCreateBody>;
type PackageParams = z.infer<typeof PackageIdParam>;

function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

export async function packageRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.package.findMany({
      orderBy: { listedAt: "desc" },
      include: { swarm: { include: { legs: true } } },
      take: 50,
    });
  });

  app.get(
    "/:id",
    { schema: { params: PackageIdParam } },
    async (req, reply) => {
      const { id } = req.params as PackageParams;
      const pkg = await prisma.package.findUnique({
        where: { id },
        include: { swarm: { include: { legs: true } } },
      });
      if (!pkg) return reply.code(404).send({ error: "Package not found" });

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
    },
  );

  app.post(
    "/",
    { schema: { body: PackageCreateBody } },
    async (req, reply) => {
      const body = req.body as PackageBody;
      const pkg = await prisma.package.create({ data: body });

      try {
        const { sdk, coordinator } = getSolana();
        const idBytes = uuidToBytes(pkg.id);
        const { ix, package: pkgPda, vault: vPda } = await buildListPackageIx(
          sdk,
          {
            shipper: coordinator.publicKey,
            packageId: idBytes,
            maxBudgetLamports: solToLamports(pkg.maxBudgetSol),
            coordinator: coordinator.publicKey,
          },
        );

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
        await prisma.package.update({
          where: { id: pkg.id },
          data: { status: "failed" },
        });
        return reply.code(500).send({
          error: "Failed to list package on-chain",
          details: String(err),
        });
      }
    },
  );

  app.delete(
    "/:id",
    { schema: { params: PackageIdParam } },
    async (req, reply) => {
      const { id } = req.params as PackageParams;
      const pkg = await prisma.package.findUnique({ where: { id } });
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
        where: { id },
        data: { status: "failed" },
      });
      return { success: true };
    },
  );
}
