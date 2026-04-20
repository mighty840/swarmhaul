import { defineConfig, devices } from "@playwright/test";

/**
 * SwarmHaul end-to-end test config.
 *
 * Presumes a running stack (postgres + solana-test-validator + API +
 * agents + dashboard). The orchestration lives in the nightly workflow
 * at .github/workflows/e2e-nightly.yml or, locally, in
 * tests/e2e/scripts/up.sh.
 *
 * Tests target the dashboard dev server by default. Override with
 * DASHBOARD_URL=… and API_URL=… env vars when pointing at a different
 * environment.
 */
export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.DASHBOARD_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
