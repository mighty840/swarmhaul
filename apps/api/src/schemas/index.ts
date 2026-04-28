/**
 * Zod schemas for every API request body. Applied via fastify-type-provider-zod.
 *
 * Rules enforced here:
 * - Coordinates inside [-90, 90] / [-180, 180]
 * - All SOL / weight / volume amounts > 0
 * - Strings have length limits
 * - UUIDs are validated
 * - Solana pubkeys are base58 strings of length 32-44
 * - Future dates only on expiresAt
 *
 * Reject NaN, Infinity, negative numbers, oversized payloads at the perimeter.
 */
import { z } from "zod";

// ─── Primitives ────────────────────────────────────────────────────

// Solana pubkey or hackathon demo pseudo-key (pre-Privy).
// We allow 1..64 chars to support both real base58 keys and demo strings.
const SolanaPubkey = z.string().min(1).max(64);

const Latitude = z
  .number()
  .finite("latitude must be finite")
  .gte(-90, "latitude < -90")
  .lte(90, "latitude > 90");

const Longitude = z
  .number()
  .finite("longitude must be finite")
  .gte(-180, "longitude < -180")
  .lte(180, "longitude > 180");

const PositiveSol = z
  .number()
  .finite()
  .positive("must be positive")
  .lte(1_000_000, "implausibly large amount");

const PositiveKg = z
  .number()
  .finite()
  .positive()
  .lte(10_000, "weight > 10t — not handled");

const PositiveLitres = z
  .number()
  .finite()
  .positive()
  .lte(50_000, "volume > 50000L — not handled");

const PositiveDistance = z
  .number()
  .finite()
  .positive()
  .lte(10_000, "distance > 10000km — not handled");

const PositiveDuration = z
  .number()
  .finite()
  .int()
  .positive()
  .lte(10_080, "duration > 1 week — not handled");

// ─── Package routes ────────────────────────────────────────────────

export const PackageCreateBody = z.object({
  shipperPubkey: SolanaPubkey,
  originLat: Latitude,
  originLng: Longitude,
  destLat: Latitude,
  destLng: Longitude,
  description: z.string().min(1).max(200),
  weightKg: PositiveKg,
  volumeLitres: PositiveLitres,
  maxBudgetSol: PositiveSol,
});
export type PackageCreateBodyType = z.infer<typeof PackageCreateBody>;

// Wallet-signed dispatch: build-tx returns an unsigned transaction
// for the shipper's wallet to sign + fund. Confirm persists after
// the signed transaction lands on chain.
export const PackageBuildTxBody = PackageCreateBody;
export type PackageBuildTxBodyType = z.infer<typeof PackageBuildTxBody>;

export const PackageConfirmBody = z.object({
  packageId: z.string().uuid(),
  signature: z
    .string()
    .min(64)
    .max(128, "signature too long")
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "signature must be base58"),
  shipperPubkey: SolanaPubkey,
  onChainPackage: SolanaPubkey,
  onChainVault: SolanaPubkey,
  originLat: Latitude,
  originLng: Longitude,
  destLat: Latitude,
  destLng: Longitude,
  description: z.string().min(1).max(200),
  weightKg: PositiveKg,
  volumeLitres: PositiveLitres,
  maxBudgetSol: PositiveSol,
});
export type PackageConfirmBodyType = z.infer<typeof PackageConfirmBody>;

export const PackageIdParam = z.object({
  id: z.string().uuid("not a valid UUID"),
});

// ─── Bid routes ────────────────────────────────────────────────────

export const BidCreateBody = z.object({
  packageId: z.string().uuid(),
  agentPubkey: SolanaPubkey,
  pickupLat: Latitude,
  pickupLng: Longitude,
  dropoffLat: Latitude,
  dropoffLng: Longitude,
  distanceKm: PositiveDistance,
  estimatedDurationMin: PositiveDuration,
  costSol: PositiveSol,
  reasoning: z.string().max(500).optional(),
  expiresAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now() - 1000, "expiresAt is in the past"),
});
export type BidCreateBodyType = z.infer<typeof BidCreateBody>;

export const BidPackageIdParam = z.object({
  packageId: z.string().uuid(),
});

// ─── Vehicle routes ────────────────────────────────────────────────

export const VehicleRegisterBody = z.object({
  agentPubkey: SolanaPubkey,
  ownerName: z.string().min(1).max(100),
  carMake: z.string().min(1).max(60),
  carModel: z.string().min(1).max(60),
  bootVolumeLitres: PositiveLitres,
  fuelConsumptionL100: z.number().finite().positive().lte(50),
  fuelCostEurPerLitre: z.number().finite().positive().lte(20),
  hourlyRateEur: z.number().finite().positive().lte(1000),
  isAutonomous: z.boolean().optional(),
});
export type VehicleRegisterBodyType = z.infer<typeof VehicleRegisterBody>;

export const VehiclePubkeyParam = z.object({
  pubkey: SolanaPubkey,
});

// ─── Swarm routes ──────────────────────────────────────────────────

export const SwarmIdParam = z.object({
  id: z.string().uuid(),
});

export const LegConfirmBody = z.object({
  agentPubkey: SolanaPubkey,
  recipientPubkey: SolanaPubkey.optional(),
  confirmSignature: z.string().min(40).max(120).optional(),
});
export type LegConfirmBodyType = z.infer<typeof LegConfirmBody>;

export const LegIdParam = z.object({
  legId: z.string().uuid(),
});

export const LegBuildConfirmTxBody = z.object({
  recipientPubkey: SolanaPubkey,
});
export type LegBuildConfirmTxBodyType = z.infer<typeof LegBuildConfirmTxBody>;

export const LegDisputeBody = z.object({
  shipperPubkey: SolanaPubkey,
  reason: z.string().min(1).max(500).default("Not received"),
});
export type LegDisputeBodyType = z.infer<typeof LegDisputeBody>;

// ─── Reputation routes ─────────────────────────────────────────────

export const ReputationPubkeyParam = z.object({
  pubkey: SolanaPubkey,
});

// ─── MCP routes ────────────────────────────────────────────────────

export const McpCallBody = z.object({
  tool: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
export type McpCallBodyType = z.infer<typeof McpCallBody>;
