import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface ListPackageInput {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
}

export interface ListPackageResult {
  packageId: string;
  signature: string;
  onChainPackage: string;
  explorerUrl: string;
  listTxUrl: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "awaiting-signature" }
  | { kind: "sending" }
  | { kind: "confirming" }
  | { kind: "persisting" }
  | { kind: "done"; result: ListPackageResult }
  | { kind: "error"; message: string };

export function useListPackage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const dispatch = useCallback(
    async (input: ListPackageInput): Promise<ListPackageResult | null> => {
      if (!connected || !publicKey || !signTransaction) {
        setPhase({ kind: "error", message: "Connect a wallet first" });
        return null;
      }

      try {
        setPhase({ kind: "building" });
        const buildRes = await fetch(`${API_URL}/packages/build-tx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipperPubkey: publicKey.toBase58(),
            ...input,
          }),
        });
        if (!buildRes.ok) {
          const body = await buildRes.text();
          throw new Error(`build-tx failed: ${body}`);
        }
        const {
          packageId,
          transaction,
          onChainPackage,
          onChainVault,
        } = (await buildRes.json()) as {
          packageId: string;
          transaction: string;
          onChainPackage: string;
          onChainVault: string;
          blockhash: string;
          lastValidBlockHeight: number;
        };

        setPhase({ kind: "awaiting-signature" });
        const tx = Transaction.from(Buffer.from(transaction, "base64"));
        const signed = await signTransaction(tx);

        setPhase({ kind: "sending" });
        const signature = await connection.sendRawTransaction(
          signed.serialize(),
          { skipPreflight: false, maxRetries: 3 },
        );

        setPhase({ kind: "confirming" });
        const confirmation = await connection.confirmTransaction(
          signature,
          "confirmed",
        );
        if (confirmation.value.err) {
          throw new Error(
            `on-chain tx failed: ${JSON.stringify(confirmation.value.err)}`,
          );
        }

        setPhase({ kind: "persisting" });
        const confirmRes = await fetch(`${API_URL}/packages/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            signature,
            shipperPubkey: publicKey.toBase58(),
            onChainPackage,
            onChainVault,
            ...input,
          }),
        });
        if (!confirmRes.ok) {
          const body = await confirmRes.text();
          throw new Error(`confirm failed: ${body}`);
        }
        const persisted = (await confirmRes.json()) as {
          links: { explorer: string; listTx: string };
        };

        const result: ListPackageResult = {
          packageId,
          signature,
          onChainPackage,
          explorerUrl: persisted.links.explorer,
          listTxUrl: persisted.links.listTx,
        };
        setPhase({ kind: "done", result });
        return result;
      } catch (err: any) {
        const message = err?.message ?? String(err);
        setPhase({ kind: "error", message });
        return null;
      }
    },
    [connected, publicKey, signTransaction, connection],
  );

  return { dispatch, phase, reset: () => setPhase({ kind: "idle" }) };
}
