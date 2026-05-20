import { describe, expect, it } from "vitest";
import { buildRotationSuggestions } from "../rotation";
import type { AssetDataQuality } from "../dataQuality";
import type { LiquidityAssessment } from "../liquidity";

describe("buildRotationSuggestions", () => {
  const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "HYPEUSDT"];
  const goodDq = (sym: string): AssetDataQuality => ({
    symbol: sym,
    status: "good",
    dailyCount: 400,
    maxAllowedWeight: 1,
    reason: "400 дней истории",
  });

  it("returns an empty list when no rules trigger", () => {
    const weights = [0.65, 0.2, 0.1, 0.05];
    const out = buildRotationSuggestions({
      weights,
      symbols: SYMBOLS,
      dataQuality: SYMBOLS.map(goodDq),
    });
    expect(out).toEqual([]);
  });

  it("flags a data-quality breach when an asset exceeds its dq cap", () => {
    const weights = [0.4, 0.2, 0.1, 0.3];
    const dq: AssetDataQuality[] = [
      goodDq("BTCUSDT"),
      goodDq("ETHUSDT"),
      goodDq("SOLUSDT"),
      {
        symbol: "HYPEUSDT",
        status: "limited",
        dailyCount: 200,
        maxAllowedWeight: 0.05,
        reason: "200 дней — limited",
      },
    ];
    const out = buildRotationSuggestions({ weights, symbols: SYMBOLS, dataQuality: dq });
    const hit = out.find((s) => s.source === "data-quality");
    expect(hit).toBeDefined();
    expect(hit?.trim.symbol).toBe("HYPEUSDT");
    expect(hit?.priority).toBe("High");
  });

  it("flags a meme cluster overshoot with High priority", () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "DOGEUSDT"];
    const weights = [0.4, 0.2, 0.4];
    const dq = symbols.map(goodDq);
    const out = buildRotationSuggestions({ weights, symbols, dataQuality: dq });
    const meme = out.find((s) => s.source === "cluster-overshoot");
    expect(meme).toBeDefined();
    expect(meme?.priority).toBe("High");
  });

  it("flags a core deficit when BTC+ETH < 60%", () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const weights = [0.1, 0.1, 0.8];
    const out = buildRotationSuggestions({
      weights,
      symbols,
      dataQuality: symbols.map(goodDq),
    });
    const core = out.find((s) => s.source === "core-deficit");
    expect(core).toBeDefined();
    expect(core?.add.symbol).toBe("BTCUSDT");
  });

  it("flags a red-tier liquidity position with weight > 5%", () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const weights = [0.5, 0.2, 0.3];
    const dq = symbols.map(goodDq);
    const liquidity: LiquidityAssessment[] = [
      { symbol: "BTCUSDT", avgDailyUsdVolume: 5e9, latestDailyUsdVolume: 5e9, tier: "blue", maxExecutableUsd: 2.5e8, note: "" },
      { symbol: "ETHUSDT", avgDailyUsdVolume: 1e9, latestDailyUsdVolume: 1e9, tier: "blue", maxExecutableUsd: 5e7, note: "" },
      { symbol: "SOLUSDT", avgDailyUsdVolume: 1e6, latestDailyUsdVolume: 1e6, tier: "red", maxExecutableUsd: 5e4, note: "" },
    ];
    const out = buildRotationSuggestions({ weights, symbols, dataQuality: dq, liquidity });
    const liq = out.find((s) => s.source === "liquidity");
    expect(liq).toBeDefined();
    expect(liq?.trim.symbol).toBe("SOLUSDT");
  });

  it("orders High priority before Medium", () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "HYPEUSDT"];
    const weights = [0.1, 0.1, 0.8]; // core deficit (Medium) + huge alpha overshoot (Medium)
    const dq: AssetDataQuality[] = [
      goodDq("BTCUSDT"),
      goodDq("ETHUSDT"),
      {
        symbol: "HYPEUSDT",
        status: "very-limited",
        dailyCount: 120,
        maxAllowedWeight: 0.02,
        reason: "120 дней",
      },
    ];
    const out = buildRotationSuggestions({ weights, symbols, dataQuality: dq });
    const ranks = out.map((s) => s.priority);
    for (let i = 1; i < ranks.length; i++) {
      const prev = ranks[i - 1] === "High" ? 0 : ranks[i - 1] === "Medium" ? 1 : 2;
      const cur = ranks[i] === "High" ? 0 : ranks[i] === "Medium" ? 1 : 2;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});
