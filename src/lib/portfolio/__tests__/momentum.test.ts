import { describe, expect, it } from "vitest";
import { momentumOverlayWeights } from "../momentum";
import { basicBasket, syntheticSeries } from "./fixtures";

describe("momentumOverlayWeights", () => {
  it("normalizes to sum=1", () => {
    const out = momentumOverlayWeights(basicBasket(400));
    const sum = out.weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it("favors the up-trending asset over the flat one", () => {
    const days = 400;
    const upward = syntheticSeries(
      { symbol: "BTCUSDT", days, startPrice: 100, drift: 1.5, dailyVol: 0.02, volume: 1000 },
      1,
    );
    const flat = syntheticSeries(
      { symbol: "SOLUSDT", days, startPrice: 100, drift: 0, dailyVol: 0.02, volume: 1000 },
      2,
    );
    const out = momentumOverlayWeights([upward, flat]);
    expect(out.weights[0]).toBeGreaterThan(out.weights[1]);
  });

  it("emits a warning when assets have <200d history", () => {
    const short = syntheticSeries(
      { symbol: "BTCUSDT", days: 100, startPrice: 100, drift: 0.5, dailyVol: 0.02, volume: 1000 },
      1,
    );
    const out = momentumOverlayWeights([short]);
    expect(out.warning).toBeDefined();
  });

  it("returns empty weights on empty input", () => {
    const out = momentumOverlayWeights([]);
    expect(out.weights).toEqual([]);
  });
});
