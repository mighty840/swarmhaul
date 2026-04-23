import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import type { DigitalTask } from "@swarmhaul/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface PostDigitalTaskInput {
  title: string;
  description: string;
  maxBudgetSol: number;
}

export interface PostDigitalTaskResult {
  task: DigitalTask;
  signature: string;
  explorerUrl: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "planning" }
  | { kind: "awaiting-signature"; legs: Array<{ instruction: string }> }
  | { kind: "sending" }
  | { kind: "confirming" }
  | { kind: "persisting" }
  | { kind: "done"; result: PostDigitalTaskResult }
  | { kind: "error"; message: string };

export function usePostDigitalTask() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const dispatch = useCallback(
    async (input: PostDigitalTaskInput): Promise<PostDigitalTaskResult | null> => {
      if (!connected || !publicKey || !sendTransaction) {
        setPhase({ kind: "error", message: "Connect a wallet first" });
        return null;
      }

      try {
        setPhase({ kind: "planning" });
        const buildRes = await fetch(`${API_URL}/digital-tasks/build-tx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shipperPubkey: publicKey.toBase58(), ...input }),
        });
        if (!buildRes.ok) throw new Error(`build-tx failed: ${await buildRes.text()}`);

        const { taskId, legs, transaction, blockhash, lastValidBlockHeight, onChainTask, onChainVault } = (await buildRes.json()) as {
          taskId: string;
          legs: Array<{ instruction: string }>;
          transaction: string;
          blockhash: string;
          lastValidBlockHeight: number;
          onChainTask: string;
          onChainVault: string;
        };

        setPhase({ kind: "awaiting-signature", legs });

        const txBytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
        const tx = Transaction.from(txBytes);

        setPhase({ kind: "sending" });
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
          throw new Error(`on-chain tx failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        setPhase({ kind: "persisting" });
        const confirmRes = await fetch(`${API_URL}/digital-tasks/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipperPubkey: publicKey.toBase58(),
            ...input,
            signature,
            taskId,
            onChainTask,
            onChainVault,
            legs,
          }),
        });
        if (!confirmRes.ok) throw new Error(`confirm failed: ${await confirmRes.text()}`);

        const data = (await confirmRes.json()) as DigitalTask & { links: { listTx: string } };
        const result: PostDigitalTaskResult = {
          task: data,
          signature,
          explorerUrl: data.links.listTx,
        };

        setPhase({ kind: "done", result });
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setPhase({ kind: "error", message });
        return null;
      }
    },
    [connected, publicKey, sendTransaction, connection],
  );

  return { dispatch, phase, reset: () => setPhase({ kind: "idle" }) };
}
