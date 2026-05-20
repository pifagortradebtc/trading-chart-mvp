import { describe, expect, it } from "vitest";
import { buildWatchlist } from "../watchlist";
import type { AssetDataQuality } from "../dataQuality";

describe("buildWatchlist", () => {
  const symbols = ["BTCUSDT", "HYPEUSDT", "FOOBARUSDT"];
  const weights = [0.6, 0.05, 0.0015];
  const dq: AssetDataQuality[] = [
    { symbol: "BTCUSDT", status: "good", dailyCount: 400, maxAllowedWeight: 1, reason: "ok" },
    { symbol: "HYPEUSDT", status: "no-data", dailyCount: 30, maxAllowedWeight: 0, reason: "30 дней" },
    { symbol: "FOOBARUSDT", status: "good", dailyCount: 400, maxAllowedWeight: 1, reason: "ok" },
  ];

  it("flags no-data assets", () => {
    const out = buildWatchlist({ weights, symbols, dataQuality: dq });
    expect(out.some((e) => e.symbol === "HYPEUSDT" && e.reason === "no-data")).toBe(true);
  });

  it("flags uncategorized assets (cluster=other)", () => {
    const out = buildWatchlist({ weights, symbols, dataQuality: dq });
    expect(out.some((e) => e.symbol === "FOOBARUSDT" && e.reason === "uncategorized")).toBe(true);
  });

  it("includes honorary tickers not in the basket", () => {
    const out = buildWatchlist({ weights, symbols, dataQuality: dq });
    expect(out.some((e) => e.reason === "honorary")).toBe(true);
  });

  it("sorts blocking constraints before honorary mentions", () => {
    const out = buildWatchlist({ weights, symbols, dataQuality: dq });
    const noDataIdx = out.findIndex((e) => e.reason === "no-data");
    const honoraryIdx = out.findIndex((e) => e.reason === "honorary");
    expect(noDataIdx).toBeLessThan(honoraryIdx);
  });
});
