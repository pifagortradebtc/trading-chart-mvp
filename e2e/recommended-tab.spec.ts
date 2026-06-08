import { test, expect } from "@playwright/test";
import { mockMarketData } from "./helpers/ohlcvMock";

/**
 * Recommended tab E2E: after initial compute completes, the tab shows
 * the new advisory blocks — Confidence, Why narrative, Cluster Exposure,
 * Liquidity, Walk-forward — and the NAV export button is wired.
 *
 * We wait on the "fund pick" eyebrow as a signal that finalFund has computed
 * (it's only rendered after the worker round-trip).
 */
test.describe("Recommended tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockMarketData(page);
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    // Worker round-trip is done when the Plotly cloud chart is mounted in
    // SimulationTab — that proves `result` is populated and `strategies`
    // has been computed. Plotly emits a `.js-plotly-plot` DIV per chart.
    await page.waitForSelector(".js-plotly-plot", { timeout: 120_000 });
    await page.getByRole("button", { name: "Recommended" }).click();
    // "fund pick" eyebrow is conditionally rendered when strategy != null.
    // Use exact text match to avoid colliding with the form-control label
    // "Симуляций" elsewhere on the page.
    await expect(page.getByText("fund pick", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("shows Confidence + Why narrative + Cluster + Liquidity", async ({ page }) => {
    // These are unique headers per advisory block.
    for (const label of [
      /Confidence/i,
      /Why these weights/i,
      /Cluster exposure/i,
      /Rebalance Plan/i,
      /Liquidity layer/i,
      /Walk-forward equity/i,
    ]) {
      await expect(page.locator("body")).toContainText(label);
    }
  });

  test("Copy NAV button is present in the header", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Copy NAV/i })).toBeVisible();
  });

  test("Recommendation Mode pills exist in Risk Caps tab", async ({ page }) => {
    await page.getByRole("button", { name: "Risk Caps & Views" }).click();
    for (const mode of ["Conservative", "Balanced", "Aggressive"]) {
      await expect(page.locator(`button:has-text("${mode}")`).first()).toBeVisible();
    }
  });
});
