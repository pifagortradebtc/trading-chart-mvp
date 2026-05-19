import type { StrategyResult } from "./strategyTypes";

/**
 * Model contribution to the Final Fund allocation.
 *
 * "Influence" = 1 − L1(model, final)/2, clipped to [0,1].
 *   - L1(a, b) = Σ |aᵢ − bᵢ|, max value 2 for unit-sum weight vectors.
 *   - Influence 1.0 means the model proposed exactly the final weights.
 *
 * Then per-model "top effects": the three assets where the model pushed the
 * hardest in the direction of the final allocation. A model that's strongly
 * opinionated about BTC will show "BTC +12%" — meaning this model was 12pp
 * heavier on BTC than the average. Symmetric for negative deltas.
 *
 * This is a presentation layer over the existing strategy outputs — no new
 * math, just structured comparison so the user can see "which models drove
 * which calls" in the Final Fund.
 */

export interface ModelEffect {
  symbol: string;
  /** Model weight − final weight. Positive: model voted heavier than final. */
  delta: number;
}

export interface ModelContribution {
  modelId: string;
  modelName: string;
  /** 0..1 — higher means model output is close to the final allocation. */
  influence: number;
  topEffects: ModelEffect[];
}

export function computeModelContributions(args: {
  finalWeights: number[];
  allStrategies: StrategyResult[];
  symbols: string[];
  topK?: number;
}): ModelContribution[] {
  const { finalWeights, allStrategies, symbols, topK = 3 } = args;
  const out: ModelContribution[] = [];

  for (const strat of allStrategies) {
    if (strat.id === "finalFund") continue;
    if (strat.weights.length !== finalWeights.length) continue;
    let l1 = 0;
    const effects: ModelEffect[] = [];
    for (let i = 0; i < finalWeights.length; i++) {
      const delta = strat.weights[i] - finalWeights[i];
      l1 += Math.abs(delta);
      effects.push({ symbol: symbols[i] ?? `#${i}`, delta });
    }
    const influence = Math.max(0, Math.min(1, 1 - l1 / 2));
    effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    out.push({
      modelId: strat.id,
      modelName: strat.name,
      influence,
      topEffects: effects.slice(0, topK),
    });
  }

  // Most influential first.
  out.sort((a, b) => b.influence - a.influence);
  return out;
}
