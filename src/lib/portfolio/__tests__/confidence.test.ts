import { describe, expect, it } from "vitest";
import { computeConfidence } from "../confidence";
import type { StrategyResult } from "../strategyTypes";
import type { AssetDataQuality } from "../dataQuality";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function makeStrategy(weights: number[], overrides: Partial<StrategyResult["metrics"]> = {}): StrategyResult {
  return {
    id: "finalFund",
    name: "Final Fund Portfolio",
    weights,
    comment: "",
    metrics: {
      expectedReturn: 0.4,
      volatility: 0.5,
      sharpe: 1,
      sortino: 1.2,
      maxDrawdown: -0.3,
      cvar95: -0.05,
      cvar99: -0.08,
      corrToBtc: 0.5,
      turnover: 0.2,
      calmar: 1.3,
      ulcer: 0.1,
      betaToBtc: 0.9,
      ...overrides,
    },
  };
}

const goodDq: AssetDataQuality[] = symbols.map((s) => ({
  symbol: s,
  status: "good",
  dailyCount: 400,
  maxAllowedWeight: 1,
  reason: "400 дней истории",
}));

describe("computeConfidence", () => {
  it("returns a 0..100 score with a level label", () => {
    const final = makeStrategy([0.6, 0.3, 0.1]);
    const out = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: final,
      allStrategies: [final],
      symbols,
    });
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high"]).toContain(out.level);
    expect(out.factors.length).toBeGreaterThan(0);
  });

  it("rewards long history and well-controlled CVaR", () => {
    const final = makeStrategy([0.6, 0.3, 0.1], { cvar95: -0.03 });
    const out = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: final,
      allStrategies: [final],
      symbols,
    });
    expect(out.level).not.toBe("low");
  });

  it("penalizes deep CVaR breaches", () => {
    const cvarOk = makeStrategy([0.6, 0.3, 0.1], { cvar95: -0.03 });
    const cvarBad = makeStrategy([0.6, 0.3, 0.1], { cvar95: -0.15 });
    const okOut = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: cvarOk,
      allStrategies: [cvarOk],
      symbols,
    });
    const badOut = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: cvarBad,
      allStrategies: [cvarBad],
      symbols,
    });
    expect(badOut.score).toBeLessThan(okOut.score);
  });

  it("incorporates liquidity factor when provided", () => {
    const final = makeStrategy([0.6, 0.3, 0.1]);
    const high = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: final,
      allStrategies: [final],
      symbols,
      basketLiquidity: 95,
    });
    const low = computeConfidence({
      windowDays: 1095,
      dataQuality: goodDq,
      finalStrategy: final,
      allStrategies: [final],
      symbols,
      basketLiquidity: 20,
    });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.factors.some((f) => f.label === "Ликвидность")).toBe(true);
  });
});
