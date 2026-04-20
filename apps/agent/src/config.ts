import { z } from "zod";
import { readFileSync } from "fs";
import type { LatLng } from "@swarmhaul/types";

const VehicleSchema = z.object({
  carMake: z.string(),
  carModel: z.string(),
  bootVolumeLitres: z.number().positive(),
  fuelConsumptionLPer100km: z.number().positive(),
  fuelCostEurPerLitre: z.number().positive(),
  hourlyRateEur: z.number().positive(),
  isAutonomous: z.boolean().default(false),
});

const BidSettingsSchema = z.object({
  maxDetourKm: z.number().positive().default(3.0),
  maxDetourMinutes: z.number().positive().default(15),
  minProfitMarginPct: z.number().min(0).default(20),
  autoAccept: z.boolean().default(true),
});

const ConfigSchema = z.object({
  agentPubkey: z.string(),
  keypairPath: z.string(),
  apiEndpoint: z.string().url(),
  /**
   * Solana RPC the agent submits its own transactions to (currently only
   * the intermediate-hop `confirm_leg` from the execution loop). Falls
   * back to the `SOLANA_RPC_URL` env var, then to devnet. Set this to
   * `http://127.0.0.1:8899` when running against a local test validator.
   */
  solanaRpcUrl: z.string().url().optional(),
  /**
   * Simulated transit delay between detecting a ready-to-attest handoff
   * and signing `confirm_leg` for it. Keeps the demo visible without
   * making the agent appear to instantly teleport the package. Defaults
   * to 15 s.
   */
  simTransitDelayMs: z.number().int().nonnegative().default(15_000),
  vehicle: VehicleSchema,
  bidSettings: BidSettingsSchema,
  itinerary: z
    .array(
      z.object({
        location: z.object({ lat: z.number(), lng: z.number() }),
        eta: z.string().transform((s) => new Date(s)),
      }),
    )
    .default([]),
  llm: z
    .object({
      enabled: z.boolean().default(true),
      endpoint: z.string().url().default("https://llm-dev.meghsakha.com"),
      model: z.string().default("gpt-oss-120b"),
    })
    .default({}),
});

export type AgentConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AgentConfig {
  const configPath = process.env.CONFIG_PATH ?? "./agent.config.json";
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return ConfigSchema.parse(raw);
}
