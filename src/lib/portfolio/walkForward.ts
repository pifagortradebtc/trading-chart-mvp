import type { PriceSeries } from "./types";
import { hrpWeights } from "./hrp";

/**
 * Walk-forward equity curve for HRP weights.
 *
 *   1. Slide a `trainWindow`-day window through the price history.
 *   2. At each rebalance point t, compute HRP weights on prices [t − W, t).
 *   3. Apply those weights to *out-of-sample* daily returns over [t, t + step).
 *   4. Concatenate OOS log-returns into a single equity curve starting at 100.
 *
 * Why HRP (not finalFund): HRP is parameter-free, doesn't need BL views or the
 * MC cloud, and is cheap to retrain (O(n³) clustering on n ≤ ~20 assets). The
 * resulting curve is a *true* OOS estimate of how this basket would have
 * performed under a periodic-rebalance, retraining-each-step regime — not a
 * static-weight backtest like the main equity card.
 *
 * Knobs (constants below): trainWindow = 365d, step = 30d. Picked to match
 * how a quarterly research cadence would actually retrain in production.
 */

const TRAIN_WINDOW = 365;
const STEP = 30;

export interface WalkForwardResult {
  times: number[];
  equity: number[];
  /** Number of retrain points hit during the walk. */
  rebalances: number;
  /** Cumulative compounded return at the end. (1 = +100%) */
  totalReturn: number;
  /** Worst peak-to-trough drawdown across the OOS curve. */
  maxDrawdown: number;
  /** Annualized σ on the OOS daily returns. */
  realizedVol: number;
  warning?: string;
}

export function walkForwardHRPEquity(
  priceSeries: PriceSeries[],
  trainWindow: number = TRAIN_WINDOW,
  step: number = STEP
): WalkForwardResult | null {
  if (priceSeries.length === 0) return null;
  const n = priceSeries[0].prices.length;
  if (n < trainWindow + step + 1) {
    return {
      times: [],
      equity: [],
      rebalances: 0,
      totalReturn: 0,
      maxDrawdown: 0,
      realizedVol: 0,
      warning: `Окно ${n}d < train(${trainWindow}) + step(${step}). Нужно ≥${trainWindow + step + 1} дней истории.`,
    };
  }
  const fullTimes = priceSeries[0].times;

  const times: number[] = [];
  const equity: number[] = [];
  const dailyReturns: number[] = [];

  // Start the curve at the first OOS day, equity = 100.
  let cumLog = 0;
  equity.push(100);
  times.push(fullTimes[trainWindow] ?? fullTimes[fullTimes.length - 1]);

  let rebalances = 0;
  let t = trainWindow;

  while (t + step <= n) {
    // Train HRP on [t - trainWindow, t)
    const trainSeries: PriceSeries[] = priceSeries.map((p) => ({
      symbol: p.symbol,
      times: p.times.slice(t - trainWindow, t),
      prices: p.prices.slice(t - trainWindow, t),
    }));
    const { weights } = hrpWeights(trainSeries);
    rebalances++;

    // Apply for the next `step` days OOS
    for (let k = 0; k < step; k++) {
      const dayIdx = t + k;
      if (dayIdx + 1 >= n) break;
      let r = 0;
      for (let i = 0; i < priceSeries.length; i++) {
        const prices = priceSeries[i].prices;
        if (dayIdx + 1 >= prices.length) continue;
        const a = prices[dayIdx];
        const b = prices[dayIdx + 1];
        if (a <= 0 || b <= 0) continue;
        r += weights[i] * Math.log(b / a);
      }
      cumLog += r;
      dailyReturns.push(r);
      equity.push(100 * Math.exp(cumLog));
      times.push(fullTimes[dayIdx + 1] ?? fullTimes[fullTimes.length - 1]);
    }
    t += step;
  }

  // Diagnostics
  const last = equity[equity.length - 1] ?? 100;
  const totalReturn = (last - 100) / 100;

  let peak = equity[0] ?? 100;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = e / peak - 1;
    if (dd < worst) worst = dd;
  }

  let mean = 0;
  for (const r of dailyReturns) mean += r;
  mean /= Math.max(1, dailyReturns.length);
  let v = 0;
  for (const r of dailyReturns) v += (r - mean) * (r - mean);
  const dailyVar = v / Math.max(1, dailyReturns.length - 1);
  const realizedVol = Math.sqrt(Math.max(0, dailyVar) * 365);

  return {
    times,
    equity,
    rebalances,
    totalReturn,
    maxDrawdown: worst,
    realizedVol,
  };
}
