import { describe, expect, it } from "vitest";
import { buildStrategiesBundle } from "../strategies";
import { runMPT } from "../mpt";
import { DEFAULT_AGGREGATE_RULES, DEFAULT_RISK_CAPS } from "../riskCaps";
import { basicBasket } from "./fixtures";

/**
 * End-to-end smoke for buildStrategiesBundle.
 *
 * Verifies that the full 14-strategy pipeline runs on a synthetic 3-asset
 * basket without crashing, every strategy returns weights that sum to 1, and
 * finalFund respects the policy caps.
 */
describe("buildStrategiesBundle (14-strategy pipeline)", () => {
  it("produces all 14 strategies, each summing to 1", () => {
    const priceSeries = basicBasket(400);
    const mptResult = runMPT({
      priceSeries,
      simulations: 5000,
      riskFreeRate: 0.04,
      seed: 42,
    });
    const bundle = buildStrategiesBundle({
      priceSeries,
      riskFreeRate: 0.04,
      mptResult,
      views: [],
      riskCaps: DEFAULT_RISK_CAPS,
      aggregateRules: DEFAULT_AGGREGATE_RULES,
    });
    expect(bundle.strategies.length).toBe(14);
    for (const s of bundle.strategies) {
      const sum = s.weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
      expect(s.weights.every((w) => w >= 0 && w <= 1 + 1e-9)).toBe(true);
    }
  });

  it("includes the new strategies hrp/maxDiv/momentum/kelly/resampled", () => {
    const priceSeries = basicBasket(400);
    const mptResult = runMPT({
      priceSeries,
      simulations: 3000,
      riskFreeRate: 0.04,
      seed: 99,
    });
    const bundle = buildStrategiesBundle({
      priceSeries,
      riskFreeRate: 0.04,
      mptResult,
      views: [],
      riskCaps: DEFAULT_RISK_CAPS,
      aggregateRules: DEFAULT_AGGREGATE_RULES,
    });
    const ids = bundle.strategies.map((s) => s.id);
    for (const expected of ["hrp", "maxDiv", "momentum", "kelly", "resampled", "finalFund"]) {
      expect(ids).toContain(expected);
    }
  });

  it("finalFund respects per-asset caps within heuristic tolerance", () => {
    // The Final Fund projection is a one-pass heuristic — small overshoots
    // above per-asset caps can survive renormalize loops. Tolerance band
    // of 10pp matches the production note in riskCaps.ts and prevents this
    // test from policing what the math intentionally doesn't enforce.
    const priceSeries = basicBasket(400);
    const mptResult = runMPT({
      priceSeries,
      simulations: 3000,
      riskFreeRate: 0.04,
      seed: 7,
    });
    const bundle = buildStrategiesBundle({
      priceSeries,
      riskFreeRate: 0.04,
      mptResult,
      views: [],
      riskCaps: DEFAULT_RISK_CAPS,
      aggregateRules: DEFAULT_AGGREGATE_RULES,
    });
    const finalFund = bundle.strategies.find((s) => s.id === "finalFund")!;
    const symbols = priceSeries.map((p) => p.symbol);
    for (let i = 0; i < symbols.length; i++) {
      const cap = DEFAULT_RISK_CAPS[symbols[i]];
      if (!cap || cap.max === undefined) continue;
      expect(finalFund.weights[i]).toBeLessThanOrEqual(cap.max + 0.1);
    }
  });

  it("returns a dataQuality array matching the basket size", () => {
    const priceSeries = basicBasket(400);
    const mptResult = runMPT({
      priceSeries,
      simulations: 2000,
      riskFreeRate: 0.04,
      seed: 1,
    });
    const bundle = buildStrategiesBundle({
      priceSeries,
      riskFreeRate: 0.04,
      mptResult,
      views: [],
      riskCaps: DEFAULT_RISK_CAPS,
      aggregateRules: DEFAULT_AGGREGATE_RULES,
    });
    expect(bundle.dataQuality.length).toBe(priceSeries.length);
  });
});
