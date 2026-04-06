import type { LatLng } from "@swarmhaul/types";
import { haversineDistance } from "./bidder.js";

interface ItineraryWaypoint {
  location: LatLng;
  eta: Date;
}

interface PackageInfo {
  id: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

interface ProposedLeg {
  pickupLocation: LatLng;
  dropoffLocation: LatLng;
  distanceKm: number;
  estimatedDurationMin: number;
  detourKm: number;
}

interface BidSettings {
  maxDetourKm: number;
  maxDetourMinutes: number;
}

const AVG_SPEED_KMH = 30; // city average

export function computeOptimalLeg(
  itinerary: ItineraryWaypoint[],
  pkg: PackageInfo,
): ProposedLeg | null {
  const origin: LatLng = { lat: pkg.originLat, lng: pkg.originLng };
  const dest: LatLng = { lat: pkg.destLat, lng: pkg.destLng };

  if (itinerary.length < 2) {
    // No itinerary — agent can still bid on the full route
    const directDist = haversineDistance(origin, dest);
    return {
      pickupLocation: origin,
      dropoffLocation: dest,
      distanceKm: directDist,
      estimatedDurationMin: (directDist / AVG_SPEED_KMH) * 60,
      detourKm: directDist, // full route is "detour" from no-trip
    };
  }

  // Find the best segment of the itinerary that overlaps with the package route
  let bestLeg: ProposedLeg | null = null;
  let bestDetour = Infinity;

  for (let i = 0; i < itinerary.length - 1; i++) {
    const segStart = itinerary[i].location;
    const segEnd = itinerary[i + 1].location;

    const pickupDetour = haversineDistance(segStart, origin);
    const dropoffDetour = haversineDistance(dest, segEnd);
    const legDist = haversineDistance(origin, dest);
    const originalDist = haversineDistance(segStart, segEnd);
    const detourKm = pickupDetour + legDist + dropoffDetour - originalDist;

    if (detourKm < bestDetour) {
      bestDetour = detourKm;
      bestLeg = {
        pickupLocation: origin,
        dropoffLocation: dest,
        distanceKm: legDist,
        estimatedDurationMin: (legDist / AVG_SPEED_KMH) * 60,
        detourKm: Math.max(0, detourKm),
      };
    }
  }

  return bestLeg;
}

export function detourExceedsLimit(
  leg: ProposedLeg,
  settings: BidSettings,
): boolean {
  if (leg.detourKm > settings.maxDetourKm) return true;
  const detourMin = (leg.detourKm / AVG_SPEED_KMH) * 60;
  return detourMin > settings.maxDetourMinutes;
}
