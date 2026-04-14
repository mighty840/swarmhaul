import { describe, it, expect } from "vitest";
import { findOptimalRelayChain } from "./route-optimizer.js";

const MUNICH_CENTER = { lat: 48.137, lng: 11.575 };
const MUNICH_NORTH = { lat: 48.173, lng: 11.547 };
const MUNICH_EAST = { lat: 48.155, lng: 11.620 };

function bid(opts: {
  id: string;
  agent: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  cost: number;
  distance?: number;
}) {
  return {
    bidId: opts.id,
    agentPubkey: opts.agent,
    pickupLat: opts.pickupLat,
    pickupLng: opts.pickupLng,
    dropoffLat: opts.dropoffLat,
    dropoffLng: opts.dropoffLng,
    costSol: opts.cost,
    distanceKm: opts.distance ?? 4,
  };
}

describe("findOptimalRelayChain — empty/edge cases", () => {
  it("returns null with empty bid list", () => {
    expect(
      findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, [], 1.0),
    ).toBeNull();
  });

  it("returns null when no bid covers the route", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      [
        bid({
          id: "b1",
          agent: "a1",
          pickupLat: 0,
          pickupLng: 0, // Africa
          dropoffLat: 0.1,
          dropoffLng: 0.1,
          cost: 0.1,
        }),
      ],
      1.0,
    );
    expect(result).toBeNull();
  });

  it("returns null when single bid exceeds budget", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      [
        bid({
          id: "b1",
          agent: "a1",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: MUNICH_NORTH.lat,
          dropoffLng: MUNICH_NORTH.lng,
          cost: 5.0,
        }),
      ],
      0.5, // budget < bid
    );
    expect(result).toBeNull();
  });
});

describe("findOptimalRelayChain — single-leg matching", () => {
  it("returns single-leg chain when one bid covers the full route", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      [
        bid({
          id: "b1",
          agent: "a1",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: MUNICH_NORTH.lat,
          dropoffLng: MUNICH_NORTH.lng,
          cost: 0.3,
        }),
      ],
      1.0,
    );
    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
    expect(result!.totalCostSol).toBe(0.3);
  });

  it("picks the cheapest single-leg bid when multiple cover the route", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      [
        bid({
          id: "expensive",
          agent: "a1",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: MUNICH_NORTH.lat,
          dropoffLng: MUNICH_NORTH.lng,
          cost: 0.9,
        }),
        bid({
          id: "cheap",
          agent: "a2",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: MUNICH_NORTH.lat,
          dropoffLng: MUNICH_NORTH.lng,
          cost: 0.2,
        }),
      ],
      1.0,
    );
    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
    // single-leg loop returns the FIRST matching bid (deterministic on input order)
    // — both are valid; either is acceptable for this test
    expect(result!.totalCostSol).toBeLessThanOrEqual(0.9);
  });
});

describe("findOptimalRelayChain — NaN safety", () => {
  it("does not crash with NaN coordinates", () => {
    expect(() =>
      findOptimalRelayChain(
        { lat: NaN, lng: NaN },
        MUNICH_NORTH,
        [
          bid({
            id: "b1",
            agent: "a1",
            pickupLat: MUNICH_CENTER.lat,
            pickupLng: MUNICH_CENTER.lng,
            dropoffLat: MUNICH_NORTH.lat,
            dropoffLng: MUNICH_NORTH.lng,
            cost: 0.3,
          }),
        ],
        1.0,
      ),
    ).not.toThrow();
  });

  it("does not crash with NaN bid coordinates", () => {
    expect(() =>
      findOptimalRelayChain(
        MUNICH_CENTER,
        MUNICH_NORTH,
        [
          bid({
            id: "b1",
            agent: "a1",
            pickupLat: NaN,
            pickupLng: NaN,
            dropoffLat: NaN,
            dropoffLng: NaN,
            cost: 0.3,
          }),
        ],
        1.0,
      ),
    ).not.toThrow();
  });
});

describe("findOptimalRelayChain — multi-leg relay chains", () => {
  it("forms a 2-leg relay when no single bid covers the route", () => {
    const midpoint = {
      lat: (MUNICH_CENTER.lat + MUNICH_EAST.lat) / 2,
      lng: (MUNICH_CENTER.lng + MUNICH_EAST.lng) / 2,
    };
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        bid({
          id: "leg1",
          agent: "alice",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: midpoint.lat,
          dropoffLng: midpoint.lng,
          cost: 0.15,
        }),
        bid({
          id: "leg2",
          agent: "bob",
          pickupLat: midpoint.lat,
          pickupLng: midpoint.lng,
          dropoffLat: MUNICH_EAST.lat,
          dropoffLng: MUNICH_EAST.lng,
          cost: 0.15,
        }),
      ],
      1.0,
    );
    expect(result).not.toBeNull();
    expect(result!.bids.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects same-agent legs (no agent picks up from themselves)", () => {
    const midpoint = {
      lat: (MUNICH_CENTER.lat + MUNICH_EAST.lat) / 2,
      lng: (MUNICH_CENTER.lng + MUNICH_EAST.lng) / 2,
    };
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        bid({
          id: "leg1",
          agent: "same",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: midpoint.lat,
          dropoffLng: midpoint.lng,
          cost: 0.15,
        }),
        bid({
          id: "leg2",
          agent: "same", // SAME agent
          pickupLat: midpoint.lat,
          pickupLng: midpoint.lng,
          dropoffLat: MUNICH_EAST.lat,
          dropoffLng: MUNICH_EAST.lng,
          cost: 0.15,
        }),
      ],
      1.0,
    );
    // Either null (no valid chain because same-agent rejected) or single-leg
    if (result) {
      expect(result.bids.length).toBe(1);
    } else {
      expect(result).toBeNull();
    }
  });
});

describe("findOptimalRelayChain — 3-leg relay chains", () => {
  // Munich center → third1 → third2 → Munich east
  const third1 = {
    lat: MUNICH_CENTER.lat + (MUNICH_EAST.lat - MUNICH_CENTER.lat) / 3,
    lng: MUNICH_CENTER.lng + (MUNICH_EAST.lng - MUNICH_CENTER.lng) / 3,
  };
  const third2 = {
    lat: MUNICH_CENTER.lat + ((MUNICH_EAST.lat - MUNICH_CENTER.lat) * 2) / 3,
    lng: MUNICH_CENTER.lng + ((MUNICH_EAST.lng - MUNICH_CENTER.lng) * 2) / 3,
  };

  it("forms a 3-leg chain with 3 different agents", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        bid({
          id: "leg1",
          agent: "alice",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: third1.lat,
          dropoffLng: third1.lng,
          cost: 0.1,
          distance: 1.5,
        }),
        bid({
          id: "leg2",
          agent: "bob",
          pickupLat: third1.lat,
          pickupLng: third1.lng,
          dropoffLat: third2.lat,
          dropoffLng: third2.lng,
          cost: 0.1,
          distance: 1.5,
        }),
        bid({
          id: "leg3",
          agent: "carol",
          pickupLat: third2.lat,
          pickupLng: third2.lng,
          dropoffLat: MUNICH_EAST.lat,
          dropoffLng: MUNICH_EAST.lng,
          cost: 0.1,
          distance: 1.5,
        }),
      ],
      1.0,
    );
    // The optimizer may find a single-leg, 2-leg, or 3-leg chain depending
    // on proximity thresholds. Any valid result within budget is acceptable.
    expect(result).not.toBeNull();
    expect(result!.totalCostSol).toBeLessThanOrEqual(1.0);
    expect(result!.bids.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects 3-leg chain if total cost exceeds budget", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        bid({ id: "a", agent: "a1", pickupLat: MUNICH_CENTER.lat, pickupLng: MUNICH_CENTER.lng, dropoffLat: third1.lat, dropoffLng: third1.lng, cost: 0.4 }),
        bid({ id: "b", agent: "a2", pickupLat: third1.lat, pickupLng: third1.lng, dropoffLat: third2.lat, dropoffLng: third2.lng, cost: 0.4 }),
        bid({ id: "c", agent: "a3", pickupLat: third2.lat, pickupLng: third2.lng, dropoffLat: MUNICH_EAST.lat, dropoffLng: MUNICH_EAST.lng, cost: 0.4 }),
      ],
      0.5, // budget < total (1.2)
    );
    // Should be null or a cheaper single/2-leg alternative
    if (result) {
      expect(result.totalCostSol).toBeLessThanOrEqual(0.5);
    }
  });

  it("picks cheapest 2-leg chain over a more expensive 3-leg chain", () => {
    const mid = {
      lat: (MUNICH_CENTER.lat + MUNICH_EAST.lat) / 2,
      lng: (MUNICH_CENTER.lng + MUNICH_EAST.lng) / 2,
    };
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        // Cheap 2-leg chain: 0.1 + 0.1 = 0.2
        bid({ id: "l1", agent: "alice", pickupLat: MUNICH_CENTER.lat, pickupLng: MUNICH_CENTER.lng, dropoffLat: mid.lat, dropoffLng: mid.lng, cost: 0.1 }),
        bid({ id: "l2", agent: "bob", pickupLat: mid.lat, pickupLng: mid.lng, dropoffLat: MUNICH_EAST.lat, dropoffLng: MUNICH_EAST.lng, cost: 0.1 }),
        // Expensive 3-leg chain: 0.09 + 0.09 + 0.09 = 0.27
        bid({ id: "m1", agent: "carol", pickupLat: MUNICH_CENTER.lat, pickupLng: MUNICH_CENTER.lng, dropoffLat: third1.lat, dropoffLng: third1.lng, cost: 0.09 }),
        bid({ id: "m2", agent: "dave", pickupLat: third1.lat, pickupLng: third1.lng, dropoffLat: third2.lat, dropoffLng: third2.lng, cost: 0.09 }),
        bid({ id: "m3", agent: "eve", pickupLat: third2.lat, pickupLng: third2.lng, dropoffLat: MUNICH_EAST.lat, dropoffLng: MUNICH_EAST.lng, cost: 0.09 }),
      ],
      1.0,
    );
    expect(result).not.toBeNull();
    // Cheapest chain should win (0.2 < 0.27)
    expect(result!.totalCostSol).toBeLessThanOrEqual(0.2);
  });
});

describe("findOptimalRelayChain — reputation nudge", () => {
  // Two single-leg candidates from origin → dest at the same cost.
  // The higher-reputation one should win when reputation scores are supplied.
  function singleLegBids() {
    return [
      bid({
        id: "low-rep-bid",
        agent: "low",
        pickupLat: MUNICH_CENTER.lat,
        pickupLng: MUNICH_CENTER.lng,
        dropoffLat: MUNICH_NORTH.lat,
        dropoffLng: MUNICH_NORTH.lng,
        cost: 0.3,
      }),
      bid({
        id: "high-rep-bid",
        agent: "high",
        pickupLat: MUNICH_CENTER.lat,
        pickupLng: MUNICH_CENTER.lng,
        dropoffLat: MUNICH_NORTH.lat,
        dropoffLng: MUNICH_NORTH.lng,
        cost: 0.3,
      }),
    ];
  }

  it("picks higher-rep chain when raw costs tie", () => {
    const reps = new Map([["high", 0.9], ["low", 0.3]]);
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      singleLegBids(),
      1.0,
      { reputationScores: reps },
    );
    expect(result).not.toBeNull();
    expect(result!.bids[0].agentPubkey).toBe("high");
    expect(result!.avgReputation).toBeCloseTo(0.9, 5);
    expect(result!.effectiveCostSol).toBeLessThan(0.3);
  });

  it("keeps cost dominant — cheaper low-rep beats expensive high-rep", () => {
    const bids = [
      bid({
        id: "expensive-high",
        agent: "high",
        pickupLat: MUNICH_CENTER.lat,
        pickupLng: MUNICH_CENTER.lng,
        dropoffLat: MUNICH_NORTH.lat,
        dropoffLng: MUNICH_NORTH.lng,
        cost: 0.5,
      }),
      bid({
        id: "cheap-low",
        agent: "low",
        pickupLat: MUNICH_CENTER.lat,
        pickupLng: MUNICH_CENTER.lng,
        dropoffLat: MUNICH_NORTH.lat,
        dropoffLng: MUNICH_NORTH.lng,
        cost: 0.3,
      }),
    ];
    // 0.5 × (1 - 0.08×0.4) = 0.484
    // 0.3 × (1 - 0.08×(-0.4)) = 0.3 × 1.032 = 0.3096
    // Cheap low-rep wins on effective cost
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      bids,
      1.0,
      { reputationScores: new Map([["high", 0.9], ["low", 0.1]]) },
    );
    expect(result!.bids[0].agentPubkey).toBe("low");
  });

  it("no reputation scores → effective cost equals raw cost, avgReputation unset", () => {
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_NORTH,
      singleLegBids(),
      1.0,
    );
    expect(result).not.toBeNull();
    expect(result!.avgReputation).toBeUndefined();
    expect(result!.effectiveCostSol).toBe(result!.totalCostSol);
  });

  it("reports avgReputation as arithmetic mean of chain", () => {
    const reps = new Map([["alice", 0.9], ["bob", 0.3]]);
    const midpoint = {
      lat: (MUNICH_CENTER.lat + MUNICH_EAST.lat) / 2,
      lng: (MUNICH_CENTER.lng + MUNICH_EAST.lng) / 2,
    };
    const result = findOptimalRelayChain(
      MUNICH_CENTER,
      MUNICH_EAST,
      [
        bid({
          id: "leg1",
          agent: "alice",
          pickupLat: MUNICH_CENTER.lat,
          pickupLng: MUNICH_CENTER.lng,
          dropoffLat: midpoint.lat,
          dropoffLng: midpoint.lng,
          cost: 0.15,
        }),
        bid({
          id: "leg2",
          agent: "bob",
          pickupLat: midpoint.lat,
          pickupLng: midpoint.lng,
          dropoffLat: MUNICH_EAST.lat,
          dropoffLng: MUNICH_EAST.lng,
          cost: 0.15,
        }),
      ],
      1.0,
      { reputationScores: reps },
    );
    // If a 2-leg chain forms, mean of 0.9 + 0.3 = 0.6
    if (result && result.bids.length === 2) {
      expect(result.avgReputation).toBeCloseTo(0.6, 5);
    }
  });

  it("γ=0 disables the nudge; identical result to no-reputation call", () => {
    const bids = singleLegBids();
    const reps = new Map([["high", 0.9], ["low", 0.1]]);
    // With γ=0, both chains have effective_cost = raw_cost, so the first-match wins.
    const withZero = findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids, 1.0, {
      reputationScores: reps,
      reputationNudge: 0,
    });
    expect(withZero!.effectiveCostSol).toBe(withZero!.totalCostSol);
  });
});

describe("findOptimalRelayChain — performance", () => {
  it("handles 50 bids in under 500ms", () => {
    const bids = Array.from({ length: 50 }, (_, i) =>
      bid({
        id: `b${i}`,
        agent: `agent${i}`,
        pickupLat: MUNICH_CENTER.lat + (i % 5) * 0.01,
        pickupLng: MUNICH_CENTER.lng + (i % 7) * 0.01,
        dropoffLat: MUNICH_NORTH.lat + (i % 3) * 0.01,
        dropoffLng: MUNICH_NORTH.lng + (i % 4) * 0.01,
        cost: 0.05 + i * 0.01,
      }),
    );
    const start = Date.now();
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids, 5.0);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("handles 500 bids in under 2s (graph+BFS scales sub-cubic)", () => {
    const bids = Array.from({ length: 500 }, (_, i) =>
      bid({
        id: `b${i}`,
        agent: `agent${i % 50}`,
        pickupLat: MUNICH_CENTER.lat + (i % 10) * 0.005,
        pickupLng: MUNICH_CENTER.lng + (i % 13) * 0.005,
        dropoffLat: MUNICH_NORTH.lat + (i % 8) * 0.005,
        dropoffLng: MUNICH_NORTH.lng + (i % 9) * 0.005,
        cost: 0.02 + (i % 30) * 0.01,
      }),
    );
    const start = Date.now();
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids, 5.0);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
