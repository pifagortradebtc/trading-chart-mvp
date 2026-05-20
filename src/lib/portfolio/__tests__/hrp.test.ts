import { describe, expect, it } from "vitest";
import { hrpWeights, maxDiversificationWeights } from "../hrp";
import { basicBasket, correlatedBasket } from "./fixtures";

const SUM_TOL = 1e-9;

describe("hrpWeights", () => {
  it("produces weights summing to 1 on a clean 3-asset basket", () => {
    const out = hrpWeights(basicBasket(400));
    expect(out.weights.length).toBe(3);
    const sum = out.weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(out.weights.every((w) => w >= 0 && w <= 1)).toBe(true);
  });

  it("falls back to equal-weight on a single-asset basket", () => {
    const out = hrpWeights([
      {
        symbol: "BTCUSDT",
        times: Array.from({ length: 10 }, (_, i) => i),
        prices: Array.from({ length: 10 }, () => 100),
      },
    ]);
    expect(out.weights).toEqual([1]);
  });

  it("returns equal-weight on basket shorter than 5 days", () => {
    const out = hrpWeights([
      { symbol: "A", times: [0, 1, 2], prices: [100, 100, 100] },
      { symbol: "B", times: [0, 1, 2], prices: [100, 100, 100] },
    ]);
    expect(out.weights[0]).toBeCloseTo(0.5, 5);
    expect(out.weights[1]).toBeCloseTo(0.5, 5);
    expect(out.warning).toBeDefined();
  });

  it("on a basket with two highly correlated assets, gives smaller per-asset weight than equal-weight would", () => {
    // BTC + ETH-proxy correlated (~1) + uncorrelated SOL.
    // HRP recursive bisection halves the budget between the correlated pair
    // and the lone asset → correlated pair ≈ 0.5 split → each ≈ 0.25 < 1/3.
    const out = hrpWeights(correlatedBasket(400));
    expect(out.weights[0]).toBeLessThan(1 / 3 + 0.05);
  });
});

describe("maxDiversificationWeights", () => {
  it("produces weights summing to 1 on a clean 3-asset basket", () => {
    const out = maxDiversificationWeights(basicBasket(400));
    const sum = out.weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, SUM_TOL);
    expect(out.weights.every((w) => w >= 0)).toBe(true);
  });

  it("warns on short history", () => {
    const out = maxDiversificationWeights([
      { symbol: "A", times: [0, 1, 2], prices: [100, 101, 102] },
      { symbol: "B", times: [0, 1, 2], prices: [100, 99, 98] },
    ]);
    expect(out.warning).toBeDefined();
  });
});
