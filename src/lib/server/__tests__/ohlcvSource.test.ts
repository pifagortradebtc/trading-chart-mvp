import { describe, expect, it } from "vitest";
import { pickOhlcvSource, sourceFilenamePrefix } from "../ohlcvSource";

describe("pickOhlcvSource", () => {
  it("routes OKBUSDT to OKX", () => {
    const { source, note } = pickOhlcvSource("OKBUSDT");
    expect(source).toBe("okx");
    expect(note).toMatch(/OKX/i);
  });

  it("routes HYPEUSDT to Bybit (длиннее CoinGecko free tier)", () => {
    const { source, note } = pickOhlcvSource("HYPEUSDT");
    expect(source).toBe("bybit");
    expect(note).toMatch(/Hyperliquid|Bybit/i);
  });

  it("routes MNTUSDT to Bybit (нет на Binance/OKX, longer history vs CoinGecko)", () => {
    const { source, note } = pickOhlcvSource("MNTUSDT");
    expect(source).toBe("bybit");
    expect(note).toMatch(/Mantle|Bybit/i);
  });

  it("defaults to Binance for unmapped symbols", () => {
    expect(pickOhlcvSource("BTCUSDT").source).toBe("binance");
    expect(pickOhlcvSource("ETHUSDT").source).toBe("binance");
    expect(pickOhlcvSource("SOLUSDT").source).toBe("binance");
  });

  it("is case-insensitive", () => {
    expect(pickOhlcvSource("okbusdt").source).toBe("okx");
    expect(pickOhlcvSource("hypeusdt").source).toBe("bybit");
    expect(pickOhlcvSource("mntusdt").source).toBe("bybit");
  });
});

describe("sourceFilenamePrefix", () => {
  it("returns empty for binance to preserve back-compat with existing cache", () => {
    expect(sourceFilenamePrefix("binance")).toBe("");
  });

  it("returns a distinct prefix per non-binance source", () => {
    expect(sourceFilenamePrefix("okx")).toBe("okx_");
    expect(sourceFilenamePrefix("coingecko")).toBe("coingecko_");
    expect(sourceFilenamePrefix("bybit")).toBe("bybit_");
  });
});
