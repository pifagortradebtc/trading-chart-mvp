import { describe, expect, it } from "vitest";
import { assessLiquidity, basketLiquidityScore, formatUsdShort } from "../liquidity";
import { basicBasket, syntheticSeries } from "./fixtures";
import type { PriceSeries } from "../types";

describe("assessLiquidity", () => {
  it("classifies a high-volume series as 'blue'", () => {
    // BTC-like: 80k base volume × $60k close = $4.8B daily — blue tier (≥$1B).
    const out = assessLiquidity(basicBasket(400));
    const btc = out.find((a) => a.symbol === "BTCUSDT")!;
    expect(btc.tier).toBe("blue");
    expect(btc.avgDailyUsdVolume).toBeGreaterThan(1e9);
  });

  it("classifies a tiny-volume series as 'red'", () => {
    const thin = syntheticSeries(
      { symbol: "TINYUSDT", days: 100, startPrice: 1, drift: 0, dailyVol: 0.05, volume: 1000 },
      1,
    );
    // 1000 × $1 = $1k daily — red.
    const out = assessLiquidity([thin]);
    expect(out[0].tier).toBe("red");
  });

  it("returns 'no-data' when volumes are missing", () => {
    const noVol: PriceSeries = {
      symbol: "X",
      times: [1, 2, 3],
      prices: [100, 100, 100],
      // volumes intentionally omitted
    };
    const out = assessLiquidity([noVol]);
    expect(out[0].tier).toBe("no-data");
  });

  it("max executable position is 5% of avg daily USD volume", () => {
    const out = assessLiquidity(basicBasket(400));
    for (const a of out) {
      if (a.tier === "no-data") continue;
      expect(a.maxExecutableUsd).toBeCloseTo(a.avgDailyUsdVolume * 0.05, 5);
    }
  });
});

describe("basketLiquidityScore", () => {
  it("returns 100 when every asset is in blue tier", () => {
    const all = assessLiquidity(basicBasket(400)).map((a) => ({
      ...a,
      tier: "blue" as const,
    }));
    const score = basketLiquidityScore([0.6, 0.3, 0.1], all);
    expect(score).toBe(100);
  });

  it("penalizes red-tier exposure proportionally", () => {
    const fakeRed = assessLiquidity(basicBasket(400)).map((a) => ({
      ...a,
      tier: "red" as const,
    }));
    const score = basketLiquidityScore([0.6, 0.3, 0.1], fakeRed);
    expect(score).toBe(0); // -150pp from full red basket → clamped at 0
  });

  it("returns 100 score on empty basket", () => {
    expect(basketLiquidityScore([], [])).toBe(100);
  });
});

describe("formatUsdShort", () => {
  it("renders billions, millions, thousands", () => {
    expect(formatUsdShort(2_500_000_000)).toBe("$2.5B");
    expect(formatUsdShort(120_000_000)).toBe("$120.0M");
    expect(formatUsdShort(5_500)).toBe("$6k");
  });
  it("returns em-dash on zero/invalid input", () => {
    expect(formatUsdShort(0)).toBe("—");
    expect(formatUsdShort(NaN)).toBe("—");
  });
});
