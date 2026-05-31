import { describe, expect, it } from "vitest";
import { prefilterByHistoryLength } from "../market-data";

function makeSeries(symbol: string, length: number) {
  const klines = Array.from({ length }, (_, i) => ({
    time: i * 86_400_000,
    close: 100 + i,
  }));
  return { symbol, klines };
}

describe("prefilterByHistoryLength", () => {
  it("keeps all assets when they share the same history length", () => {
    const input = [
      makeSeries("BTCUSDT", 1000),
      makeSeries("ETHUSDT", 1000),
      makeSeries("SOLUSDT", 1000),
    ];
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept).toHaveLength(3);
    expect(dropped).toHaveLength(0);
  });

  it("drops a short asset that would force everyone else to its length", () => {
    const input = [
      makeSeries("BTCUSDT", 1000),
      makeSeries("ETHUSDT", 1000),
      makeSeries("HYPEUSDT", 150), // <200 = 20% of max (new default minRatio = 0.2)
    ];
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept.map((k) => k.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(dropped.map((d) => d.symbol)).toEqual(["HYPEUSDT"]);
    expect(dropped[0]!.length).toBe(150);
    expect(dropped[0]!.maxLength).toBe(1000);
    expect(dropped[0]!.reason).toMatch(/watchlist/i);
  });

  it("keeps a short asset when it stays above 20% of the longest", () => {
    const input = [
      makeSeries("BTCUSDT", 1000),
      makeSeries("HYPEUSDT", 250), // >200 — passes new 20% ratio guard
    ];
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });

  it("keeps everyone when all assets are uniformly short (no benchmark to fail against)", () => {
    const input = [
      makeSeries("BTCUSDT", 200),
      makeSeries("ETHUSDT", 220),
      makeSeries("HYPEUSDT", 180),
    ];
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept).toHaveLength(3);
    expect(dropped).toHaveLength(0);
  });

  it("respects the absolute floor: <90d is always dropped even against short benchmarks", () => {
    const input = [
      makeSeries("BTCUSDT", 100),
      makeSeries("ETHUSDT", 100),
      makeSeries("HYPEUSDT", 60), // below the 90d absolute floor
    ];
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept.map((k) => k.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(dropped.map((d) => d.symbol)).toEqual(["HYPEUSDT"]);
  });

  it("returns the original list rather than empty when threshold would drop everyone", () => {
    // Pathological: a single asset shorter than its own (impossible — but assert defensive
    // fallback when the filter computes to zero `kept`).
    const input = [makeSeries("BTCUSDT", 50)]; // below absolute floor
    const { kept, dropped } = prefilterByHistoryLength(input);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("handles empty input", () => {
    const { kept, dropped } = prefilterByHistoryLength([]);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
