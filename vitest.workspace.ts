import { defineWorkspace } from "vitest/config";

/**
 * Root Vitest workspace.
 *
 * Each package has its own vitest.config.ts that this aggregates.
 * Run `bun run test` from the repo root to execute everything in parallel.
 */
export default defineWorkspace([
  // Point at the specific configs rather than directory globs so vitest
  // doesn't also crawl newer workspaces (e.g. `tests/e2e/**/*.spec.ts`,
  // which belongs to Playwright and has no vitest config).
  "apps/api/vitest.config.ts",
  "apps/agent/vitest.config.ts",
]);
