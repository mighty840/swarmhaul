/**
 * SwarmHaul reputation engine — pure deterministic scoring.
 *
 * Spec: docs/reference/reputation-system.md
 * Economics: docs/reference/reputation-economics.md
 *
 * Design notes:
 * - Pure module. No DB, no I/O, no time() calls — callers provide `now`.
 *   This makes scores reproducible: replay the event log, get the same score.
 * - Positive ramps use diminishing returns: (1 - score) × gainFactor × delta.
 *   Nobody reaches 1.0 asymptotically.
 * - Negative ramps are linear, uncapped below (floor at 0).
 *   One breach wipes out years. That's the point.
 * - Time decay is opt-in. Deployments that want zero-forgiveness set λ = 0.
 * - Economic nudges (reward split, swarm formation) are small, bounded,
 *   continuous, and centered on neutral reputation — never cliff-like
 *   thresholds that would exclude newcomers.
 */

// ─── Event taxonomy ──────────────────────────────────────────────────

export type EventKind =
  | "DidPresented"
  | "VcValidated"
  | "VcExpired"
  | "VcRevoked"
  | "SignatureVerified"
  | "SignatureFailed"
  | "ApiCallSuccess"
  | "ApiCall500"
  | "ContractCompleted"
  | "ContractBreached"
  | "IndirectReferral";

export interface ReputationEvent {
  kind: EventKind;
  timestamp: number; // unix millis
  context?: string; // opaque — request id, cred hash, etc.
}

// ─── Engine configuration ────────────────────────────────────────────

export interface EngineConfig {
  /** Base score given to any unknown actor via self-estimate. */
  baseScore: number;
  /** Hard cap on self-estimate regardless of signals — reputation must be earned. */
  firstMeetingCeiling: number;
  /** Multiplier for positive updates. Lower = more conservative ramp. Range (0, 1]. */
  gainFactor: number;
  /**
   * Exponential decay constant, in units of 1/ms. 0 disables decay.
   * Example: Math.log(2) / (365 * 86400 * 1000) = half-life of 1 year.
   */
  decayLambda: number;
  /** Signed delta per event kind. Positive events gain, negative events lose. */
  eventDeltas: Record<EventKind, number>;
}

export const DEFAULT_CONFIG: EngineConfig = {
  baseScore: 0.3,
  firstMeetingCeiling: 0.6,
  gainFactor: 0.5,
  decayLambda: 0,
  eventDeltas: {
    DidPresented: +0.005,
    VcValidated: +0.02,
    SignatureVerified: +0.01,
    ApiCallSuccess: +0.002,
    ContractCompleted: +0.05,
    IndirectReferral: +0.005,
    SignatureFailed: -0.15,
    VcExpired: -0.1,
    VcRevoked: -0.4,
    ApiCall500: -0.02,
    ContractBreached: -0.8,
  },
};

// ─── Core scoring ────────────────────────────────────────────────────

/**
 * Apply a single event to a score. The heart of the engine.
 *
 * Positive: new = old + (1 - old) × gainFactor × delta
 * Negative: new = max(0, old + delta)
 */
export function applyEvent(
  score: number,
  event: ReputationEvent,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  const delta = cfg.eventDeltas[event.kind];
  if (delta >= 0) {
    return clamp01(score + (1 - score) * cfg.gainFactor * delta);
  }
  return Math.max(0, score + delta);
}

/**
 * Replay an event log deterministically from a starting score.
 * No time decay — pure event composition.
 */
export function projectScore(
  startingScore: number,
  events: ReputationEvent[],
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  return events.reduce((s, e) => applyEvent(s, e, cfg), startingScore);
}

/**
 * Replay with optional exponential time decay.
 *
 * Each event's effective delta is weighted by exp(−λ × age_ms).
 * Older events contribute less; very old events approach zero influence.
 */
export function projectScoreWithDecay(
  startingScore: number,
  events: ReputationEvent[],
  now: number,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  if (cfg.decayLambda === 0) return projectScore(startingScore, events, cfg);

  let score = startingScore;
  for (const e of events) {
    const age = Math.max(0, now - e.timestamp);
    const weight = Math.exp(-cfg.decayLambda * age);
    const rawDelta = cfg.eventDeltas[e.kind];
    const delta = rawDelta * weight;
    if (delta >= 0) {
      score = clamp01(score + (1 - score) * cfg.gainFactor * delta);
    } else {
      score = Math.max(0, score + delta);
    }
  }
  return score;
}

/**
 * Return the score after each event — useful for charting trajectories.
 * Length is events.length + 1 (starting score is the first point).
 */
export function trajectory(
  startingScore: number,
  events: ReputationEvent[],
  cfg: EngineConfig = DEFAULT_CONFIG,
): number[] {
  const points: number[] = [startingScore];
  let s = startingScore;
  for (const e of events) {
    s = applyEvent(s, e, cfg);
    points.push(s);
  }
  return points;
}

// ─── Self-estimate for first-discovery ───────────────────────────────

export interface SelfEstimateSignals {
  /** Does the subject's DID resolve at all? */
  didResolves: boolean;
  /** Count of valid VCs from issuers the observer already trusts. */
  validVcs: number;
  /** Referrals from actors the observer trusts, with their local scores. */
  referrals: Array<{ referrerScore: number }>;
}

/**
 * Score assigned to a subject on first contact, before any direct interaction.
 *
 * Caps at firstMeetingCeiling (default 0.6) regardless of signals.
 * This is the Sybil defence: no matter how many credentials you forge or
 * endorsements you collect, you cannot bypass direct observation.
 */
export function selfEstimate(
  signals: SelfEstimateSignals,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  let score = cfg.baseScore;
  if (signals.didResolves) score += 0.05;
  score += signals.validVcs * 0.02;
  for (const r of signals.referrals) {
    score += 0.01 * r.referrerScore;
  }
  return Math.min(score, cfg.firstMeetingCeiling);
}

// ─── Convenience analytics ───────────────────────────────────────────

export interface ScoreSummary {
  score: number;
  interactionCount: number;
  successfulCount: number;
  failedCount: number;
  firstSeen: number | null;
  lastUpdated: number | null;
}

export function summarize(
  startingScore: number,
  events: ReputationEvent[],
  cfg: EngineConfig = DEFAULT_CONFIG,
): ScoreSummary {
  let score = startingScore;
  let successful = 0;
  let failed = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const e of events) {
    score = applyEvent(score, e, cfg);
    if (cfg.eventDeltas[e.kind] >= 0) successful++;
    else failed++;
    if (first === null || e.timestamp < first) first = e.timestamp;
    if (last === null || e.timestamp > last) last = e.timestamp;
  }

  return {
    score,
    interactionCount: events.length,
    successfulCount: successful,
    failedCount: failed,
    firstSeen: first,
    lastUpdated: last,
  };
}

// ─── Economic nudge parameters ───────────────────────────────────────

/**
 * Reward-distribution fairness floor. See docs/reference/reputation-economics.md §3.
 *
 * Weight formula: w_i = α + (1 - α) × rep_i
 *
 *   α = 0   → pure proportional (rep dominates, up to 3:1 ratios)
 *   α = 1   → rep ignored (equal split)
 *   α = 0.7 → default, ~1.23:1 max ratio — measurable nudge without dominance
 */
export const DEFAULT_REWARD_FAIRNESS_FLOOR = 0.7;

/**
 * Swarm-formation cost nudge strength. See docs/reference/reputation-economics.md §4.
 *
 * effective_cost = raw_cost × (1 - γ × (avgRep - 0.5))
 *
 *   γ = 0    → no nudge
 *   γ = 0.08 → default, ~±3.2% swing at the extremes, ~8% total range
 */
export const DEFAULT_FORMATION_NUDGE = 0.08;

/** The "neutral" reputation around which nudges are symmetric. */
export const NEUTRAL_REPUTATION = 0.5;

// ─── Reputation-weighted payment distribution ────────────────────────

export interface CourierBid {
  agentPubkey: string;
  /** Amount the courier bid for their leg (SOL). */
  bidSol: number;
}

export interface CourierPayment {
  agentPubkey: string;
  /** Original bid. */
  bidSol: number;
  /** Reputation score at allocation time (0..1). */
  reputationScore: number;
  /** Bonus paid from shipper surplus, weighted by softened reputation share. */
  bonusSol: number;
  /** Final payment = bidSol + bonusSol. */
  totalSol: number;
}

export interface PaymentAllocation {
  /** Per-courier payment breakdown. */
  payments: CourierPayment[];
  /** Sum of all bids (floor). */
  totalBidSol: number;
  /** Shipper's budget. */
  maxBudgetSol: number;
  /** Budget - total bids; distributed as reputation bonus. */
  surplusSol: number;
  /** Total paid out (= maxBudgetSol when surplus > 0 and reputations exist). */
  totalPaidSol: number;
  /** The fairness-floor parameter used for this allocation. */
  fairnessFloor: number;
}

export interface PaymentAllocationOptions {
  /**
   * Reward-distribution fairness floor α ∈ [0, 1].
   * Defaults to DEFAULT_REWARD_FAIRNESS_FLOOR.
   */
  fairnessFloor?: number;
}

/**
 * Distribute the shipper's budget across couriers with softened reputation
 * weighting.
 *
 * Principle: every courier always gets their bid; surplus is split using
 * `w_i = α + (1 − α) × rep_i`. The floor α guarantees that even a rep=0
 * agent receives a non-trivial slice — newcomer viability is protected.
 *
 * Invariants:
 *   - totalPaidSol ≤ maxBudgetSol (within float precision)
 *   - paymentᵢ ≥ bidᵢ for every courier
 *   - If all reps are equal, every courier gets an equal bonus share
 *   - α is clamped to [0, 1]
 */
export function allocateReputationWeightedPayments(
  bids: CourierBid[],
  reputationScores: Map<string, number>,
  maxBudgetSol: number,
  optsOrCfg: PaymentAllocationOptions | EngineConfig = {},
): PaymentAllocation {
  // Support either legacy EngineConfig (for baseScore default) or the new options.
  const isEngineCfg = "eventDeltas" in optsOrCfg;
  const baseScore = isEngineCfg
    ? (optsOrCfg as EngineConfig).baseScore
    : DEFAULT_CONFIG.baseScore;
  const fairnessFloorRaw = isEngineCfg
    ? DEFAULT_REWARD_FAIRNESS_FLOOR
    : (optsOrCfg as PaymentAllocationOptions).fairnessFloor ??
      DEFAULT_REWARD_FAIRNESS_FLOOR;
  const fairnessFloor = clamp01(fairnessFloorRaw);

  const totalBidSol = bids.reduce((sum, b) => sum + b.bidSol, 0);
  const surplusSol = Math.max(0, maxBudgetSol - totalBidSol);

  // Each courier's reputation, defaulting to baseScore for new agents.
  const reps = bids.map((b) => ({
    bid: b,
    rep: reputationScores.get(b.agentPubkey) ?? baseScore,
  }));

  // Softened weight: w_i = α + (1 - α) × rep_i
  // This puts a floor under newcomers' share while preserving the
  // incentive to build reputation.
  const weights = reps.map((r) => fairnessFloor + (1 - fairnessFloor) * r.rep);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const payments: CourierPayment[] = reps.map((r, i) => {
    let bonusSol = 0;
    if (surplusSol > 0 && totalWeight > 0) {
      bonusSol = surplusSol * (weights[i] / totalWeight);
    }
    return {
      agentPubkey: r.bid.agentPubkey,
      bidSol: r.bid.bidSol,
      reputationScore: r.rep,
      bonusSol,
      totalSol: r.bid.bidSol + bonusSol,
    };
  });

  const totalPaidSol = payments.reduce((sum, p) => sum + p.totalSol, 0);

  return {
    payments,
    totalBidSol,
    maxBudgetSol,
    surplusSol,
    totalPaidSol,
    fairnessFloor,
  };
}

// ─── Reputation-weighted swarm-formation nudge ───────────────────────

/**
 * Compute the effective cost of a candidate relay chain for optimizer
 * comparison. The nudge is bounded by γ and centered on neutral reputation:
 * a chain with neutral-rep couriers (r̄ = 0.5) has effective_cost = raw_cost.
 *
 *   effective_cost = raw_cost × (1 − γ × (r̄ − 0.5))
 *
 * With γ = 0.08, the maximum swing is ±3.2% at the extremes — enough to
 * decide ties, too small to overturn materially cheaper offers.
 *
 * @param rawCostSol  sum of bid costs for the chain (SOL)
 * @param avgReputation  average reputation of all couriers in the chain, 0..1
 * @param gamma  nudge strength; clamped to [0, 0.2]
 */
export function effectiveChainCost(
  rawCostSol: number,
  avgReputation: number,
  gamma: number = DEFAULT_FORMATION_NUDGE,
): number {
  const γ = Math.max(0, Math.min(0.2, gamma));
  const r = clamp01(avgReputation);
  const multiplier = 1 - γ * (r - NEUTRAL_REPUTATION);
  return rawCostSol * multiplier;
}

// ─── Internal helpers ────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
