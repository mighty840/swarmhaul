import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

/**
 * Full multi-leg demo, end-to-end:
 *
 *   seed 2-leg swarm via /dev/seed-multi-leg
 *   → coordinator signs list_package + form_swarm + assign_leg on-chain
 *   → agent executor auto-signs the intermediate confirm_leg ~15 s later
 *   → API mirror flips package.status: swarm_forming → in_transit
 *   → dashboard lifecycle timeline advances from SWARM FORMED to IN TRANSIT
 *
 * We stop short of DELIVERED because the final leg is shipper-signed
 * (Phantom) and we don't inject a browser wallet in CI — that case is
 * covered by the Anchor + API integration tests.
 */
test("seeded 2-leg swarm progresses from swarm_forming to in_transit", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  // 1. Seed a fresh 2-leg swarm via the dev-only endpoint.
  const seedRes = await request.post(`${API_URL}/dev/seed-multi-leg`);
  expect(seedRes.ok()).toBeTruthy();
  const seed = await seedRes.json();
  const packageId = seed.packageId as string;
  expect(seed.package.swarm.legs).toHaveLength(2);

  // 2. Load the dashboard and navigate into the swarm detail.
  // We go via Observatory → click the package row, mirroring a user.
  await page.goto("/");
  await expect(page.getByText(/DEVNET|LINKED/)).toBeVisible({
    timeout: 15_000,
  });

  // The seeded description acts as our deterministic anchor in the UI.
  const row = page
    .locator("button,a,[role='button']")
    .filter({ hasText: /DEV seed · multi-leg relay/ });
  await row.first().waitFor({ timeout: 15_000 });
  await row.first().click();

  // 3. Hero should show SWARM FORMED as current phase.
  await expect(page.getByText(/SWARM FORMED/i)).toBeVisible();
  await expect(page.getByText(/LEG BREAKDOWN/i)).toBeVisible();

  // 4. Within ~30 s, bravo's executor signs the leg-0 handoff on-chain,
  // the API mirror flips to in_transit, and the dashboard re-fetches
  // (5 s poll) → IN TRANSIT becomes the current lifecycle phase.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/packages/${packageId}`);
        const pkg = await res.json();
        return pkg.status;
      },
      {
        timeout: 60_000,
        intervals: [2_000, 3_000, 5_000],
        message:
          "package.status should flip to in_transit after agent auto-signs handoff",
      },
    )
    .toBe("in_transit");

  // UI catches up on the next poll.
  await page.reload();
  await expect(page.getByText(/IN TRANSIT/i).first()).toBeVisible();
});
