import type { MPTResult, PriceSeries } from "./types";
import type {
  AggregateRules,
  StrategyId,
  StrategyResult,
  ViewInput,
} from "./strategyTypes";
import { computeStrategyMetrics, portfolioDailyReturns, conditionalValueAtRisk } from "./strategyMetrics";
import { marketCapWeightsWithLive } from "./marketCaps";
import { applyRiskCaps } from "./riskCaps";
import { assessDataQuality, type AssetDataQuality } from "./dataQuality";
import { hrpWeights, maxDiversificationWeights } from "./hrp";

const TRADING_DAYS_PER_YEAR = 365;
const SAMPLER_SEED = 8675309;
const SAMPLER_SIMS = 5000;

/**
 * Default daily CVaR-95 threshold for the Final Fund defensive bump.
 * If portfolio CVaR-95 is worse than this, we shift weight into BTC/ETH.
 */
export const DEFAULT_CVAR_DEFENSE_THRESHOLD = -0.08;

/**
 * Fraction of total weight to shift from non-core into BTC/ETH (60/40 split)
 * when the CVaR-defense trigger fires. Knowledge-of-system constant — keep
 * surfaced even if currently not user-editable.
 */
export const CVAR_DEFENSE_SHIFT = 0.10;

/**
 * Library of portfolio-construction strategies.
 *
 * All strategies return a normalized weight vector with the same ordering
 * as `priceSeries`. None of them re-run the 50k Monte-Carlo cloud —
 * heavy work is reused from the supplied MPTResult or done with a fresh
 * lightweight 5k-sample Dirichlet sweep.
 *
 * Black-Litterman is a *view-tilt MVP*: posterior_i = (1-c)*prior_i + c*view_i.
 * It deliberately skips the full Theil-mixed covariance (Σ' = Σ + ...) so we
 * don't have to invert matrices in JS. Acceptable for MVP — flagged in comments.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public façade
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildStrategiesArgs {
  priceSeries: PriceSeries[];
  riskFreeRate: number;
  mptResult: MPTResult;
  views: ViewInput[];
  riskCaps: Record<string, { min?: number; max?: number }>;
  aggregateRules: AggregateRules;
  /** Daily CVaR-95 trigger for the defensive bump. Default: -0.08. */
  cvarDefenseThreshold?: number;
  /** Live market caps from CoinGecko. Falls back to the static snapshot if absent. */
  liveMarketCaps?: Record<string, number> | null;
}

/**
 * Builds all 9 strategy results. Pure function — no I/O, deterministic given
 * the inputs and an internal seed.
 */
export interface StrategiesBundle {
  strategies: StrategyResult[];
  dataQuality: AssetDataQuality[];
}

export function buildAllStrategies(args: BuildStrategiesArgs): StrategyResult[] {
  return buildStrategiesBundle(args).strategies;
}

export function buildStrategiesBundle(args: BuildStrategiesArgs): StrategiesBundle {
  const {
    priceSeries,
    riskFreeRate,
    mptResult,
    views,
    riskCaps,
    aggregateRules,
    cvarDefenseThreshold = DEFAULT_CVAR_DEFENSE_THRESHOLD,
    liveMarketCaps,
  } = args;
  const dataQuality = assessDataQuality(priceSeries);
  const symbols = priceSeries.map((p) => p.symbol);
  const n = symbols.length;
  const equalBaseline = new Array(n).fill(1 / n);

  const make = (
    id: StrategyId,
    name: string,
    comment: string,
    weights: number[],
    warning?: string
  ): StrategyResult => ({
    id,
    name,
    weights,
    metrics: computeStrategyMetrics(weights, priceSeries, riskFreeRate, equalBaseline),
    warning,
    comment,
  });

  const eqW = equalWeight(n);
  const mc = marketCapWeightsWithLive(symbols, liveMarketCaps ?? undefined);
  const minVolW = mptResult.minVol.weights;
  const sharpeW = mptResult.maxSharpe.weights;
  const sortinoW = mptResult.maxSortino.weights;
  const rp = inverseVolRiskParity(priceSeries);
  const bl = blackLittermanTilt(priceSeries, views, symbols, riskFreeRate, liveMarketCaps);
  const cv = cvarMinimizingPortfolio(priceSeries, mptResult);
  const hrp = hrpWeights(priceSeries);
  const md = maxDiversificationWeights(priceSeries);

  // Final fund = BL → riskCaps (incl. data-quality) → CVaR-defense bump
  const final = finalFundPortfolio(
    priceSeries,
    bl.weights,
    riskCaps,
    aggregateRules,
    cvarDefenseThreshold,
    dataQuality
  );

  const strategies: StrategyResult[] = [
    make(
      "marketCap",
      "Market Cap",
      "Пассивный equilibrium-prior: доли пропорциональны капитализации.",
      mc.weights,
      mc.fallbackSymbols.length ? `Нет cap для ${mc.fallbackSymbols.join(", ")} (limited data).` : undefined
    ),
    make(
      "equalWeight",
      "Equal Weight",
      "1/N — наивный, но устойчивый бенчмарк.",
      eqW
    ),
    make(
      "minVol",
      "Min Volatility",
      "Минимизация годовой σ из Monte-Carlo облака.",
      minVolW
    ),
    make(
      "maxSharpe",
      "Max Sharpe",
      "Максимум (μ − rf) / σ — классический tangent.",
      sharpeW
    ),
    make(
      "maxSortino",
      "Max Sortino",
      "Tangent с downside-σ — наказывает только убытки.",
      sortinoW
    ),
    make(
      "riskParity",
      "Risk Parity",
      "Inverse-vol: каждый актив несёт равный риск-вклад (proxy).",
      rp.weights,
      rp.warning
    ),
    make(
      "blackLitterman",
      "Black-Litterman",
      "Equilibrium-prior + tilt по вашим views на доходность.",
      bl.weights,
      bl.warning
    ),
    make(
      "cvar",
      "CVaR-Optimal",
      "Минимизация CVaR-95: лучший среди 5k семплов по среднему худших 5%.",
      cv.weights,
      cv.warning
    ),
    make(
      "hrp",
      "HRP",
      "Hierarchical Risk Parity (López de Prado): кластеризация по корреляции + recursive bisection бюджета.",
      hrp.weights,
      hrp.warning
    ),
    make(
      "maxDiv",
      "Max Diversification",
      "Choueifaty & Coignard: максимизируем DR(w) = Σ wᵢσᵢ / √(w'Σw) — диверсификационный коэффициент.",
      md.weights,
      md.warning
    ),
    make(
      "finalFund",
      "Final Fund Portfolio",
      "BL → risk caps → защита от CVaR. Рекомендация фонда.",
      final.weights,
      final.warning
    ),
  ];
  return { strategies, dataQuality };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual strategies
// ─────────────────────────────────────────────────────────────────────────────

export function equalWeight(n: number): number[] {
  return new Array(n).fill(1 / Math.max(1, n));
}

/**
 * Risk parity *proxy*: w_i ∝ 1/σ_i (annualized vol).
 *
 * Full ERC ("equal risk contribution") requires iterative root-finding on
 * the covariance matrix — overkill for MVP. Inverse-vol matches ERC exactly
 * when the correlation matrix is the identity and is a good ballpark
 * otherwise. Flagged in StrategyResult.comment.
 */
export function inverseVolRiskParity(priceSeries: PriceSeries[]): {
  weights: number[];
  warning?: string;
} {
  const n = priceSeries.length;
  const sigmas = priceSeries.map((p) => {
    const r = logReturns(p.prices);
    return Math.sqrt(variance(r) * TRADING_DAYS_PER_YEAR);
  });
  const inv = sigmas.map((s) => (s > 0 ? 1 / s : 0));
  const sum = inv.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return { weights: equalWeight(n), warning: "Не удалось оценить σ — fallback equal-weight." };
  }
  return { weights: inv.map((x) => x / sum) };
}

/**
 * Black-Litterman view-tilt (MVP).
 *
 * Steps:
 *   1. Prior μ = mean(log returns) × 365 (historical, not implied).
 *      (Full BL would back out implied μ from market-cap weights via
 *      Σ·w_mkt · λ. Skipped — we anyway re-rank by Sharpe.)
 *   2. For each view: posterior_i = (1-c) * prior_i + c * view.expectedReturn.
 *      Other assets keep their prior.
 *   3. Sample 5k Dirichlet weights, score each by posterior-μ Sharpe.
 *   4. Apply view.maxWeight as a hard upper bound (clip + renormalize).
 *
 * Fallback: if `views` is empty, hand back the market-cap prior — this is
 * the canonical "no views" BL output.
 */
export function blackLittermanTilt(
  priceSeries: PriceSeries[],
  views: ViewInput[],
  symbols: string[],
  riskFreeRate: number,
  liveMarketCaps?: Record<string, number> | null
): { weights: number[]; warning?: string } {
  const n = priceSeries.length;
  if (views.length === 0) {
    const mc = marketCapWeightsWithLive(symbols, liveMarketCaps ?? undefined);
    return {
      weights: mc.weights,
      warning: "Нет views — возвращён market-cap prior (BL без tilt).",
    };
  }

  // 1. Prior μ
  const assetReturns = priceSeries.map((p) => logReturns(p.prices));
  const priorMu = assetReturns.map((r) => mean(r) * TRADING_DAYS_PER_YEAR);

  // 2. Posterior μ
  const posteriorMu = priorMu.slice();
  const maxByIdx = new Array<number>(n).fill(1);
  for (const v of views) {
    const idx = symbols.indexOf(v.symbol);
    if (idx < 0) continue;
    const c = Math.max(0, Math.min(1, v.confidence));
    posteriorMu[idx] = (1 - c) * priorMu[idx] + c * v.expectedReturn;
    if (v.maxWeight > 0 && v.maxWeight < 1) {
      maxByIdx[idx] = Math.min(maxByIdx[idx], v.maxWeight);
    }
  }

  // 3. Sample 5k Dirichlet, score by Sharpe on (posteriorMu, historical Σ)
  const sigmaDaily = covarianceMatrix(assetReturns);
  const sigma = sigmaDaily.map((row) => row.map((c) => c * TRADING_DAYS_PER_YEAR));

  const rng = mulberry32(SAMPLER_SEED);
  let bestSharpe = -Infinity;
  let bestW: number[] | null = null;
  for (let s = 0; s < SAMPLER_SIMS; s++) {
    const w = dirichletSample(n, rng);
    // Clip to view-imposed caps + renormalize
    let overshoot = false;
    for (let i = 0; i < n; i++) {
      if (w[i] > maxByIdx[i]) {
        overshoot = true;
        break;
      }
    }
    if (overshoot) {
      // Clip & renormalize once
      for (let i = 0; i < n; i++) if (w[i] > maxByIdx[i]) w[i] = maxByIdx[i];
      const tot = w.reduce((a, b) => a + b, 0);
      if (tot <= 0) continue;
      for (let i = 0; i < n; i++) w[i] /= tot;
    }
    const ret = dot(w, posteriorMu);
    const vol = Math.sqrt(Math.max(0, quadraticForm(w, sigma)));
    const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : -Infinity;
    if (sharpe > bestSharpe) {
      bestSharpe = sharpe;
      bestW = w.slice();
    }
  }

  if (!bestW) {
    const mc = marketCapWeightsWithLive(symbols, liveMarketCaps ?? undefined);
    return {
      weights: mc.weights,
      warning: "BL sampler не сошёлся — fallback на market-cap prior.",
    };
  }
  return { weights: bestW };
}

/**
 * CVaR-minimizing portfolio (MVP).
 *
 * Reuses the existing MPT cloud where possible: scans `mptResult.portfolios`
 * and picks the one with the best (least negative) CVaR-95 on daily port
 * returns. If the cloud is empty (shouldn't happen) falls back to a fresh
 * 5k Dirichlet sweep.
 */
export function cvarMinimizingPortfolio(
  priceSeries: PriceSeries[],
  mptResult: MPTResult
): { weights: number[]; warning?: string } {
  const cloud = mptResult.portfolios;
  if (!cloud || cloud.length === 0) {
    return cvarFreshSweep(priceSeries);
  }
  // For perf, only score a subset — uniformly downsampled to ~2k.
  const cap = Math.min(cloud.length, 2000);
  const stride = Math.max(1, Math.floor(cloud.length / cap));
  let bestCvar = -Infinity; // less negative = better
  let bestW: number[] | null = null;
  for (let i = 0; i < cloud.length; i += stride) {
    const w = cloud[i].weights;
    const daily = portfolioDailyReturns(w, priceSeries);
    const c = conditionalValueAtRisk(daily, 0.95);
    if (c > bestCvar) {
      bestCvar = c;
      bestW = w;
    }
  }
  return { weights: bestW ?? equalWeight(priceSeries.length) };
}

function cvarFreshSweep(priceSeries: PriceSeries[]): { weights: number[] } {
  const n = priceSeries.length;
  const rng = mulberry32(SAMPLER_SEED + 1);
  let bestCvar = -Infinity;
  let bestW = equalWeight(n);
  for (let s = 0; s < SAMPLER_SIMS; s++) {
    const w = dirichletSample(n, rng);
    const daily = portfolioDailyReturns(w, priceSeries);
    const c = conditionalValueAtRisk(daily, 0.95);
    if (c > bestCvar) {
      bestCvar = c;
      bestW = w.slice();
    }
  }
  return { weights: bestW };
}

/**
 * Final Fund Portfolio.
 *
 *   1. Start from BL weights.
 *   2. Project onto policy box (per-asset caps + aggregate rules).
 *   3. Recompute CVaR-95. If it is worse than `cvarDefenseThreshold` (daily),
 *      shift CVAR_DEFENSE_SHIFT of total weight from non-core to BTC/ETH
 *      (60/40 split) and re-project. One-shot bump, not iterative.
 */
export function finalFundPortfolio(
  priceSeries: PriceSeries[],
  blWeights: number[],
  riskCaps: Record<string, { min?: number; max?: number }>,
  aggregateRules: AggregateRules,
  cvarDefenseThreshold: number = DEFAULT_CVAR_DEFENSE_THRESHOLD,
  dataQuality?: AssetDataQuality[]
): { weights: number[]; warning?: string } {
  const symbols = priceSeries.map((p) => p.symbol);
  const n = symbols.length;
  const CORE = new Set(["BTCUSDT", "ETHUSDT"]);

  const step1 = applyRiskCaps(blWeights, symbols, riskCaps, aggregateRules, dataQuality);
  let w = step1.weights;
  const violations = step1.violations.slice();

  const daily = portfolioDailyReturns(w, priceSeries);
  const cvar = conditionalValueAtRisk(daily, 0.95);

  let warning: string | undefined;
  if (cvar < cvarDefenseThreshold) {
    warning = `CVaR-95 ${(cvar * 100).toFixed(1)}% → защита: +${(CVAR_DEFENSE_SHIFT * 100).toFixed(0)}% к BTC/ETH.`;
    const btcIdx = symbols.indexOf("BTCUSDT");
    const ethIdx = symbols.indexOf("ETHUSDT");
    const shift = CVAR_DEFENSE_SHIFT;
    // Take from non-core pro rata
    const nonCoreIdx: number[] = [];
    let nonCoreSum = 0;
    for (let i = 0; i < n; i++) {
      if (!CORE.has(symbols[i])) {
        nonCoreIdx.push(i);
        nonCoreSum += w[i];
      }
    }
    if (nonCoreSum > 0) {
      const takeFactor = Math.min(1, shift / nonCoreSum);
      for (const i of nonCoreIdx) w[i] *= 1 - takeFactor;
      if (btcIdx >= 0) w[btcIdx] += shift * 0.6;
      if (ethIdx >= 0) w[ethIdx] += shift * 0.4;
    }
    // Re-project to keep caps honored
    const step2 = applyRiskCaps(w, symbols, riskCaps, aggregateRules, dataQuality);
    w = step2.weights;
    violations.push(...step2.violations);
  }

  return {
    weights: w,
    warning: warning ?? (violations.length > 0 ? `Risk caps adjusted: ${violations.length} edits.` : undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local math helpers (do not export — duplicates of mpt.ts internals kept
// here so the worker bundle stays small and self-contained).
// ─────────────────────────────────────────────────────────────────────────────

function logReturns(prices: number[]): number[] {
  const r: number[] = new Array(prices.length - 1);
  for (let i = 1; i < prices.length; i++) r[i - 1] = Math.log(prices[i] / prices[i - 1]);
  return r;
}

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / Math.max(1, xs.length);
}

function variance(xs: number[]): number {
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / Math.max(1, xs.length - 1);
}

function covariance(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / Math.max(1, xs.length - 1);
}

function covarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(returns[i], returns[j]);
      m[i][j] = c;
      m[j][i] = c;
    }
  }
  return m;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function quadraticForm(w: number[], m: number[][]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    let row = 0;
    for (let j = 0; j < w.length; j++) row += m[i][j] * w[j];
    s += w[i] * row;
  }
  return s;
}

function dirichletSample(n: number, rng: () => number): number[] {
  const w = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const u = rng();
    const e = -Math.log(u > 0 ? u : 1e-12);
    w[i] = e;
    sum += e;
  }
  for (let i = 0; i < n; i++) w[i] /= sum;
  return w;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
