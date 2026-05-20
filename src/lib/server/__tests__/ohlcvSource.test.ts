import { describe, expect, it } from "vitest";
import { pickOhlcvSource, sourceFilenamePrefix } from "../ohlcvSource";

describe("pickOhlcvSource", () => {
  it("routes OKBUSDT to OKX", () => {
    const { source, note } = pickOhlcvSource("OKBUSDT");
    expect(source).toBe("okx");
    expect(note).toMatch(/OKX/i);
  });

  it("routes HYPEUSDT to CoinGecko", () => {
    const { source, note } = pickOhlcvSource("HYPEUSDT");
    expect(source).toBe("coingecko");
    expect(note).toMatch(/Hyperliquid|CoinGecko/i);
  });

  it("defaults to Binance for unmapped symbols", () => {
    expect(pickOhlcvSource("BTCUSDT").source).toBe("binance");
    expect(pickOhlcvSource("ETHUSDT").source).toBe("binance");
    expect(pickOhlcvSource("MNTUSDT").source).toBe("binance");
  });

  it("is case-insensitive", () => {
    expect(pickOhlcvSource("okbusdt").source).toBe("okx");
    expect(pickOhlcvSource("hypeusdt").source).toBe("coingecko");
  });
});

describe("sourceFilenamePrefix", () => {
  it("returns empty for binance to preserve back-compat with existing cache", () => {
    expect(sourceFilenamePrefix("binance")).toBe("");
  });

  it("returns a distinct prefix per non-binance source", () => {
    expect(sourceFilenamePrefix("okx")).toBe("okx_");
    expect(sourceFilenamePrefix("coingecko")).toBe("coingecko_");
  });
});
