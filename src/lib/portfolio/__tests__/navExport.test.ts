import { describe, expect, it } from "vitest";
import { buildNavExport } from "../navExport";

describe("buildNavExport", () => {
  it("maps trading-chart symbols to bare fund tickers and sums to 100%", () => {
    const out = buildNavExport({
      weights: [0.55, 0.25, 0.15, 0.05],
      symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "HYPEUSDT"],
    });
    expect(out.payload.items.map((i) => i.symbol)).toEqual(
      expect.arrayContaining(["BTC", "ETH", "SOL", "HYPE"])
    );
    const sum = out.payload.items.reduce((a, b) => a + b.weight, 0);
    expect(sum).toBeCloseTo(100, 2);
    expect(out.warnings.length).toBe(0);
  });

  it("emits a CASH row when sleeveFraction > 0", () => {
    const out = buildNavExport({
      weights: [0.7, 0.3],
      symbols: ["BTCUSDT", "ETHUSDT"],
      sleeveFraction: 0.1,
    });
    const cash = out.payload.items.find((i) => i.category === "CASH");
    expect(cash).toBeDefined();
    expect(cash?.symbol).toBe("USDT");
    expect(cash?.weight).toBeCloseTo(10, 2);
  });

  it("drops tickers not in the fund whitelist with a warning", () => {
    const out = buildNavExport({
      weights: [0.7, 0.3],
      symbols: ["BTCUSDT", "FOOBARUSDT"],
    });
    expect(out.payload.items.find((i) => i.symbol === "FOOBAR")).toBeUndefined();
    expect(out.warnings.some((w) => w.includes("FOOBAR"))).toBe(true);
  });

  it("drops dust positions <0.05% to keep payload below 50 items", () => {
    const out = buildNavExport({
      weights: [0.9999, 0.0001],
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    // ETH at 0.01% → dust → dropped.
    expect(out.payload.items.length).toBe(1);
    expect(out.payload.items[0].symbol).toBe("BTC");
  });

  it("absorbs the rounding residual into the largest position", () => {
    const out = buildNavExport({
      weights: [1 / 3, 1 / 3, 1 / 3],
      symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    });
    const sum = out.payload.items.reduce((a, b) => a + b.weight, 0);
    expect(sum).toBeCloseTo(100, 4); // backend tolerance is 0.01
  });

  it("sorts CASH last", () => {
    const out = buildNavExport({
      weights: [0.6, 0.4],
      symbols: ["BTCUSDT", "ETHUSDT"],
      sleeveFraction: 0.05,
    });
    const cats = out.payload.items.map((i) => i.category);
    expect(cats.indexOf("CASH")).toBe(cats.length - 1);
  });
});
