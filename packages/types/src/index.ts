// === Core Geometry ===

export interface LatLng {
  lat: number;
  lng: number;
}

// === Package ===

export type PackageStatus =
  | "listed"
  | "swarm_forming"
  | "in_transit"
  | "delivered"
  | "failed";

export interface Package {
  id: string;
  shipper: string; // Solana pubkey
  origin: LatLng;
  destination: LatLng;
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
  status: PackageStatus;
  listedAt: Date;
  deliveredAt?: Date;
}

// === Vehicle Profile ===

export interface VehicleProfile {
  agentPubkey: string;
  ownerName: string;
  carMake: string;
  carModel: string;
  bootVolumeLitres: number;
  fuelConsumptionLPer100km: number;
  fuelCostEurPerLitre: number;
  hourlyRateEur: number;
  isAutonomous: boolean;
  currentLocation?: LatLng;
  itinerary?: ItineraryWaypoint[];
}

export interface ItineraryWaypoint {
  location: LatLng;
  eta: Date;
}

// === Bidding ===

export interface Bid {
  id: string;
  packageId: string;
  agentPubkey: string;
  proposedLeg: Leg;
  costSol: number;
  reasoning?: string; // LLM reasoning explanation
  expiresAt: Date;
}

// === Legs ===

export type LegStatus = "pending" | "active" | "completed";

export interface Leg {
  id: string;
  swarmId: string;
  agentPubkey: string;
  pickupLocation: LatLng;
  dropoffLocation: LatLng;
  distanceKm: number;
  estimatedDurationMin: number;
  agreedPaymentSol: number;
  status: LegStatus;
}

// === Swarm ===

export type SwarmStatus = "forming" | "active" | "settled" | "failed";

export interface Swarm {
  id: string;
  packageId: string;
  legs: Leg[];
  totalCostSol: number;
  escrowAccount: string; // Solana PDA
  formedAt: Date;
  status: SwarmStatus;
}

// === Agent Reputation ===

export interface AgentReputation {
  agentPubkey: string;
  legsCompleted: number;
  legsAccepted: number;
  avgDeliveryTimeSec: number;
  reliabilityScore: number; // 0-100
  registeredAt: Date;
}

// === Negotiation ===

export type NegotiationAction = "bid" | "counter" | "accept" | "reject";

export interface NegotiationMessage {
  id: string;
  packageId: string;
  fromAgent: string;
  toAgent?: string; // undefined = broadcast
  action: NegotiationAction;
  proposedCostSol?: number;
  proposedLeg?: Leg;
  reasoning?: string;
  timestamp: Date;
}

// === WebSocket Events ===

export type WSEvent =
  | { type: "PACKAGE_LISTED"; package: Package }
  | { type: "BID_RECEIVED"; bid: Bid }
  | { type: "NEGOTIATION_UPDATE"; message: NegotiationMessage }
  | { type: "SWARM_FORMED"; swarm: Swarm }
  | { type: "LEG_STARTED"; leg: Leg }
  | { type: "LEG_COMPLETED"; leg: Leg }
  | { type: "PACKAGE_DELIVERED"; packageId: string }
  | { type: "VEHICLE_LOCATION"; pubkey: string; location: LatLng }
  | { type: "REPUTATION_UPDATED"; reputation: AgentReputation };
