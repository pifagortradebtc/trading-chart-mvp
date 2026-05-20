import { test, expect } from "@playwright/test";
import { mockMarketData } from "./helpers/ohlcvMock";

/**
 * Smoke: /portfolio loads, the 6 sub-tabs render, switching between them
 * doesn't throw. This is the cheapest sanity test — if it fails, the page
 * is fundamentally broken.
 *
 * Pifagor Fund's dev environment can't always reach api.binance.com (firewall
 * / region), so we mock /api/ohlcv + /api/marketcaps via Playwright `route()`
 * intercepts. Math runs on the synthetic series — identical to the unit-test
 * fixtures so weights are predictable.
 */
test.describe("/portfolio basic shell", () => {
  test.beforeEach(async ({ page }) => {
    await mockMarketData(page);
  });

  test("loads with header + 6 sub-tabs visible", async ({ page }) => {
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Pifagor|Portfolio/i);
    for (const label of [
      "Simulation",
      "Strategies",
      "Risk Caps & Views",
      "Stress Test",
      "Recommended",
      "Journal",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("can switch between all 6 sub-tabs", async ({ page }) => {
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    for (const label of [
      "Strategies",
      "Risk Caps & Views",
      "Stress Test",
      "Recommended",
      "Journal",
      "Simulation",
    ]) {
      await page.getByRole("button", { name: label }).click();
      // After click, the tab body's heading should render shortly.
    }
  });
});
