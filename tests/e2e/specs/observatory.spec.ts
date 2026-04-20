import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

test.describe("observatory", () => {
  test("loads, shows the LINKED badge, and renders economy stats", async ({
    page,
  }) => {
    await page.goto("/");
    // Status bar wakes up once the first /economy/stats poll resolves.
    await expect(page.getByText(/DEVNET|LINKED/)).toBeVisible({
      timeout: 15_000,
    });
    // Main stats panel surfaces non-negative counts.
    await expect(page.locator("body")).toContainText(/PKG\s+\d+/);
    await expect(page.locator("body")).toContainText(/AGT\s+\d+/);
  });

  test("API /economy/stats is reachable directly", async ({ request }) => {
    const res = await request.get(`${API_URL}/economy/stats`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("packages");
    expect(body).toHaveProperty("swarms");
    expect(body).toHaveProperty("legs");
  });
});
