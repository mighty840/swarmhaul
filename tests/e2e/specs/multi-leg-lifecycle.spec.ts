import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

/**
 * Full multi-leg demo, end-to-end:
 *
 *   seed 2-leg swarm via /dev/seed-multi-leg
 *   → coordinator signs list_package + form_swarm + assign_leg on-chain
 *   → agent executor auto-signs the intermediate confirm_leg ~15 s later
 *   → API mirror flips package.status: swarm_forming → in_transit
 *
 * The dashboard has no URL routing into the Swarm Detail view (the
 * detail route lives in React state only), so this test exercises the
 * full protocol progression via the API and then asserts the
 * observatory UI renders an IN TRANSIT pill somewhere on the page —
 * proof the mirror + polling pipe reached the client.
 *
 * We stop short of DELIVERED because the final leg is shipper-signed
 * (Phantom) and we don't inject a browser wallet in CI.
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

  // 2. Load the dashboard so the polling pipe is live.
  await page.goto("/");
  await expect(page.getByText(/DEVNET|LINKED/)).toBeVisible({
    timeout: 15_000,
  });

  // 3. Within ~60 s, bravo's executor signs leg 0 on-chain, the API
  // mirror flips to `in_transit`.
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

  // 4. The dashboard reflects the new status on next poll. Reload to
  // force-refresh the Observatory so we're not waiting on the 5 s
  // interval.
  await page.reload();
  await expect(page.getByText(/IN TRANSIT/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
