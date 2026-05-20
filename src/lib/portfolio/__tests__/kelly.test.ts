import { describe, expect, it } from "vitest";
import { fractionalKellyWeights } from "../kelly";
import { syntheticSeries } from "./fixtures";

describe("fractionalKellyWeights", () => {
  it("returns [1] on a single asset", () => {
    const single = syntheticSeries(
      { symbol: "BTCUSDT", days: 100, startPrice: 100, drift: 0.5, dailyVol: 0.02, volume: 1000 },
      1,
    );
    expect(fractionalKellyWeights([single]).weights).toEqual([1]);
  });

  it("falls back to equal-weight when no asset has positive drift", () => {
    const down1 = syntheticSeries(
      { symbol: "BTCUSDT", days: 200, startPrice: 100, drift: -0.3, dailyVol: 0.02, volume: 1000 },
      1,
    );
    const down2 = syntheticSeries(
      { symbol: "ETHUSDT", days: 200, startPrice: 100, drift: -0.4, dailyVol: 0.025, volume: 1000 },
      2,
    );
    const out = fractionalKellyWeights([down1, down2]);
    expect(out.weights[0]).toBeCloseTo(0.5, 5);
    expect(out.weights[1]).toBeCloseTo(0.5, 5);
    expect(out.warning).toBeDefined();
  });

  it("with half-Kelly, weights stay closer to equal-weight than to raw Kelly", () => {
    // One huge-drift asset and one flat → raw Kelly puts ~all weight on first.
    // Half-Kelly (default 0.5) blends with equal-weight → ~75/25 instead of ~99/1.
    const big = syntheticSeries(
      { symbol: "BTCUSDT", days: 250, startPrice: 100, drift: 2.0, dailyVol: 0.02, volume: 1000 },
      11,
    );
    const meh = syntheticSeries(
      { symbol: "ETHUSDT", days: 250, startPrice: 100, drift: 0.05, dailyVol: 0.04, volume: 1000 },
      22,
    );
    const half = fractionalKellyWeights([big, meh], 0.5);
    expect(half.weights[0]).toBeGreaterThan(half.weights[1]);
    expect(half.weights[0]).toBeLessThan(0.95); // not full-Kelly
    expect(half.weights[1]).toBeGreaterThan(0.05); // didn't get zeroed
  });

  it("sums to 1", () => {
    const a = syntheticSeries(
      { symbol: "BTCUSDT", days: 200, startPrice: 100, drift: 0.4, dailyVol: 0.02, volume: 1000 },
      1,
    );
    const b = syntheticSeries(
      { symbol: "ETHUSDT", days: 200, startPrice: 100, drift: 0.3, dailyVol: 0.03, volume: 1000 },
      2,
    );
    const out = fractionalKellyWeights([a, b]);
    const sum = out.weights.reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});
