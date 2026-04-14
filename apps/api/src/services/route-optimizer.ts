import type { LatLng } from "@swarmhaul/types";
import {
  effectiveChainCost,
  DEFAULT_FORMATION_NUDGE,
  NEUTRAL_REPUTATION,
} from "./reputation-engine.js";

interface BidNode {
  bidId: string;
  agentPubkey: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  costSol: number;
  distanceKm: number;
}

interface RelayChain {
  bids: BidNode[];
  totalCostSol: number;
  totalDistanceKm: number;
  /** Average reputation of couriers in this chain, 0..1 (present when reputations supplied). */
  avgReputation?: number;
  /**
   * Effective cost after reputation nudge, used as the comparison objective.
   * Equal to totalCostSol when no reputations are supplied.
   */
  effectiveCostSol?: number;
}

export interface OptimizerOptions {
  /**
   * Per-agent reputation scores in [0, 1]. Missing agents default to neutral.
   * Presence of this map enables the reputation nudge in chain selection.
   */
  reputationScores?: Map<string, number>;
  /** Nudge strength γ ∈ [0, 0.2]. Defaults to DEFAULT_FORMATION_NUDGE. */
  reputationNudge?: number;
}

const PROXIMITY_THRESHOLD_KM = 2.0; // max gap between leg dropoff and next leg pickup

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Build relay chain from bids using precomputed adjacency graph + BFS.
 *
 * Phase 1: classify bids by proximity to origin/destination — O(n)
 * Phase 2: build adjacency graph (bid[i] can hand off to bid[j]) — O(n²)
 * Phase 3: BFS from origin-adjacent bids, max 3 hops, cost-pruned — O(n·k²)
 *          where k = avg neighbors per bid (sparse with 2km threshold)
 *
 * Previous implementation: O(n³) triple-nested loop.
 * This version: O(n²) dominated by adjacency build, with aggressive pruning
 * on the BFS making real-world performance sub-quadratic.
 */
export function findOptimalRelayChain(
  origin: LatLng,
  destination: LatLng,
  bids: BidNode[],
  maxBudgetSol: number,
  opts: OptimizerOptions = {},
): RelayChain | null {
  if (bids.length === 0) return null;

  const reps = opts.reputationScores;
  const gamma = opts.reputationNudge ?? DEFAULT_FORMATION_NUDGE;
  const hasReps = reps !== undefined;

  // Compute the comparison objective for a chain. When reputation scores
  // are provided, the effective cost includes the small bounded nudge
  // described in docs/reference/reputation-economics.md §4.
  function scoreChain(chainBids: BidNode[], rawCost: number) {
    if (!hasReps) return { avgRep: undefined as number | undefined, effective: rawCost };
    const sumRep = chainBids.reduce(
      (s, b) => s + (reps!.get(b.agentPubkey) ?? NEUTRAL_REPUTATION),
      0,
    );
    const avgRep = sumRep / chainBids.length;
    return { avgRep, effective: effectiveChainCost(rawCost, avgRep, gamma) };
  }

  // Phase 1: classify bids by proximity to origin/destination
  const startsNearOrigin: number[] = [];
  const endsNearDest = new Set<number>();

  for (let i = 0; i < bids.length; i++) {
    const pickup = { lat: bids[i].pickupLat, lng: bids[i].pickupLng };
    const dropoff = { lat: bids[i].dropoffLat, lng: bids[i].dropoffLng };
    if (haversineDistance(origin, pickup) <= PROXIMITY_THRESHOLD_KM) {
      startsNearOrigin.push(i);
    }
    if (haversineDistance(dropoff, destination) <= PROXIMITY_THRESHOLD_KM) {
      endsNearDest.add(i);
    }
  }

  // Phase 2: build adjacency graph — bid[i].dropoff near bid[j].pickup
  // Computed once; avoids redundant haversine calls in nested loops
  const neighbors: number[][] = Array.from({ length: bids.length }, () => []);
  for (let i = 0; i < bids.length; i++) {
    const dropoff = { lat: bids[i].dropoffLat, lng: bids[i].dropoffLng };
    for (let j = 0; j < bids.length; j++) {
      if (i === j) continue;
      if (bids[i].agentPubkey === bids[j].agentPubkey) continue;
      const pickup = { lat: bids[j].pickupLat, lng: bids[j].pickupLng };
      if (haversineDistance(dropoff, pickup) <= PROXIMITY_THRESHOLD_KM) {
        neighbors[i].push(j);
      }
    }
  }

  // Phase 3: BFS from origin-adjacent bids, max 3 hops, track cheapest chain
  // by effective cost (raw cost × reputation nudge, when reputations supplied).
  let best: RelayChain | null = null;
  let bestEffective = Infinity;

  // Safe pruning threshold: even the maximum reputation bonus can only
  // reduce effective cost by a factor of (1 − γ/2) on a pure-1.0-rep chain
  // compared to the neutral baseline. So we prune when raw cost already
  // exceeds best.effective / (1 − γ/2).
  const pruneSlack = hasReps ? 1 - gamma * 0.5 : 1;

  interface BFSState {
    idx: number;
    path: number[];
    cost: number;
    dist: number;
    agents: Set<string>;
  }

  function updateBest(chainBids: BidNode[], cost: number, dist: number) {
    const { avgRep, effective } = scoreChain(chainBids, cost);
    if (effective < bestEffective) {
      best = {
        bids: chainBids,
        totalCostSol: cost,
        totalDistanceKm: dist,
        avgReputation: avgRep,
        effectiveCostSol: effective,
      };
      bestEffective = effective;
    }
  }

  // Seed: 1-hop starting bids
  let frontier: BFSState[] = [];

  for (const i of startsNearOrigin) {
    const b = bids[i];
    if (b.costSol > maxBudgetSol) continue;
    if (b.costSol * pruneSlack >= bestEffective) continue;

    if (endsNearDest.has(i)) {
      updateBest([b], b.costSol, b.distanceKm);
    }

    frontier.push({
      idx: i,
      path: [i],
      cost: b.costSol,
      dist: b.distanceKm,
      agents: new Set([b.agentPubkey]),
    });
  }

  // Expand: 2-hop and 3-hop chains
  for (let hop = 1; hop < 3; hop++) {
    const nextFrontier: BFSState[] = [];

    for (const state of frontier) {
      for (const j of neighbors[state.idx]) {
        const nb = bids[j];
        if (state.agents.has(nb.agentPubkey)) continue;

        const newCost = state.cost + nb.costSol;
        if (newCost > maxBudgetSol) continue;
        if (newCost * pruneSlack >= bestEffective) continue; // safe prune

        const newDist = state.dist + nb.distanceKm;

        if (endsNearDest.has(j)) {
          const chainBids = [...state.path, j].map((k) => bids[k]);
          updateBest(chainBids, newCost, newDist);
        }

        nextFrontier.push({
          idx: j,
          path: [...state.path, j],
          cost: newCost,
          dist: newDist,
          agents: new Set([...state.agents, nb.agentPubkey]),
        });
      }
    }

    frontier = nextFrontier;
  }

  return best;
}
