import type { PriceSeries } from "./types";
import type { StrategyMetrics } from "./strategyTypes";
import { computeMetrics } from "./mpt";

const TRADING_DAYS_PER_YEAR = 365;

/**
 * Computes the StrategyMetrics row for a single weight vector against the
 * supplied (already aligned) `priceSeries`.
 *
 * Reuses `computeMetrics()` from mpt.ts for the return/vol/sharpe/sortino
 * triple, then adds the strategy-specific stats: maxDD, CVaR-95/99,
 * correlation to BTC, and L1 turnover vs the equal-weight baseline.
 *
 * `baselineWeights` defaults to equal-weight for turnover purposes.
 * `corrToBtc` returns NaN when BTC is not in the basket — the UI shows "—".
 */
export function computeStrategyMetrics(
  weights: number[],
  priceSeries: PriceSeries[],
  riskFreeRate: number,
  baselineWeights?: number[]
): StrategyMetrics {
  const base = computeMetrics(weights, priceSeries, riskFreeRate);

  const dailyReturns = portfolioDailyReturns(weights, priceSeries);
  const maxDD = maxDrawdown(dailyReturns);
  const cvar95 = conditionalValueAtRisk(dailyReturns, 0.95);
  const cvar99 = conditionalValueAtRisk(dailyReturns, 0.99);

  const btcIdx = priceSeries.findIndex(
    (p) => p.symbol === "BTCUSDT" || p.symbol === "BTCUSDC" || p.symbol === "BTC"
  );
  const corrToBtc =
    btcIdx >= 0
      ? pearson(dailyReturns, logReturns(priceSeries[btcIdx].prices))
      : Number.NaN;

  const n = weights.length;
  const baseline =
    baselineWeights && baselineWeights.length === n
      ? baselineWeights
      : new Array(n).fill(1 / n);
  let turnover = 0;
  for (let i = 0; i < n; i++) turnover += Math.abs(weights[i] - baseline[i]);

  return {
    expectedReturn: base.return,
    volatility: base.volatility,
    sharpe: base.sharpe,
    sortino: base.sortino,
    maxDrawdown: maxDD,
    cvar95,
    cvar99,
    corrToBtc,
    turnover,
  };
}

/** Daily portfolio log-returns under static weights. */
export function portfolioDailyReturns(
  weights: number[],
  priceSeries: PriceSeries[]
): number[] {
  const n = priceSeries.length;
  const assetReturns = priceSeries.map((p) => logReturns(p.prices));
  const T = assetReturns[0]?.length ?? 0;
  const out = new Array<number>(T);
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let i = 0; i < n; i++) r += weights[i] * assetReturns[i][t];
    out[t] = r;
  }
  return out;
}

/**
 * Maximum drawdown from a daily-return series. Builds an equity curve
 * `equity_t = exp(sum log-returns)` and returns `min(equity / running_max) - 1`.
 * Result is non-positive; -0.42 means a 42% peak-to-trough loss.
 */
export function maxDrawdown(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const r of dailyReturns) {
    equity *= Math.exp(r);
    if (equity > peak) peak = equity;
    const dd = equity / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/**
 * CVaR-α on daily returns: mean of the worst (1-α) tail.
 * Returns a *daily* number; e.g. -0.08 = lose 8% on an average bad-tail day.
 */
export function conditionalValueAtRisk(
  dailyReturns: number[],
  alpha: number
): number {
  if (dailyReturns.length === 0) return 0;
  const tailFrac = Math.max(0.005, Math.min(0.5, 1 - alpha));
  const tailCount = Math.max(1, Math.floor(dailyReturns.length * tailFrac));
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < tailCount; i++) sum += sorted[i];
  return sum / tailCount;
}

/**
 * Per-asset contribution to portfolio CVaR-α.
 * Identifies the worst-α days of the *portfolio* return series, then for each
 * asset returns `w_i * mean(asset_i return on those days)`.
 */
export function tailRiskContribution(
  weights: number[],
  priceSeries: PriceSeries[],
  alpha = 0.95
): { symbol: string; contribution: number }[] {
  const n = priceSeries.length;
  const portReturns = portfolioDailyReturns(weights, priceSeries);
  const T = portReturns.length;
  if (T === 0) return priceSeries.map((p) => ({ symbol: p.symbol, contribution: 0 }));
  const tailFrac = Math.max(0.005, Math.min(0.5, 1 - alpha));
  const tailCount = Math.max(1, Math.floor(T * tailFrac));

  // indices of the tailCount lowest portfolio returns
  const indexed = portReturns.map((r, t) => ({ t, r }));
  indexed.sort((a, b) => a.r - b.r);
  const worstIdx = indexed.slice(0, tailCount).map((x) => x.t);

  const assetReturns = priceSeries.map((p) => logReturns(p.prices));

  const result: { symbol: string; contribution: number }[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const t of worstIdx) s += assetReturns[i][t];
    const mean = s / worstIdx.length;
    result.push({
      symbol: priceSeries[i].symbol,
      contribution: weights[i] * mean,
    });
  }
  return result;
}

function logReturns(prices: number[]): number[] {
  const r: number[] = new Array(prices.length - 1);
  for (let i = 1; i < prices.length; i++) {
    r[i - 1] = Math.log(prices[i] / prices[i - 1]);
  }
  return r;
}

function pearson(xs: number[], ys: number[]): number {
  const len = Math.min(xs.length, ys.length);
  if (len < 2) return Number.NaN;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < len; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= len;
  my /= len;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < len; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? num / denom : Number.NaN;
}

// Exposed for the CVaR optimizer in strategies.ts (avoids cyclic recompute).
export function annualizedDailyVol(daily: number): number {
  return daily * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
