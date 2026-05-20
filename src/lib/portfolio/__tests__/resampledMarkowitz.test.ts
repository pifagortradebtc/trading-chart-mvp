import { describe, expect, it } from "vitest";
import { resampledMarkowitzWeights } from "../resampledMarkowitz";
import { basicBasket } from "./fixtures";

describe("resampledMarkowitzWeights", () => {
  it("returns normalized weights", () => {
    const out = resampledMarkowitzWeights(basicBasket(400), 0.04);
    const sum = out.weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(out.weights.every((w) => w >= 0)).toBe(true);
  });

  it("is deterministic across calls with identical inputs", () => {
    const basket = basicBasket(400);
    const a = resampledMarkowitzWeights(basket, 0.04);
    const b = resampledMarkowitzWeights(basket, 0.04);
    for (let i = 0; i < a.weights.length; i++) {
      expect(a.weights[i]).toBeCloseTo(b.weights[i], 12);
    }
  });

  it("falls back to equal-weight on too-short history", () => {
    const out = resampledMarkowitzWeights(
      [
        { symbol: "A", times: [0, 1, 2, 3], prices: [100, 101, 102, 103] },
        { symbol: "B", times: [0, 1, 2, 3], prices: [100, 99, 98, 97] },
      ],
      0.04,
    );
    expect(out.warning).toBeDefined();
    expect(out.weights[0]).toBeCloseTo(0.5, 5);
    expect(out.weights[1]).toBeCloseTo(0.5, 5);
  });
});
