import { describe, it, expect } from "vitest";
import { computeCost, haversineDistance } from "./bidder.js";

const VEHICLE = {
  fuelConsumptionLPer100km: 4.5, // Prius
  fuelCostEurPerLitre: 1.85,
  hourlyRateEur: 12,
};

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance({ lat: 48.137, lng: 11.575 }, { lat: 48.137, lng: 11.575 })).toBe(0);
  });

  it("computes Munich center → Olympiapark (~3.5 km)", () => {
    const d = haversineDistance(
      { lat: 48.137, lng: 11.575 },
      { lat: 48.173, lng: 11.547 },
    );
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(5);
  });

  it("computes pole-to-pole (~20015 km)", () => {
    const d = haversineDistance({ lat: -90, lng: 0 }, { lat: 90, lng: 0 });
    expect(d).toBeGreaterThan(20000);
    expect(d).toBeLessThan(20100);
  });

  it("symmetric: a→b == b→a", () => {
    const a = { lat: 48.137, lng: 11.575 };
    const b = { lat: 52.52, lng: 13.405 };
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });
});

describe("computeCost", () => {
  it("returns positive cost for a non-zero leg", () => {
    const cost = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      VEHICLE,
    );
    expect(cost).toBeGreaterThan(0);
  });

  it("scales linearly with distance", () => {
    const c1 = computeCost({ distanceKm: 5, estimatedDurationMin: 15 }, VEHICLE);
    const c2 = computeCost({ distanceKm: 10, estimatedDurationMin: 30 }, VEHICLE);
    // Both fuel and time double — total should roughly double
    expect(c2).toBeGreaterThan(c1 * 1.9);
    expect(c2).toBeLessThan(c1 * 2.1);
  });

  it("higher hourly rate increases cost", () => {
    const cheap = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      { ...VEHICLE, hourlyRateEur: 5 },
    );
    const premium = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      { ...VEHICLE, hourlyRateEur: 50 },
    );
    expect(premium).toBeGreaterThan(cheap);
  });

  it("higher fuel consumption increases cost", () => {
    const efficient = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      { ...VEHICLE, fuelConsumptionLPer100km: 4 },
    );
    const thirsty = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      { ...VEHICLE, fuelConsumptionLPer100km: 12 },
    );
    expect(thirsty).toBeGreaterThan(efficient);
  });

  it("detour adds to cost", () => {
    const direct = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30 },
      VEHICLE,
    );
    const detour = computeCost(
      { distanceKm: 10, estimatedDurationMin: 30, detourKm: 5 },
      VEHICLE,
    );
    expect(detour).toBeGreaterThan(direct);
  });

  it("rounds to 6 decimal places", () => {
    const cost = computeCost({ distanceKm: 7.3, estimatedDurationMin: 22 }, VEHICLE);
    const decimals = cost.toString().split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(6);
  });

  it("zero distance still has time cost", () => {
    const cost = computeCost({ distanceKm: 0, estimatedDurationMin: 10 }, VEHICLE);
    expect(cost).toBeGreaterThan(0);
  });
});
