import { describe, it, expect } from "vitest";
import {
  createExecutorState,
  planHandoffs,
  type ExecutorPackage,
} from "./executor.js";

const SELF = "bravo-pubkey";
const PREV = "alpha-pubkey";

function twoLegPackage(overrides: Partial<ExecutorPackage["swarm"]> = {}): ExecutorPackage {
  const defaultSwarm: NonNullable<ExecutorPackage["swarm"]> = {
    id: "swarm-1",
    status: "forming",
    onChainSwarm: "onchain-swarm-1",
    legs: [
      {
        id: "leg-0",
        legIndex: 0,
        agentPubkey: PREV,
        status: "pending",
        onChainLeg: "onchain-leg-0",
      },
      {
        id: "leg-1",
        legIndex: 1,
        agentPubkey: SELF,
        status: "pending",
        onChainLeg: "onchain-leg-1",
      },
    ],
  };
  return {
    id: "pkg-1",
    status: "swarm_forming",
    swarm: { ...defaultSwarm, ...overrides },
  };
}

describe("planHandoffs", () => {
  it("stamps first sighting without returning a plan", () => {
    const state = createExecutorState();
    const plans = planHandoffs([twoLegPackage()], SELF, state, 15_000, 1_000);
    expect(plans).toEqual([]);
    expect(state.readySeenAt.get("leg-0")).toBe(1_000);
  });

  it("returns a plan after the simulated transit delay elapses", () => {
    const state = createExecutorState();
    planHandoffs([twoLegPackage()], SELF, state, 15_000, 1_000);
    const plans = planHandoffs([twoLegPackage()], SELF, state, 15_000, 16_001);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      legId: "leg-0",
      legIndex: 0,
      legOnChain: "onchain-leg-0",
      prevCourierPubkey: PREV,
    });
  });

  it("skips when prior legs are not yet completed (ordering guard)", () => {
    // 3-leg swarm: self is courier of leg 2, but leg 0 is still pending
    const pkg: ExecutorPackage = {
      id: "pkg-3",
      status: "swarm_forming",
      swarm: {
        id: "swarm-3",
        status: "forming",
        onChainSwarm: "onchain-swarm-3",
        legs: [
          {
            id: "leg-0",
            legIndex: 0,
            agentPubkey: PREV,
            status: "pending",
            onChainLeg: "a",
          },
          {
            id: "leg-1",
            legIndex: 1,
            agentPubkey: "charlie",
            status: "pending",
            onChainLeg: "b",
          },
          {
            id: "leg-2",
            legIndex: 2,
            agentPubkey: SELF,
            status: "pending",
            onChainLeg: "c",
          },
        ],
      },
    };
    const state = createExecutorState();
    // Even after the simulated delay, leg 1 is NOT attestable because
    // leg 0 hasn't completed yet.
    expect(
      planHandoffs([pkg], SELF, state, 0, 1_000),
    ).toEqual([]);
  });

  it("returns a plan for later legs once earlier ones complete", () => {
    const pkg: ExecutorPackage = {
      id: "pkg-3",
      status: "in_transit",
      swarm: {
        id: "swarm-3",
        status: "forming",
        onChainSwarm: "onchain-swarm-3",
        legs: [
          {
            id: "leg-0",
            legIndex: 0,
            agentPubkey: PREV,
            status: "completed",
            onChainLeg: "a",
          },
          {
            id: "leg-1",
            legIndex: 1,
            agentPubkey: "charlie",
            status: "pending",
            onChainLeg: "b",
          },
          {
            id: "leg-2",
            legIndex: 2,
            agentPubkey: SELF,
            status: "pending",
            onChainLeg: "c",
          },
        ],
      },
    };
    const state = createExecutorState();
    planHandoffs([pkg], SELF, state, 1_000, 1_000);
    const plans = planHandoffs([pkg], SELF, state, 1_000, 3_000);
    expect(plans).toHaveLength(1);
    expect(plans[0].legId).toBe("leg-1");
  });

  it("does not re-plan a processed leg", () => {
    const state = createExecutorState();
    state.processed.add("leg-0");
    const plans = planHandoffs([twoLegPackage()], SELF, state, 0, 1_000);
    expect(plans).toEqual([]);
  });

  it("skips the final leg — shipper signs that", () => {
    // Self is courier of leg 0 only (single-leg swarm). There's no leg
    // below to attest for.
    const pkg: ExecutorPackage = {
      id: "pkg-single",
      status: "swarm_forming",
      swarm: {
        id: "swarm-single",
        status: "forming",
        onChainSwarm: "onchain-swarm-s",
        legs: [
          {
            id: "leg-only",
            legIndex: 0,
            agentPubkey: SELF,
            status: "pending",
            onChainLeg: "x",
          },
        ],
      },
    };
    const state = createExecutorState();
    expect(planHandoffs([pkg], SELF, state, 0, 1_000)).toEqual([]);
  });

  it("skips swarms without on-chain accounts", () => {
    const pkg = twoLegPackage({ onChainSwarm: null });
    const state = createExecutorState();
    expect(planHandoffs([pkg], SELF, state, 0, 1_000)).toEqual([]);
  });

  it("skips settled and failed swarms", () => {
    const settled = twoLegPackage({ status: "settled" });
    const failed = twoLegPackage({ status: "failed" });
    const state = createExecutorState();
    expect(
      planHandoffs([settled, failed], SELF, state, 0, 1_000),
    ).toEqual([]);
  });

  it("skips packages where this agent has no leg", () => {
    const pkg = twoLegPackage();
    const state = createExecutorState();
    expect(planHandoffs([pkg], "not-me", state, 0, 1_000)).toEqual([]);
  });
});
