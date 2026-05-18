/**
 * Deterministic stress test: applies a per-asset shock vector to a portfolio
 * and reports the dollar-weighted loss + the asset with the largest absolute
 * contribution. This complements the historical CVaR-95 in strategyMetrics.ts.
 *
 * Default shocks are the fund's "moderate-bear" book scenario (roughly Q1-2022
 * style; deeper than 2020-March but shallower than peak FTX week). Edit the
 * table or pass `shocks` to override.
 */

/** Default per-asset shocks, as returns. -0.20 = -20%. */
export const DEFAULT_STRESS: Record<string, number> = {
  BTCUSDT: -0.20,
  ETHUSDT: -0.25,
  SOLUSDT: -0.35,
  BNBUSDT: -0.35,
  XRPUSDT: -0.35,
  HYPEUSDT: -0.50,
  TONUSDT: -0.50,
  OKBUSDT: -0.50,
  ADAUSDT: -0.40,
  DOGEUSDT: -0.45,
  AVAXUSDT: -0.40,
  LINKUSDT: -0.40,
  DOTUSDT: -0.40,
  ATOMUSDT: -0.40,
  LTCUSDT: -0.35,
};

/** Fallback shock used for any symbol not in DEFAULT_STRESS or override map. */
export const DEFAULT_ALT_SHOCK = -0.45;

export interface StressResult {
  /** Sum_i w_i * shock_i. Negative number, e.g. -0.27 = -27% portfolio drop. */
  portfolioLoss: number;
  contributions: { symbol: string; weight: number; shock: number; contribution: number }[];
  topContributor: { symbol: string; contribution: number };
}

export interface NamedStressScenario {
  name: string;
  description?: string;
  shocks: Record<string, number>;
}

/**
 * Three canonical scenarios + a "custom" hook. These are intentionally
 * coarse — they're storyboard tools, not Monte-Carlo VaR.
 */
export const SCENARIO_LIBRARY: NamedStressScenario[] = [
  {
    name: "Moderate bear",
    description: "Q1-2022 style: BTC -20%, alts -35..40%.",
    shocks: { ...DEFAULT_STRESS },
  },
  {
    name: "Severe drawdown",
    description: "March 2020 / FTX week: BTC -40%, ETH -50%, alts -60..70%.",
    shocks: {
      BTCUSDT: -0.40,
      ETHUSDT: -0.50,
      SOLUSDT: -0.65,
      BNBUSDT: -0.55,
      XRPUSDT: -0.55,
      HYPEUSDT: -0.75,
      TONUSDT: -0.70,
      OKBUSDT: -0.70,
    },
  },
  {
    name: "Alt-rotation",
    description: "Capital flees alts into BTC. BTC -10%, alts -45%.",
    shocks: {
      BTCUSDT: -0.10,
      ETHUSDT: -0.25,
      SOLUSDT: -0.50,
      BNBUSDT: -0.40,
      XRPUSDT: -0.45,
      HYPEUSDT: -0.60,
      TONUSDT: -0.55,
      OKBUSDT: -0.55,
    },
  },
];

export function runStressTest(
  weights: number[],
  symbols: string[],
  shocks?: Record<string, number>
): StressResult {
  const finalShocks = { ...DEFAULT_STRESS, ...(shocks ?? {}) };
  let total = 0;
  const contributions: StressResult["contributions"] = [];
  for (let i = 0; i < weights.length; i++) {
    const shock = finalShocks[symbols[i]] ?? DEFAULT_ALT_SHOCK;
    const contribution = weights[i] * shock;
    total += contribution;
    contributions.push({
      symbol: symbols[i],
      weight: weights[i],
      shock,
      contribution,
    });
  }
  contributions.sort((a, b) => a.contribution - b.contribution); // most negative first
  const top = contributions[0] ?? {
    symbol: symbols[0] ?? "",
    contribution: 0,
  };
  return {
    portfolioLoss: total,
    contributions,
    topContributor: { symbol: top.symbol, contribution: top.contribution },
  };
}
