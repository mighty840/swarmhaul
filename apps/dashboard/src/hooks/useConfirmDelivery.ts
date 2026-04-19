import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface ConfirmDeliveryInput {
  legId: string;
  courierPubkey: string;
}

export interface ConfirmDeliveryResult {
  legId: string;
  signature: string;
  explorerUrl: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "awaiting-signature" }
  | { kind: "sending" }
  | { kind: "confirming" }
  | { kind: "persisting" }
  | { kind: "done"; result: ConfirmDeliveryResult }
  | { kind: "error"; message: string };

export function useConfirmDelivery() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const confirm = useCallback(
    async (input: ConfirmDeliveryInput): Promise<ConfirmDeliveryResult | null> => {
      if (!connected || !publicKey || (!signTransaction && !sendTransaction)) {
        setPhase({ kind: "error", message: "Connect your shipper wallet first" });
        return null;
      }

      try {
        setPhase({ kind: "building" });
        const buildRes = await fetch(
          `${API_URL}/swarms/legs/${input.legId}/build-confirm-tx`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientPubkey: publicKey.toBase58(),
            }),
          },
        );
        if (!buildRes.ok) {
          const body = await buildRes.text();
          throw new Error(`build-confirm-tx failed: ${body}`);
        }
        const { transaction, blockhash, lastValidBlockHeight } =
          (await buildRes.json()) as {
            transaction: string;
            blockhash: string;
            lastValidBlockHeight: number;
          };

        const tx = Transaction.from(
          Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0)),
        );

        setPhase({ kind: "awaiting-signature" });
        const signature = await sendTransaction(tx, connection, {
          skipPreflight: true,
          maxRetries: 3,
        });

        setPhase({ kind: "confirming" });
        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (confirmation.value.err) {
          throw new Error(
            `on-chain confirm_leg failed: ${JSON.stringify(confirmation.value.err)}`,
          );
        }

        setPhase({ kind: "persisting" });
        const mirrorRes = await fetch(
          `${API_URL}/swarms/legs/${input.legId}/confirm`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentPubkey: input.courierPubkey,
              recipientPubkey: publicKey.toBase58(),
              confirmSignature: signature,
            }),
          },
        );
        if (!mirrorRes.ok) {
          const body = await mirrorRes.text();
          throw new Error(`API mirror failed: ${body}`);
        }

        const result: ConfirmDeliveryResult = {
          legId: input.legId,
          signature,
          explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        };
        setPhase({ kind: "done", result });
        return result;
      } catch (err: any) {
        const message = err?.message ?? String(err);
        setPhase({ kind: "error", message });
        return null;
      }
    },
    [connected, publicKey, signTransaction, sendTransaction, connection],
  );

  return { confirm, phase, reset: () => setPhase({ kind: "idle" }) };
}
