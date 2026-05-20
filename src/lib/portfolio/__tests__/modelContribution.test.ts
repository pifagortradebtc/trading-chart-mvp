import { describe, expect, it } from "vitest";
import { computeModelContributions } from "../modelContribution";
import type { StrategyResult } from "../strategyTypes";

function strat(id: StrategyResult["id"], weights: number[]): StrategyResult {
  return {
    id,
    name: id,
    weights,
    comment: "",
    metrics: {
      expectedReturn: 0,
      volatility: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      cvar95: 0,
      cvar99: 0,
      corrToBtc: 0,
      turnover: 0,
      calmar: 0,
      ulcer: 0,
      betaToBtc: 0,
    },
  };
}

describe("computeModelContributions", () => {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

  it("ranks identical model first (influence=1)", () => {
    const finalWeights = [0.6, 0.3, 0.1];
    const allStrategies: StrategyResult[] = [
      strat("blackLitterman", [0.6, 0.3, 0.1]),
      strat("hrp", [0.4, 0.4, 0.2]),
      strat("finalFund", finalWeights),
    ];
    const out = computeModelContributions({ finalWeights, allStrategies, symbols });
    expect(out[0].modelId).toBe("blackLitterman");
    expect(out[0].influence).toBeCloseTo(1, 5);
  });

  it("excludes finalFund itself", () => {
    const finalWeights = [0.6, 0.3, 0.1];
    const allStrategies: StrategyResult[] = [
      strat("blackLitterman", [0.5, 0.3, 0.2]),
      strat("finalFund", finalWeights),
    ];
    const out = computeModelContributions({ finalWeights, allStrategies, symbols });
    expect(out.some((c) => c.modelId === "finalFund")).toBe(false);
  });

  it("top effects ordered by |delta| descending", () => {
    const finalWeights = [0.5, 0.3, 0.2];
    const allStrategies: StrategyResult[] = [
      strat("hrp", [0.7, 0.2, 0.1]), // ΔBTC +0.2, ΔETH -0.1, ΔSOL -0.1
    ];
    const out = computeModelContributions({ finalWeights, allStrategies, symbols, topK: 3 });
    expect(out[0].topEffects[0].symbol).toBe("BTCUSDT");
    expect(Math.abs(out[0].topEffects[0].delta)).toBeGreaterThanOrEqual(
      Math.abs(out[0].topEffects[1].delta)
    );
  });
});
