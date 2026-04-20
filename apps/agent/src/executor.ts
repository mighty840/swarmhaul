/**
 * Agent execution loop.
 *
 * In v1 agents only bid — the on-chain `confirm_leg` instructions were
 * driven by the shipper (final leg) and, for multi-leg swarms, by
 * nobody (the protocol guard refused). With multi-leg handoff auth
 * landed, the next-hop courier is the recipient of every intermediate
 * leg. This module is the daemon-side piece that watches swarms the
 * agent is part of and signs `confirm_leg` for the leg one index below
 * its own, after a simulated transit delay.
 *
 * Shape of the loop:
 *   1. Scan swarms from GET /packages (already fetched by the bid loop).
 *   2. For each swarm where this agent is courier of leg k (k > 0),
 *      leg `k-1` becomes attestable once all legs `0..k-2` are
 *      completed and leg `k-1` is still pending with its on-chain PDA
 *      written.
 *   3. First time we see a leg become ready, stamp `readySeenAt`. On
 *      subsequent polls, once `now - readySeenAt >= simTransitDelayMs`,
 *      sign + submit `confirm_leg` via the API build-tx flow and the
 *      mirror endpoint.
 *   4. Mark processed so we don't resubmit on the next poll.
 */
import { Connection, Transaction, type Keypair } from "@solana/web3.js";
import type { AgentConfig } from "./config.js";
import { buildAuthHeaders, canonicalPath } from "./signed-fetch.js";

export interface ExecutorLeg {
  id: string;
  legIndex: number;
  agentPubkey: string;
  status: string;
  onChainLeg: string | null;
}

export interface ExecutorSwarm {
  id: string;
  status: string;
  onChainSwarm: string | null;
  legs: ExecutorLeg[];
}

export interface ExecutorPackage {
  id: string;
  status: string;
  swarm?: ExecutorSwarm | null;
}

export interface ExecutorState {
  /** legId → ms timestamp we first saw the handoff become attestable */
  readySeenAt: Map<string, number>;
  /** legIds we've already attempted on-chain confirm for */
  processed: Set<string>;
}

export function createExecutorState(): ExecutorState {
  return { readySeenAt: new Map(), processed: new Set() };
}

export interface HandoffPlan {
  legId: string;
  legIndex: number;
  legOnChain: string;
  prevCourierPubkey: string;
  firstReadyAt: number;
  readyToSignAt: number;
}

/**
 * Pure decision function, separated so it's cheap to unit-test. Given
 * a snapshot of packages and current state, returns the handoff plans
 * that should trigger *now* (delay elapsed) and mutates `state` with
 * any new first-sightings.
 */
export function planHandoffs(
  packages: ExecutorPackage[],
  agentPubkey: string,
  state: ExecutorState,
  simTransitDelayMs: number,
  now: number,
): HandoffPlan[] {
  const ready: HandoffPlan[] = [];

  for (const pkg of packages) {
    const swarm = pkg.swarm;
    if (!swarm || !swarm.onChainSwarm) continue;
    if (swarm.status === "settled" || swarm.status === "failed") continue;

    const myLeg = swarm.legs.find((l) => l.agentPubkey === agentPubkey);
    if (!myLeg) continue;
    const k = myLeg.legIndex;
    // Leg 0 has no predecessor to attest.
    if (k === 0) continue;

    const prevLeg = swarm.legs.find((l) => l.legIndex === k - 1);
    if (!prevLeg) continue;
    if (prevLeg.status === "completed") continue;
    if (!prevLeg.onChainLeg) continue;
    if (state.processed.has(prevLeg.id)) continue;

    // Strict ordering: all legs before k-1 must already be completed.
    // (The on-chain program enforces this too, but checking locally
    // avoids a pointless on-chain roundtrip.)
    const priorComplete = swarm.legs
      .filter((l) => l.legIndex < k - 1)
      .every((l) => l.status === "completed");
    if (!priorComplete) continue;

    let firstReadyAt = state.readySeenAt.get(prevLeg.id);
    if (firstReadyAt === undefined) {
      firstReadyAt = now;
      state.readySeenAt.set(prevLeg.id, now);
    }
    const readyToSignAt = firstReadyAt + simTransitDelayMs;
    if (now < readyToSignAt) continue;

    ready.push({
      legId: prevLeg.id,
      legIndex: prevLeg.legIndex,
      legOnChain: prevLeg.onChainLeg,
      prevCourierPubkey: prevLeg.agentPubkey,
      firstReadyAt,
      readyToSignAt,
    });
  }

  return ready;
}

export interface RunExecutorArgs {
  packages: ExecutorPackage[];
  config: AgentConfig;
  keypair: Keypair;
  connection: Connection;
  agentPubkey: string;
  state: ExecutorState;
}

export async function runExecutorPass(args: RunExecutorArgs): Promise<void> {
  const { packages, config, keypair, connection, agentPubkey, state } = args;
  const now = Date.now();
  const plans = planHandoffs(
    packages,
    agentPubkey,
    state,
    config.simTransitDelayMs,
    now,
  );

  for (const plan of plans) {
    state.processed.add(plan.legId);
    try {
      await signAndSubmitHandoff({
        ...args,
        plan,
      });
    } catch (err) {
      // Unprocess so we retry on the next poll — but wipe the
      // readySeenAt stamp so the simulated delay doesn't instantly
      // retrigger on error paths like RPC hiccups.
      state.processed.delete(plan.legId);
      state.readySeenAt.delete(plan.legId);
      console.error(
        `[Executor] handoff attestation failed for leg ${plan.legId}:`,
        err,
      );
    }
  }
}

interface SignArgs extends RunExecutorArgs {
  plan: HandoffPlan;
}

async function signAndSubmitHandoff(args: SignArgs): Promise<void> {
  const { config, keypair, connection, agentPubkey, plan } = args;
  const { legId, legIndex, prevCourierPubkey } = plan;

  console.log(
    `[Executor] Signing handoff for leg ${legIndex} (${legId}) — prev courier ${prevCourierPubkey}`,
  );

  const buildUrl = `${config.apiEndpoint}/swarms/legs/${legId}/build-confirm-tx`;
  const buildBody = JSON.stringify({ recipientPubkey: agentPubkey });
  const buildHeaders = buildAuthHeaders(
    keypair,
    "POST",
    canonicalPath(buildUrl),
    buildBody,
  );
  const buildRes = await fetch(buildUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildHeaders },
    body: buildBody,
  });
  if (!buildRes.ok) {
    throw new Error(
      `build-confirm-tx ${buildRes.status}: ${await buildRes.text()}`,
    );
  }
  const { transaction, blockhash, lastValidBlockHeight } = (await buildRes.json()) as {
    transaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
  };

  const tx = Transaction.from(Buffer.from(transaction, "base64"));
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  console.log(`[Executor] Leg ${legIndex} confirmed on-chain: ${signature}`);

  const mirrorUrl = `${config.apiEndpoint}/swarms/legs/${legId}/confirm`;
  const mirrorBody = JSON.stringify({
    agentPubkey: prevCourierPubkey,
    recipientPubkey: agentPubkey,
    confirmSignature: signature,
  });
  const mirrorHeaders = buildAuthHeaders(
    keypair,
    "POST",
    canonicalPath(mirrorUrl),
    mirrorBody,
  );
  const mirrorRes = await fetch(mirrorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...mirrorHeaders },
    body: mirrorBody,
  });
  if (!mirrorRes.ok) {
    throw new Error(
      `/confirm mirror ${mirrorRes.status}: ${await mirrorRes.text()}`,
    );
  }
}
