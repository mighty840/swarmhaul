import type { LatLng } from "@swarmhaul/types";

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
 * Build relay chain from bids using Dijkstra-style shortest-cost path.
 * Graph: origin → bid pickup/dropoff locations → destination.
 * Edges exist when a bid's dropoff is within PROXIMITY_THRESHOLD_KM of another bid's pickup.
 */
export function findOptimalRelayChain(
  origin: LatLng,
  destination: LatLng,
  bids: BidNode[],
  maxBudgetSol: number,
): RelayChain | null {
  // Try single-leg direct bids first
  for (const bid of bids) {
    const pickupDist = haversineDistance(origin, {
      lat: bid.pickupLat,
      lng: bid.pickupLng,
    });
    const dropoffDist = haversineDistance(
      { lat: bid.dropoffLat, lng: bid.dropoffLng },
      destination,
    );

    if (
      pickupDist <= PROXIMITY_THRESHOLD_KM &&
      dropoffDist <= PROXIMITY_THRESHOLD_KM &&
      bid.costSol <= maxBudgetSol
    ) {
      return {
        bids: [bid],
        totalCostSol: bid.costSol,
        totalDistanceKm: bid.distanceKm,
      };
    }
  }

  // Try 2-leg relay chains
  const chains: RelayChain[] = [];

  for (const first of bids) {
    const firstPickupDist = haversineDistance(origin, {
      lat: first.pickupLat,
      lng: first.pickupLng,
    });
    if (firstPickupDist > PROXIMITY_THRESHOLD_KM) continue;

    for (const second of bids) {
      if (first.bidId === second.bidId) continue;
      if (first.agentPubkey === second.agentPubkey) continue;

      const gapDist = haversineDistance(
        { lat: first.dropoffLat, lng: first.dropoffLng },
        { lat: second.pickupLat, lng: second.pickupLng },
      );
      if (gapDist > PROXIMITY_THRESHOLD_KM) continue;

      const secondDropoffDist = haversineDistance(
        { lat: second.dropoffLat, lng: second.dropoffLng },
        destination,
      );
      if (secondDropoffDist > PROXIMITY_THRESHOLD_KM) continue;

      const totalCost = first.costSol + second.costSol;
      if (totalCost > maxBudgetSol) continue;

      chains.push({
        bids: [first, second],
        totalCostSol: totalCost,
        totalDistanceKm: first.distanceKm + second.distanceKm,
      });
    }
  }

  // Try 3-leg relay chains
  for (const first of bids) {
    const firstPickupDist = haversineDistance(origin, {
      lat: first.pickupLat,
      lng: first.pickupLng,
    });
    if (firstPickupDist > PROXIMITY_THRESHOLD_KM) continue;

    for (const second of bids) {
      if (first.bidId === second.bidId) continue;
      if (first.agentPubkey === second.agentPubkey) continue;

      const gap1 = haversineDistance(
        { lat: first.dropoffLat, lng: first.dropoffLng },
        { lat: second.pickupLat, lng: second.pickupLng },
      );
      if (gap1 > PROXIMITY_THRESHOLD_KM) continue;

      for (const third of bids) {
        if (third.bidId === first.bidId || third.bidId === second.bidId) continue;
        if (third.agentPubkey === first.agentPubkey || third.agentPubkey === second.agentPubkey) continue;

        const gap2 = haversineDistance(
          { lat: second.dropoffLat, lng: second.dropoffLng },
          { lat: third.pickupLat, lng: third.pickupLng },
        );
        if (gap2 > PROXIMITY_THRESHOLD_KM) continue;

        const thirdDropoffDist = haversineDistance(
          { lat: third.dropoffLat, lng: third.dropoffLng },
          destination,
        );
        if (thirdDropoffDist > PROXIMITY_THRESHOLD_KM) continue;

        const totalCost = first.costSol + second.costSol + third.costSol;
        if (totalCost > maxBudgetSol) continue;

        chains.push({
          bids: [first, second, third],
          totalCostSol: totalCost,
          totalDistanceKm: first.distanceKm + second.distanceKm + third.distanceKm,
        });
      }
    }
  }

  if (chains.length === 0) return null;

  // Return cheapest chain
  chains.sort((a, b) => a.totalCostSol - b.totalCostSol);
  return chains[0];
}
