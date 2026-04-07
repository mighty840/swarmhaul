import { describe, it, expect } from "vitest";
import { computeOptimalLeg, detourExceedsLimit } from "./itinerary.js";

const PKG = {
  id: "test-pkg",
  originLat: 48.137,
  originLng: 11.575,
  destLat: 48.173,
  destLng: 11.547,
};

describe("computeOptimalLeg", () => {
  it("returns a full-route leg when itinerary is empty", () => {
    const leg = computeOptimalLeg([], PKG);
    expect(leg).not.toBeNull();
    expect(leg!.pickupLocation.lat).toBe(PKG.originLat);
    expect(leg!.dropoffLocation.lat).toBe(PKG.destLat);
    expect(leg!.distanceKm).toBeGreaterThan(0);
  });

  it("returns a full-route leg when itinerary has only one waypoint", () => {
    const leg = computeOptimalLeg(
      [{ location: { lat: 48.137, lng: 11.575 }, eta: new Date() }],
      PKG,
    );
    expect(leg).not.toBeNull();
  });

  it("picks the segment closest to the package route", () => {
    const farSegment = [
      { location: { lat: 0, lng: 0 }, eta: new Date() },
      { location: { lat: 0.1, lng: 0.1 }, eta: new Date() },
    ];
    const closeSegment = [
      ...farSegment,
      { location: { lat: 48.137, lng: 11.575 }, eta: new Date() },
      { location: { lat: 48.173, lng: 11.547 }, eta: new Date() },
    ];

    const farLeg = computeOptimalLeg(farSegment, PKG);
    const closeLeg = computeOptimalLeg(closeSegment, PKG);

    expect(closeLeg!.detourKm).toBeLessThan(farLeg!.detourKm);
  });
});

describe("detourExceedsLimit", () => {
  it("rejects detours exceeding distance limit", () => {
    const leg = {
      pickupLocation: { lat: 0, lng: 0 },
      dropoffLocation: { lat: 0, lng: 0 },
      distanceKm: 5,
      estimatedDurationMin: 10,
      detourKm: 50,
    };
    expect(detourExceedsLimit(leg, { maxDetourKm: 3, maxDetourMinutes: 15 })).toBe(true);
  });

  it("accepts detours within both limits", () => {
    const leg = {
      pickupLocation: { lat: 0, lng: 0 },
      dropoffLocation: { lat: 0, lng: 0 },
      distanceKm: 5,
      estimatedDurationMin: 10,
      detourKm: 1,
    };
    expect(detourExceedsLimit(leg, { maxDetourKm: 3, maxDetourMinutes: 15 })).toBe(false);
  });

  it("rejects detours exceeding time limit even if distance OK", () => {
    // 2km at 30km/h ≈ 4 min — under both limits
    const okLeg = {
      pickupLocation: { lat: 0, lng: 0 },
      dropoffLocation: { lat: 0, lng: 0 },
      distanceKm: 5,
      estimatedDurationMin: 10,
      detourKm: 2,
    };
    expect(detourExceedsLimit(okLeg, { maxDetourKm: 5, maxDetourMinutes: 3 })).toBe(true);
  });

  it("zero detour always passes", () => {
    const leg = {
      pickupLocation: { lat: 0, lng: 0 },
      dropoffLocation: { lat: 0, lng: 0 },
      distanceKm: 5,
      estimatedDurationMin: 10,
      detourKm: 0,
    };
    expect(detourExceedsLimit(leg, { maxDetourKm: 0.001, maxDetourMinutes: 0.001 })).toBe(false);
  });
});
