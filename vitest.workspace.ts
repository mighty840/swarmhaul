import { defineWorkspace } from "vitest/config";

/**
 * Root Vitest workspace.
 *
 * Each package has its own vitest.config.ts that this aggregates.
 * Run `bun run test` from the repo root to execute everything in parallel.
 */
export default defineWorkspace([
  "apps/api",
  "apps/agent",
]);
