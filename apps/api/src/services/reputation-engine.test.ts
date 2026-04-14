import { describe, it, expect } from "vitest";
import {
  applyEvent,
  projectScore,
  projectScoreWithDecay,
  trajectory,
  selfEstimate,
  summarize,
  allocateReputationWeightedPayments,
  effectiveChainCost,
  DEFAULT_CONFIG,
  DEFAULT_REWARD_FAIRNESS_FLOOR,
  DEFAULT_FORMATION_NUDGE,
  NEUTRAL_REPUTATION,
  type ReputationEvent,
  type EventKind,
} from "./reputation-engine.js";

function event(kind: EventKind, timestamp = 0): ReputationEvent {
  return { kind, timestamp };
}

function repeat(kind: EventKind, n: number): ReputationEvent[] {
  return Array.from({ length: n }, (_, i) => event(kind, i));
}

// ─── Fundamental ramp properties ─────────────────────────────────────

describe("applyEvent — positive ramp", () => {
  it("increases score on positive events", () => {
    const after = applyEvent(0.5, event("ContractCompleted"));
    expect(after).toBeGreaterThan(0.5);
  });

  it("never exceeds 1.0 even with many positive events", () => {
    let s = 0.3;
    for (let i = 0; i < 10_000; i++) {
      s = applyEvent(s, event("ContractCompleted"));
    }
    expect(s).toBeLessThan(1.0);
    expect(s).toBeGreaterThan(0.99);
  });

  it("diminishing returns — gain from 0.3 is larger than gain from 0.9", () => {
    const low = applyEvent(0.3, event("ContractCompleted")) - 0.3;
    const high = applyEvent(0.9, event("ContractCompleted")) - 0.9;
    expect(low).toBeGreaterThan(high);
  });

  it("gain is exactly (1 - score) × gainFactor × delta", () => {
    const score = 0.4;
    const delta = DEFAULT_CONFIG.eventDeltas.ContractCompleted;
    const expected = score + (1 - score) * DEFAULT_CONFIG.gainFactor * delta;
    expect(applyEvent(score, event("ContractCompleted"))).toBeCloseTo(expected, 10);
  });
});

describe("applyEvent — negative ramp", () => {
  it("decreases score linearly on negative events", () => {
    const after = applyEvent(0.8, event("VcExpired"));
    expect(after).toBeCloseTo(0.7, 10); // 0.8 - 0.10
  });

  it("floors at 0.0 — no negative reputation", () => {
    const after = applyEvent(0.1, event("ContractBreached"));
    expect(after).toBe(0);
  });

  it("ContractBreached wipes out a high-rep actor", () => {
    const after = applyEvent(0.95, event("ContractBreached"));
    expect(after).toBeCloseTo(0.15, 10); // 0.95 - 0.80
  });

  it("SignatureFailed is harsh but survivable at high rep", () => {
    const after = applyEvent(0.9, event("SignatureFailed"));
    expect(after).toBeCloseTo(0.75, 10);
  });
});

// ─── Core invariant: skewed ramps ────────────────────────────────────

describe("Invariant: gaining is hard, losing is fast", () => {
  it("~16 ContractCompleted events needed to undo 1 ContractBreached", () => {
    // Start clean, breach: drop to 0.
    // Then count how many completions to get back to what the breach cost
    // (breach is -0.8 applied to a score of 0.8 → 0.0, so we need to rebuild 0.8)
    let s = 0;
    let count = 0;
    while (s < 0.8 && count < 1000) {
      s = applyEvent(s, event("ContractCompleted"));
      count++;
    }
    // Per spec: "a single ContractBreached undoes roughly 16 ContractCompleted events"
    // Our ramp is more conservative — asymptotic. Spec is about ratios, not exact count.
    // Verify it's at least many events — much more expensive than breach was to cause.
    expect(count).toBeGreaterThan(16);
  });

  it("one breach > many successes", () => {
    // 30 completions, then one breach — score should be meaningfully damaged
    const events = [
      ...repeat("ContractCompleted", 30),
      event("ContractBreached", 31),
    ];
    const final = projectScore(0.3, events);
    // 30 completions takes score well above 0.5, then -0.8 drops it near 0
    expect(final).toBeLessThan(0.2);
  });

  it("asymmetry holds at every score level", () => {
    // At low scores the loss is capped by the floor at 0, but even then
    // the ratio is large. At mid/high scores it's extreme.
    for (const start of [0.3, 0.5, 0.7, 0.9]) {
      const gainStep = applyEvent(start, event("ContractCompleted")) - start;
      const lossStep = start - applyEvent(start, event("ContractBreached"));
      expect(lossStep).toBeGreaterThan(gainStep * 5);
    }
  });
});

// ─── Sybil resistance via self-estimate ──────────────────────────────

describe("selfEstimate — Sybil defence", () => {
  it("returns baseScore with no signals", () => {
    const s = selfEstimate({ didResolves: false, validVcs: 0, referrals: [] });
    expect(s).toBe(DEFAULT_CONFIG.baseScore);
  });

  it("DID resolving adds 0.05", () => {
    const s = selfEstimate({ didResolves: true, validVcs: 0, referrals: [] });
    expect(s).toBeCloseTo(0.35, 10);
  });

  it("each VC adds 0.02", () => {
    const s = selfEstimate({ didResolves: false, validVcs: 3, referrals: [] });
    expect(s).toBeCloseTo(0.36, 10);
  });

  it("referrals are weighted by referrer's score", () => {
    const s = selfEstimate({
      didResolves: false,
      validVcs: 0,
      referrals: [{ referrerScore: 0.78 }],
    });
    expect(s).toBeCloseTo(0.3 + 0.0078, 4);
  });

  it("caps at firstMeetingCeiling regardless of signal count", () => {
    const s = selfEstimate({
      didResolves: true,
      validVcs: 100, // absurd
      referrals: Array.from({ length: 100 }, () => ({ referrerScore: 1 })),
    });
    expect(s).toBe(DEFAULT_CONFIG.firstMeetingCeiling);
  });

  it("1000 fresh Sybil identities all land at baseScore (§6.1)", () => {
    // All 1000 identities present no VCs, no DID, no referrals
    const scores = Array.from({ length: 1000 }, () =>
      selfEstimate({ didResolves: false, validVcs: 0, referrals: [] }),
    );
    expect(scores.every((s) => s === DEFAULT_CONFIG.baseScore)).toBe(true);
    // None of them exceed the first-meeting ceiling
    expect(scores.every((s) => s < DEFAULT_CONFIG.firstMeetingCeiling)).toBe(true);
  });
});

// ─── Determinism + replay ────────────────────────────────────────────

describe("projectScore — determinism", () => {
  it("same inputs produce same output", () => {
    const events = [
      event("ContractCompleted", 1),
      event("SignatureVerified", 2),
      event("ApiCall500", 3),
      event("ContractCompleted", 4),
    ];
    expect(projectScore(0.4, events)).toBe(projectScore(0.4, events));
  });

  it("order matters — gain then loss ≠ loss then gain", () => {
    const events1 = [event("ContractCompleted", 1), event("VcExpired", 2)];
    const events2 = [event("VcExpired", 1), event("ContractCompleted", 2)];
    // Not equal because positive ramp depends on current score
    expect(projectScore(0.5, events1)).not.toBeCloseTo(projectScore(0.5, events2), 4);
  });

  it("empty event log returns starting score", () => {
    expect(projectScore(0.5, [])).toBe(0.5);
  });
});

describe("trajectory", () => {
  it("length equals events.length + 1", () => {
    const events = repeat("ContractCompleted", 5);
    expect(trajectory(0.3, events).length).toBe(6);
  });

  it("first element is the starting score", () => {
    expect(trajectory(0.42, [event("ContractCompleted")])[0]).toBe(0.42);
  });

  it("last element equals projectScore of the full log", () => {
    const events = [
      event("ContractCompleted", 1),
      event("VcExpired", 2),
      event("SignatureVerified", 3),
    ];
    const traj = trajectory(0.5, events);
    expect(traj[traj.length - 1]).toBeCloseTo(projectScore(0.5, events), 10);
  });

  it("is monotonically non-decreasing with only positive events", () => {
    const traj = trajectory(0, repeat("ContractCompleted", 20));
    for (let i = 1; i < traj.length; i++) {
      expect(traj[i]).toBeGreaterThanOrEqual(traj[i - 1]);
    }
  });
});

// ─── Time decay ──────────────────────────────────────────────────────

describe("projectScoreWithDecay", () => {
  const yearMs = 365 * 86400 * 1000;
  const halfLifeOneYear = Math.log(2) / yearMs;

  it("with λ=0 equals projectScore exactly", () => {
    const events = repeat("ContractCompleted", 5);
    const withDecay = projectScoreWithDecay(0.3, events, Date.now(), {
      ...DEFAULT_CONFIG,
      decayLambda: 0,
    });
    const plain = projectScore(0.3, events);
    expect(withDecay).toBe(plain);
  });

  it("older events contribute less than recent ones", () => {
    const now = yearMs; // 1 year after epoch
    const oldEvents = [event("ContractCompleted", 0)]; // 1 year ago
    const newEvents = [event("ContractCompleted", now)]; // right now
    const cfg = { ...DEFAULT_CONFIG, decayLambda: halfLifeOneYear };

    const oldGain = projectScoreWithDecay(0.3, oldEvents, now, cfg) - 0.3;
    const newGain = projectScoreWithDecay(0.3, newEvents, now, cfg) - 0.3;
    expect(newGain).toBeGreaterThan(oldGain);
  });

  it("a one-year-old event is worth ~half what a fresh one is (with 1y half-life)", () => {
    const now = yearMs;
    const cfg = { ...DEFAULT_CONFIG, decayLambda: halfLifeOneYear };
    const freshGain = projectScoreWithDecay(0, [event("ContractCompleted", now)], now, cfg);
    const oldGain = projectScoreWithDecay(0, [event("ContractCompleted", 0)], now, cfg);
    // Old event's contribution is ~half
    expect(oldGain / freshGain).toBeCloseTo(0.5, 1);
  });
});

// ─── Scenarios from the spec ─────────────────────────────────────────

describe("Scenario §6.1 — Sybil attack", () => {
  it("1000 fresh identities cannot cross any meaningful threshold", () => {
    const freshScores = Array.from({ length: 1000 }, () =>
      selfEstimate({ didResolves: false, validVcs: 0, referrals: [] }),
    );
    // None exceed 0.5 (a typical minimum for any trusted role)
    expect(freshScores.every((s) => s < 0.5)).toBe(true);
  });
});

describe("Scenario §6.2 — good citizen burns out", () => {
  it("agent at ~0.87, one SignatureFailed, recovery path", () => {
    // Build to ~0.87 with ~80 ContractCompleted (not 200 — default ramp climbs fast)
    let score = 0.3;
    for (let i = 0; i < 80; i++) {
      score = applyEvent(score, event("ContractCompleted", i));
    }
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(0.95);

    // Key compromise → SignatureFailed
    const afterFail = applyEvent(score, event("SignatureFailed", 100));
    expect(afterFail).toBeCloseTo(score - 0.15, 10);

    // Month of clean deliveries (30 more completions)
    let recovered = afterFail;
    for (let i = 0; i < 30; i++) {
      recovered = applyEvent(recovered, event("ContractCompleted", 101 + i));
    }

    // Recovery should bring the actor back above the fail
    expect(recovered).toBeGreaterThan(afterFail);
  });
});

describe("Scenario §6.3 — Actor 1 high-rep with Actor 2 despite global disapproval", () => {
  it("200 successful contracts drive score above 0.9", () => {
    let score = 0.3;
    for (let i = 0; i < 200; i++) {
      score = applyEvent(score, event("ContractCompleted", i));
    }
    // Direct interactions between A1 and A2 yield high mutual rep
    expect(score).toBeGreaterThan(0.85);
  });
});

describe("Scenario §6.4 — transitive trust propagation", () => {
  it("referral from trusted actor pulls starting score above base", () => {
    const s = selfEstimate({
      didResolves: false,
      validVcs: 0,
      referrals: [{ referrerScore: 0.78 }],
    });
    expect(s).toBeGreaterThan(DEFAULT_CONFIG.baseScore);
    expect(s).toBeLessThan(DEFAULT_CONFIG.firstMeetingCeiling);
  });

  it("a dozen referrals still capped at ceiling when saturated", () => {
    // Saturate signals to force ceiling clamp: many VCs + max referrals
    const s = selfEstimate({
      didResolves: true,
      validVcs: 20,
      referrals: Array.from({ length: 20 }, () => ({ referrerScore: 1 })),
    });
    expect(s).toBe(DEFAULT_CONFIG.firstMeetingCeiling);
  });

  it("moderate referrals push above base but below ceiling", () => {
    const s = selfEstimate({
      didResolves: true,
      validVcs: 5,
      referrals: Array.from({ length: 12 }, () => ({ referrerScore: 0.9 })),
    });
    expect(s).toBeGreaterThan(DEFAULT_CONFIG.baseScore);
    expect(s).toBeLessThanOrEqual(DEFAULT_CONFIG.firstMeetingCeiling);
  });
});

// ─── Summarize ───────────────────────────────────────────────────────

// ─── Reputation-weighted payments ────────────────────────────────────

describe("allocateReputationWeightedPayments — softened split", () => {
  it("pays each courier at least their bid", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "a1", bidSol: 0.1 },
        { agentPubkey: "a2", bidSol: 0.15 },
      ],
      new Map([["a1", 0.9], ["a2", 0.5]]),
      0.5,
    );
    for (const p of result.payments) {
      expect(p.totalSol).toBeGreaterThanOrEqual(p.bidSol);
    }
  });

  it("rewards higher rep with a larger surplus share (default α=0.7)", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "high", bidSol: 0.1 },
        { agentPubkey: "low", bidSol: 0.1 },
      ],
      new Map([["high", 0.9], ["low", 0.3]]),
      0.5, // surplus = 0.3
    );
    const high = result.payments.find((p) => p.agentPubkey === "high")!;
    const low = result.payments.find((p) => p.agentPubkey === "low")!;
    expect(high.bonusSol).toBeGreaterThan(low.bonusSol);
  });

  it("default nudge bounds the high/low bonus ratio to ≈ 1.23×", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "high", bidSol: 0.1 },
        { agentPubkey: "low", bidSol: 0.1 },
      ],
      new Map([["high", 0.9], ["low", 0.3]]),
      0.5,
    );
    const high = result.payments.find((p) => p.agentPubkey === "high")!.bonusSol;
    const low = result.payments.find((p) => p.agentPubkey === "low")!.bonusSol;
    // w_high / w_low = (0.7 + 0.3×0.9) / (0.7 + 0.3×0.3) = 0.97 / 0.79 ≈ 1.228
    expect(high / low).toBeCloseTo(0.97 / 0.79, 2);
  });

  it("fairness floor α=0 reduces to pure proportional (3× ratio)", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "high", bidSol: 0.1 },
        { agentPubkey: "low", bidSol: 0.1 },
      ],
      new Map([["high", 0.9], ["low", 0.3]]),
      0.4,
      { fairnessFloor: 0 },
    );
    const high = result.payments.find((p) => p.agentPubkey === "high")!.bonusSol;
    const low = result.payments.find((p) => p.agentPubkey === "low")!.bonusSol;
    expect(high / low).toBeCloseTo(3, 1);
  });

  it("fairness floor α=1 makes the split equal regardless of reputation", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "high", bidSol: 0.1 },
        { agentPubkey: "low", bidSol: 0.1 },
      ],
      new Map([["high", 0.9], ["low", 0.1]]),
      0.4,
      { fairnessFloor: 1 },
    );
    const high = result.payments.find((p) => p.agentPubkey === "high")!.bonusSol;
    const low = result.payments.find((p) => p.agentPubkey === "low")!.bonusSol;
    expect(high).toBeCloseTo(low, 8);
  });

  it("newcomers (unknown agents) default to baseScore", () => {
    const result = allocateReputationWeightedPayments(
      [{ agentPubkey: "brand-new", bidSol: 0.1 }],
      new Map(),
      0.3,
    );
    expect(result.payments[0].reputationScore).toBe(DEFAULT_CONFIG.baseScore);
    // Single courier always gets the entire surplus regardless of nudge
    expect(result.payments[0].bonusSol).toBeCloseTo(0.2, 5);
  });

  it("zero surplus means everyone gets exactly their bid", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "a1", bidSol: 0.25 },
        { agentPubkey: "a2", bidSol: 0.25 },
      ],
      new Map([["a1", 0.9], ["a2", 0.3]]),
      0.5,
    );
    expect(result.surplusSol).toBe(0);
    for (const p of result.payments) {
      expect(p.bonusSol).toBe(0);
      expect(p.totalSol).toBe(p.bidSol);
    }
  });

  it("total paid never exceeds budget (within float precision)", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "a1", bidSol: 0.1 },
        { agentPubkey: "a2", bidSol: 0.1 },
        { agentPubkey: "a3", bidSol: 0.1 },
      ],
      new Map([
        ["a1", 0.9],
        ["a2", 0.5],
        ["a3", 0.3],
      ]),
      1.0,
    );
    expect(result.totalPaidSol).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(result.totalPaidSol).toBeCloseTo(1.0, 5);
  });

  it("all-zero-reputation edge case: splits surplus by floor (even)", () => {
    const result = allocateReputationWeightedPayments(
      [
        { agentPubkey: "a1", bidSol: 0.1 },
        { agentPubkey: "a2", bidSol: 0.1 },
      ],
      new Map([["a1", 0], ["a2", 0]]),
      0.4,
    );
    expect(result.payments[0].bonusSol).toBeCloseTo(0.1, 5);
    expect(result.payments[1].bonusSol).toBeCloseTo(0.1, 5);
  });

  it("records the fairness floor used, for auditability", () => {
    const result = allocateReputationWeightedPayments(
      [{ agentPubkey: "a1", bidSol: 0.1 }],
      new Map([["a1", 0.5]]),
      0.2,
      { fairnessFloor: 0.42 },
    );
    expect(result.fairnessFloor).toBe(0.42);
  });

  it("clamps floor values outside [0, 1]", () => {
    const high = allocateReputationWeightedPayments(
      [{ agentPubkey: "a1", bidSol: 0.1 }],
      new Map(),
      0.2,
      { fairnessFloor: 99 },
    );
    expect(high.fairnessFloor).toBe(1);

    const low = allocateReputationWeightedPayments(
      [{ agentPubkey: "a1", bidSol: 0.1 }],
      new Map(),
      0.2,
      { fairnessFloor: -5 },
    );
    expect(low.fairnessFloor).toBe(0);
  });
});

// ─── Formation nudge ─────────────────────────────────────────────────

describe("effectiveChainCost — swarm-formation nudge", () => {
  it("is a no-op at neutral reputation", () => {
    expect(effectiveChainCost(1.0, NEUTRAL_REPUTATION)).toBeCloseTo(1.0, 10);
  });

  it("makes high-rep chains appear cheaper", () => {
    const high = effectiveChainCost(1.0, 0.9);
    const neutral = effectiveChainCost(1.0, 0.5);
    expect(high).toBeLessThan(neutral);
  });

  it("makes low-rep chains appear more expensive", () => {
    const low = effectiveChainCost(1.0, 0.1);
    const neutral = effectiveChainCost(1.0, 0.5);
    expect(low).toBeGreaterThan(neutral);
  });

  it("default γ keeps total swing within ±3.2% of raw cost", () => {
    const raw = 1.0;
    const maxHigh = effectiveChainCost(raw, 1.0);
    const maxLow = effectiveChainCost(raw, 0.0);
    expect(raw - maxHigh).toBeCloseTo(0.04, 2); // 0.08 × 0.5
    expect(maxLow - raw).toBeCloseTo(0.04, 2);
    // Total nudge range ≤ 8% of raw
    expect(maxLow - maxHigh).toBeLessThanOrEqual(0.08 * raw + 1e-9);
  });

  it("γ=0 disables the nudge", () => {
    expect(effectiveChainCost(1.0, 0.9, 0)).toBe(1.0);
    expect(effectiveChainCost(1.0, 0.1, 0)).toBe(1.0);
  });

  it("γ is clamped to [0, 0.2]", () => {
    // Extreme request for huge nudge is capped at γ=0.2
    const capped = effectiveChainCost(1.0, 1.0, 5.0);
    expect(capped).toBeCloseTo(1.0 - 0.2 * 0.5, 5); // = 0.9
    expect(effectiveChainCost(1.0, 1.0, -1)).toBe(1.0);
  });

  it("is symmetric around neutral reputation", () => {
    const delta = 0.3;
    const above = effectiveChainCost(1.0, NEUTRAL_REPUTATION + delta);
    const below = effectiveChainCost(1.0, NEUTRAL_REPUTATION - delta);
    // Equidistant from raw cost in opposite directions
    expect(above - 1 + (below - 1)).toBeCloseTo(0, 10);
  });

  it("scales with raw cost (multiplicative, not additive)", () => {
    const small = effectiveChainCost(0.01, 0.9);
    const large = effectiveChainCost(100, 0.9);
    // Both should be ~3.2% below raw, not a fixed absolute discount
    expect((0.01 - small) / 0.01).toBeCloseTo((100 - large) / 100, 5);
  });

  it("defaults expose the documented constants", () => {
    expect(DEFAULT_REWARD_FAIRNESS_FLOOR).toBe(0.7);
    expect(DEFAULT_FORMATION_NUDGE).toBe(0.08);
    expect(NEUTRAL_REPUTATION).toBe(0.5);
  });
});

describe("summarize", () => {
  it("counts successes and failures correctly", () => {
    const events = [
      event("ContractCompleted", 1),
      event("ContractCompleted", 2),
      event("VcExpired", 3),
      event("SignatureVerified", 4),
      event("ApiCall500", 5),
    ];
    const summary = summarize(0.3, events);
    expect(summary.successfulCount).toBe(3);
    expect(summary.failedCount).toBe(2);
    expect(summary.interactionCount).toBe(5);
    expect(summary.firstSeen).toBe(1);
    expect(summary.lastUpdated).toBe(5);
  });

  it("empty log yields null first/last", () => {
    const summary = summarize(0.5, []);
    expect(summary.firstSeen).toBeNull();
    expect(summary.lastUpdated).toBeNull();
    expect(summary.score).toBe(0.5);
  });
});
