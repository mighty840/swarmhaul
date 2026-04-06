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
