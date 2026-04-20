import { defineConfig } from "vitest/config";

/**
 * Root Vitest config.
 *
 * Vitest 4 replaced `defineWorkspace` with `projects` inside a root
 * `defineConfig`. We list the two app configs explicitly so vitest
 * won't crawl newer workspaces like `tests/e2e/**` (Playwright specs)
 * and try to evaluate them.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/api/vitest.config.ts",
      "apps/agent/vitest.config.ts",
    ],
  },
});
