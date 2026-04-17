import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { Transaction, PublicKey } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import {
  buildListPackageIx,
  buildCancelPackageIx,
  uuidToBytes,
} from "@swarmhaul/sdk";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { getSolana, explorerUrl, explorerTxUrl } from "../services/solana.js";
import {
  PackageCreateBody,
  PackageIdParam,
  PackageBuildTxBody,
  PackageConfirmBody,
} from "../schemas/index.js";

type PackageBody = z.infer<typeof PackageCreateBody>;
type PackageParams = z.infer<typeof PackageIdParam>;
type PackageBuildTxType = z.infer<typeof PackageBuildTxBody>;
type PackageConfirmType = z.infer<typeof PackageConfirmBody>;

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

  // Wallet-signed dispatch — step 1: build an unsigned list_package tx
  // for the shipper's wallet to sign. We do NOT persist to the DB yet;
  // persistence happens in /confirm once the tx lands on chain. This
  // avoids orphan rows if the user never signs.
  app.post(
    "/build-tx",
    { schema: { body: PackageBuildTxBody } },
    async (req, reply) => {
      const body = req.body as PackageBuildTxType;

      // If authed, ensure the shipper pubkey in body is the signer
      if (req.authedPubkey && req.authedPubkey !== body.shipperPubkey) {
        return reply.code(403).send({
          error: "shipperPubkey must match authed wallet",
        });
      }

      try {
        const { sdk, coordinator } = getSolana();
        const packageId = randomUUID();
        const idBytes = uuidToBytes(packageId);
        const shipper = new PublicKey(body.shipperPubkey);

        const {
          ix,
          package: pkgPda,
          vault: vPda,
        } = await buildListPackageIx(sdk, {
          shipper,
          packageId: idBytes,
          maxBudgetLamports: solToLamports(body.maxBudgetSol),
          coordinator: coordinator.publicKey,
        });

        const { blockhash, lastValidBlockHeight } =
          await sdk.connection.getLatestBlockhash();

        const tx = new Transaction().add(ix);
        tx.feePayer = shipper;
        tx.recentBlockhash = blockhash;

        const serialized = tx
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString("base64");

        return reply.code(200).send({
          packageId,
          transaction: serialized,
          onChainPackage: pkgPda.toBase58(),
          onChainVault: vPda.toBase58(),
          blockhash,
          lastValidBlockHeight,
        });
      } catch (err) {
        app.log.error({ err }, "build_list_package_tx failed");
        return reply.code(500).send({
          error: "Failed to build list_package tx",
          details: String(err),
        });
      }
    },
  );

  // Wallet-signed dispatch — step 2: verify the signed tx landed on
  // chain, then persist the package row.
  app.post(
    "/confirm",
    { schema: { body: PackageConfirmBody } },
    async (req, reply) => {
      const body = req.body as PackageConfirmType;

      if (req.authedPubkey && req.authedPubkey !== body.shipperPubkey) {
        return reply.code(403).send({
          error: "shipperPubkey must match authed wallet",
        });
      }

      try {
        const { sdk } = getSolana();

        // Verify the tx actually landed and references our program
        const confirmed = await sdk.connection.confirmTransaction(
          body.signature,
          "confirmed",
        );
        if (confirmed.value.err) {
          return reply.code(400).send({
            error: "Transaction failed on-chain",
            details: JSON.stringify(confirmed.value.err),
          });
        }

        const pkg = await prisma.package.create({
          data: {
            id: body.packageId,
            shipperPubkey: body.shipperPubkey,
            originLat: body.originLat,
            originLng: body.originLng,
            destLat: body.destLat,
            destLng: body.destLng,
            description: body.description,
            weightKg: body.weightKg,
            volumeLitres: body.volumeLitres,
            maxBudgetSol: body.maxBudgetSol,
            onChainPackage: body.onChainPackage,
            onChainVault: body.onChainVault,
            listSignature: body.signature,
            status: "listed",
          },
        });

        broadcast({
          type: "PACKAGE_LISTED",
          package: {
            id: pkg.id,
            shipper: pkg.shipperPubkey,
            origin: { lat: pkg.originLat, lng: pkg.originLng },
            destination: { lat: pkg.destLat, lng: pkg.destLng },
            description: pkg.description,
            weightKg: pkg.weightKg,
            volumeLitres: pkg.volumeLitres,
            maxBudgetSol: pkg.maxBudgetSol,
            status: "listed",
            listedAt: pkg.listedAt,
          },
        });

        return reply.code(201).send({
          ...pkg,
          links: {
            explorer: explorerUrl(body.onChainPackage),
            listTx: explorerTxUrl(body.signature),
          },
        });
      } catch (err) {
        app.log.error({ err }, "confirm_list_package failed");
        return reply.code(500).send({
          error: "Failed to confirm package",
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

      // Only the original shipper can cancel (when authed)
      if (req.authedPubkey && req.authedPubkey !== pkg.shipperPubkey)
        return reply
          .code(403)
          .send({ error: "Only the shipper can cancel this package" });

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
