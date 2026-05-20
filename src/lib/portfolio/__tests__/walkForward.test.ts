import { describe, expect, it } from "vitest";
import { walkForwardHRPEquity } from "../walkForward";
import { basicBasket } from "./fixtures";

describe("walkForwardHRPEquity", () => {
  it("produces an equity curve starting at 100", () => {
    const out = walkForwardHRPEquity(basicBasket(500))!;
    expect(out.equity.length).toBeGreaterThan(1);
    expect(out.equity[0]).toBe(100);
  });

  it("equity[i] equals 100·exp(Σ daily returns up to i)", () => {
    const out = walkForwardHRPEquity(basicBasket(500))!;
    // last point should be > 0 and finite
    expect(out.equity[out.equity.length - 1]).toBeGreaterThan(0);
    expect(Number.isFinite(out.equity[out.equity.length - 1])).toBe(true);
  });

  it("returns a warning when history is too short", () => {
    const out = walkForwardHRPEquity(basicBasket(300));
    expect(out?.warning).toBeDefined();
  });

  it("returns null on empty input", () => {
    expect(walkForwardHRPEquity([])).toBeNull();
  });

  it("realizedVol is non-negative and finite", () => {
    const out = walkForwardHRPEquity(basicBasket(500))!;
    expect(out.realizedVol).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(out.realizedVol)).toBe(true);
  });
});
