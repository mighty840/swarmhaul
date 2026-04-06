import type { LatLng } from "@swarmhaul/types";

const EUR_TO_SOL = 0.007; // hardcoded for demo — TODO: CoinGecko API

interface VehicleConfig {
  fuelConsumptionLPer100km: number;
  fuelCostEurPerLitre: number;
  hourlyRateEur: number;
}

interface LegForCost {
  distanceKm: number;
  estimatedDurationMin: number;
  detourKm?: number;
}

export function computeCost(leg: LegForCost, vehicle: VehicleConfig): number {
  const fuelCost =
    (leg.distanceKm / 100) *
    vehicle.fuelConsumptionLPer100km *
    vehicle.fuelCostEurPerLitre;

  const timeCost = (leg.estimatedDurationMin / 60) * vehicle.hourlyRateEur;

  const detourCost = leg.detourKm
    ? (leg.detourKm / 100) *
      vehicle.fuelConsumptionLPer100km *
      vehicle.fuelCostEurPerLitre
    : 0;

  const totalEur = fuelCost + timeCost + detourCost;
  const costSol = totalEur * EUR_TO_SOL;

  return Math.round(costSol * 1_000_000) / 1_000_000; // 6 decimal places
}

export function haversineDistance(a: LatLng, b: LatLng): number {
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
