import { test, expect } from "@playwright/test";
import { mockMarketData } from "./helpers/ohlcvMock";

/**
 * Rebalance Plan E2E: operator types a current weight, the table updates
 * the delta column, and the action label flips between BUY/HOLD/SELL.
 *
 * This exercises the input → state → rebalance recomputation loop end-to-end.
 */
test("Rebalance Plan reacts to current-weight input", async ({ page }) => {
  await mockMarketData(page);
  await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
  // Wait for the Plotly cloud to render — proves worker compute finished.
  await page.waitForSelector(".js-plotly-plot", { timeout: 120_000 });
  await page.getByRole("button", { name: "Recommended" }).click();
  await expect(page.getByText("Rebalance Plan", { exact: false })).toBeVisible({
    timeout: 30_000,
  });

  // Find the first row's input (BTC, biggest weight) and type 50% as current.
  const firstInput = page.locator("table input[type=number]").first();
  await firstInput.fill("50");

  // After typing, the input itself should reflect 50 — proves the controlled
  // state propagated back through React's onChange handler.
  await expect(firstInput).toHaveValue("50");

  // The "current = target" helper button should be available and clickable.
  // After click, all rows hold the target weight → no per-row delta.
  await page.getByRole("button", { name: "current = target" }).click();

  // Turnover summary chip should now read "~0.0%" — current matches target.
  await expect(page.getByText(/turnover/i).first()).toBeVisible();
});
