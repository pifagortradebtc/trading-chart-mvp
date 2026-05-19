import type { PriceSeries } from "./types";
import { marketCapWeightsWithLive } from "./marketCaps";

/**
 * Momentum-tilted market-cap weights ("time-series momentum overlay").
 *
 *   momentum_i = log(P_i,today / P_i,200d_ago)
 *   w_i      ∝ mc_i · exp(λ · momentum_i)
 *
 * Why exp/log instead of straight ratio: keeps the tilt symmetric in log-space
 * — a 50% rally and a 50% drawdown receive equal-magnitude but opposite tilts.
 *
 * Edge cases:
 *   - <LOOKBACK days of history → that asset gets momentum=0 (neutral),
 *     so it stays at its market-cap weight. No look-ahead.
 *   - Market-cap snapshot is the same one used by `marketCap` and BL strategies,
 *     so the baseline is consistent.
 *
 * λ=1.5 is a moderate setting: a +50% trailing year roughly doubles the
 * asset's tilt vs an asset that flat-lined. Reference: Moskowitz, Ooi,
 * Pedersen (2012, "Time Series Momentum"); we apply it cross-sectionally.
 */

const LOOKBACK_DAYS = 200;
const LAMBDA = 1.5;

export interface MomentumResult {
  weights: number[];
  /** Per-asset momentum score in log-space (0 if insufficient history). */
  scores: number[];
  warning?: string;
}

export function momentumOverlayWeights(
  priceSeries: PriceSeries[],
  liveMarketCaps?: Record<string, number> | null,
  lookback: number = LOOKBACK_DAYS,
  lambda: number = LAMBDA
): MomentumResult {
  const n = priceSeries.length;
  if (n === 0) return { weights: [], scores: [] };

  const symbols = priceSeries.map((p) => p.symbol);
  const baseline = marketCapWeightsWithLive(symbols, liveMarketCaps ?? undefined);

  const scores = new Array<number>(n).fill(0);
  let insufficient = 0;
  for (let i = 0; i < n; i++) {
    const prices = priceSeries[i].prices;
    if (prices.length <= lookback) {
      insufficient++;
      continue;
    }
    const past = prices[prices.length - 1 - lookback];
    const last = prices[prices.length - 1];
    if (past > 0 && last > 0) {
      scores[i] = Math.log(last / past);
    }
  }

  // Apply tilt
  const tilted = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const tilt = Math.exp(lambda * scores[i]);
    tilted[i] = Math.max(0, baseline.weights[i] * tilt);
    sum += tilted[i];
  }
  if (sum <= 0) {
    return {
      weights: baseline.weights,
      scores,
      warning: "Все веса обнулились — fallback на market-cap.",
    };
  }
  for (let i = 0; i < n; i++) tilted[i] /= sum;

  const warning =
    insufficient > 0
      ? `${insufficient}/${n} активов <${lookback}d истории — momentum=0 для них.`
      : undefined;
  return { weights: tilted, scores, warning };
}
