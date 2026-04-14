import { describe, bench } from "vitest";
import { findOptimalRelayChain } from "./route-optimizer.js";

const MUNICH_CENTER = { lat: 48.137, lng: 11.575 };
const MUNICH_NORTH = { lat: 48.173, lng: 11.547 };
const MUNICH_EAST = { lat: 48.155, lng: 11.62 };

function makeBids(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    bidId: `b${i}`,
    agentPubkey: `agent${i % 50}`,
    pickupLat: MUNICH_CENTER.lat + (i % 10) * 0.005,
    pickupLng: MUNICH_CENTER.lng + (i % 13) * 0.005,
    dropoffLat: MUNICH_NORTH.lat + (i % 8) * 0.005,
    dropoffLng: MUNICH_NORTH.lng + (i % 9) * 0.005,
    costSol: 0.02 + (i % 30) * 0.01,
    distanceKm: 2 + (i % 10),
  }));
}

// Connectable chain bids: origin → mid → dest
function makeChainBids(n: number) {
  const mid = {
    lat: (MUNICH_CENTER.lat + MUNICH_EAST.lat) / 2,
    lng: (MUNICH_CENTER.lng + MUNICH_EAST.lng) / 2,
  };
  const bids = [];
  for (let i = 0; i < n; i++) {
    const phase = i % 3;
    if (phase === 0) {
      bids.push({
        bidId: `b${i}`,
        agentPubkey: `agent-a-${i}`,
        pickupLat: MUNICH_CENTER.lat,
        pickupLng: MUNICH_CENTER.lng,
        dropoffLat: mid.lat + (i % 5) * 0.001,
        dropoffLng: mid.lng + (i % 5) * 0.001,
        costSol: 0.05 + Math.random() * 0.1,
        distanceKm: 3,
      });
    } else if (phase === 1) {
      bids.push({
        bidId: `b${i}`,
        agentPubkey: `agent-b-${i}`,
        pickupLat: mid.lat + (i % 5) * 0.001,
        pickupLng: mid.lng + (i % 5) * 0.001,
        dropoffLat: MUNICH_EAST.lat,
        dropoffLng: MUNICH_EAST.lng,
        costSol: 0.05 + Math.random() * 0.1,
        distanceKm: 3,
      });
    } else {
      // Noise bid — not connectable
      bids.push({
        bidId: `b${i}`,
        agentPubkey: `agent-c-${i}`,
        pickupLat: 48.0 + Math.random() * 0.2,
        pickupLng: 11.4 + Math.random() * 0.3,
        dropoffLat: 48.0 + Math.random() * 0.2,
        dropoffLng: 11.4 + Math.random() * 0.3,
        costSol: 0.1 + Math.random() * 0.2,
        distanceKm: 5,
      });
    }
  }
  return bids;
}

describe("route-optimizer benchmarks", () => {
  const bids10 = makeBids(10);
  const bids50 = makeBids(50);
  const bids200 = makeBids(200);
  const bids500 = makeBids(500);
  const bids1000 = makeBids(1000);
  const chain60 = makeChainBids(60);
  const chain300 = makeChainBids(300);

  bench("10 bids — sparse", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids10, 5.0);
  });

  bench("50 bids — sparse", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids50, 5.0);
  });

  bench("200 bids — sparse", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids200, 5.0);
  });

  bench("500 bids — sparse", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids500, 5.0);
  });

  bench("1000 bids — sparse", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_NORTH, bids1000, 5.0);
  });

  bench("60 bids — connectable chains", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_EAST, chain60, 1.0);
  });

  bench("300 bids — connectable chains", () => {
    findOptimalRelayChain(MUNICH_CENTER, MUNICH_EAST, chain300, 1.0);
  });
});
