import type {
  AssetBounds,
  AssetStats,
  FrontierPoint,
  MPTResult,
  Portfolio,
  PriceSeries,
  RunMPTOptions,
} from "./types";

const TRADING_DAYS_PER_YEAR = 365;

/**
 * Aborts the simulation if more than this fraction of attempts are rejected
 * by per-asset bounds. Surfaces a clear error to the user instead of running
 * forever when constraints are infeasible.
 */
const MAX_REJECTION_RATIO = 50;

export function runMPT(opts: RunMPTOptions): MPTResult {
  const { priceSeries, simulations, riskFreeRate } = opts;
  const seed = opts.seed ?? 42;
  const rng = mulberry32(seed);

  if (priceSeries.length < 2) {
    throw new Error("Нужно минимум два актива для построения портфеля.");
  }

  const n = priceSeries.length;
  const bounds = normalizeBounds(opts.bounds, n);
  validateBoundsFeasibility(bounds);

  const returns: number[][] = priceSeries.map((p) => logReturns(p.prices));
  const T = returns[0].length;

  for (const r of returns) {
    if (r.length !== T) {
      throw new Error(
        "Ряды доходностей имеют разную длину. Проверьте выравнивание цен по датам."
      );
    }
  }
  if (T < 30) {
    throw new Error("Недостаточно данных: нужно как минимум 30 дней истории.");
  }

  const muDaily = returns.map(mean);
  const mu = muDaily.map((m) => m * TRADING_DAYS_PER_YEAR);
  const sigmaDaily = covarianceMatrix(returns);
  const sigma = sigmaDaily.map((row) =>
    row.map((c) => c * TRADING_DAYS_PER_YEAR)
  );

  const assetStats: AssetStats[] = priceSeries.map((p, i) => {
    const vol = Math.sqrt(sigma[i][i]);
    return {
      symbol: p.symbol,
      meanReturn: mu[i],
      volatility: vol,
      sharpe: vol > 0 ? (mu[i] - riskFreeRate) / vol : NaN,
    };
  });

  const portfolios: Portfolio[] = new Array(simulations);
  const rejectionCap = simulations * MAX_REJECTION_RATIO;
  let rejected = 0;
  let i = 0;
  while (i < simulations) {
    const w = generateWeights(n, bounds, rng);
    if (!w) {
      rejected++;
      if (rejected > rejectionCap) {
        throw new Error(
          "Ограничения по долям активов слишком жёсткие. Расширьте диапазоны min/max."
        );
      }
      continue;
    }
    const ret = dot(w, mu);
    const variance = quadraticForm(w, sigma);
    const vol = Math.sqrt(Math.max(variance, 0));
    const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : NaN;
    portfolios[i] = {
      weights: w,
      return: ret,
      volatility: vol,
      sharpe,
      sortino: NaN,
    };
    i++;
  }

  const frontier = buildEfficientFrontier(portfolios);

  const sortinoCache = new Map<Portfolio, number>();
  const ensureSortino = (p: Portfolio): number => {
    const cached = sortinoCache.get(p);
    if (cached !== undefined) return cached;
    const value = sortinoRatio(p.weights, returns, riskFreeRate);
    sortinoCache.set(p, value);
    p.sortino = value;
    return value;
  };

  for (const fp of frontier) ensureSortino(fp);

  let minVol = portfolios[0];
  let maxSharpe = portfolios[0];
  for (const p of portfolios) {
    if (p.volatility < minVol.volatility) minVol = p;
    if (Number.isFinite(p.sharpe) && p.sharpe > maxSharpe.sharpe) maxSharpe = p;
  }

  const topBySharpe = [...portfolios]
    .filter((p) => Number.isFinite(p.sharpe))
    .sort((a, b) => b.sharpe - a.sharpe)
    .slice(0, Math.min(2000, portfolios.length));

  let maxSortino = topBySharpe[0] ?? portfolios[0];
  ensureSortino(maxSortino);
  for (let k = 1; k < topBySharpe.length; k++) {
    const candidate = topBySharpe[k];
    ensureSortino(candidate);
    if (
      Number.isFinite(candidate.sortino) &&
      candidate.sortino > maxSortino.sortino
    ) {
      maxSortino = candidate;
    }
  }

  ensureSortino(minVol);
  ensureSortino(maxSharpe);

  const rejectionRate = rejected / (rejected + simulations);

  return {
    symbols: priceSeries.map((p) => p.symbol),
    portfolios,
    frontier,
    minVol,
    maxSharpe,
    maxSortino,
    assetStats,
    windowDays: T,
    riskFreeRate,
    rejectionRate,
  };
}

/**
 * Computes the four core metrics for a single fixed-weight portfolio against
 * the supplied price history. Used for "custom" portfolios in the compare
 * panel where the user dials weights manually.
 */
export function computeMetrics(
  weights: number[],
  priceSeries: PriceSeries[],
  riskFreeRate: number
): Portfolio {
  if (weights.length !== priceSeries.length) {
    throw new Error("Размер весов не совпадает с числом активов.");
  }
  const returns = priceSeries.map((p) => logReturns(p.prices));
  const muDaily = returns.map(mean);
  const mu = muDaily.map((m) => m * TRADING_DAYS_PER_YEAR);
  const sigmaDaily = covarianceMatrix(returns);
  const sigma = sigmaDaily.map((row) =>
    row.map((c) => c * TRADING_DAYS_PER_YEAR)
  );
  const ret = dot(weights, mu);
  const variance = quadraticForm(weights, sigma);
  const vol = Math.sqrt(Math.max(variance, 0));
  const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : NaN;
  const sortino = sortinoRatio(weights, returns, riskFreeRate);
  return { weights: [...weights], return: ret, volatility: vol, sharpe, sortino };
}

function normalizeBounds(
  bounds: AssetBounds[] | undefined,
  n: number
): AssetBounds[] {
  if (!bounds) {
    return Array.from({ length: n }, () => ({ min: 0, max: 1 }));
  }
  if (bounds.length !== n) {
    throw new Error("Длина bounds не совпадает с числом активов.");
  }
  return bounds.map((b) => ({
    min: clamp(b.min, 0, 1),
    max: clamp(b.max, 0, 1),
  }));
}

function validateBoundsFeasibility(bounds: AssetBounds[]): void {
  const sumMin = bounds.reduce((a, b) => a + b.min, 0);
  const sumMax = bounds.reduce((a, b) => a + b.max, 0);
  if (sumMin > 1 + 1e-9) {
    throw new Error(
      "Сумма минимальных долей больше 100% — задача невыполнима."
    );
  }
  if (sumMax < 1 - 1e-9) {
    throw new Error(
      "Сумма максимальных долей меньше 100% — задача невыполнима."
    );
  }
  for (const b of bounds) {
    if (b.min > b.max) {
      throw new Error("min доля больше max — проверьте слайдеры ограничений.");
    }
  }
}

/**
 * Shifted-Dirichlet sampler:
 *   1) reserve `min_i` for each asset
 *   2) distribute the residual mass (1 − Σ min_i) over assets using
 *      Dirichlet(1,…,1)
 *   3) reject if any `w_i > max_i`
 *
 * This produces near-uniform coverage of the feasible region with a much
 * higher acceptance rate than naive rejection sampling on the open simplex.
 */
function generateWeights(
  n: number,
  bounds: AssetBounds[],
  rng: () => number
): number[] | null {
  const residual = 1 - bounds.reduce((a, b) => a + b.min, 0);
  if (residual < 0) return null;
  const extra = randomWeights(n, rng);
  const w = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    w[i] = bounds[i].min + extra[i] * residual;
    if (w[i] > bounds[i].max + 1e-9) return null;
  }
  return w;
}

function logReturns(prices: number[]): number[] {
  const r: number[] = new Array(prices.length - 1);
  for (let i = 1; i < prices.length; i++) {
    r[i - 1] = Math.log(prices[i] / prices[i - 1]);
  }
  return r;
}

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function covariance(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1);
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

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function randomWeights(n: number, rng: () => number): number[] {
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

function sortinoRatio(
  w: number[],
  assetReturns: number[][],
  riskFreeRate: number
): number {
  const n = w.length;
  const T = assetReturns[0].length;
  let sumRet = 0;
  let sumDownSq = 0;
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let i = 0; i < n; i++) r += w[i] * assetReturns[i][t];
    sumRet += r;
    if (r < 0) sumDownSq += r * r;
  }
  const annualReturn = (sumRet / T) * TRADING_DAYS_PER_YEAR;
  const downsideDev = Math.sqrt(sumDownSq / T) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (downsideDev === 0) return NaN;
  return (annualReturn - riskFreeRate) / downsideDev;
}

function buildEfficientFrontier(portfolios: Portfolio[]): FrontierPoint[] {
  if (portfolios.length === 0) return [];
  const BINS = 240;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of portfolios) {
    if (p.volatility < minV) minV = p.volatility;
    if (p.volatility > maxV) maxV = p.volatility;
  }
  const range = maxV - minV || 1;
  const binSize = range / BINS;
  const bestPerBin: (Portfolio | null)[] = new Array(BINS).fill(null);

  for (const p of portfolios) {
    let idx = Math.floor((p.volatility - minV) / binSize);
    if (idx < 0) idx = 0;
    if (idx >= BINS) idx = BINS - 1;
    const current = bestPerBin[idx];
    if (!current || p.return > current.return) bestPerBin[idx] = p;
  }

  const top = bestPerBin
    .filter((p): p is Portfolio => p !== null)
    .sort((a, b) => a.volatility - b.volatility);

  const frontier: FrontierPoint[] = [];
  let bestReturn = -Infinity;
  for (const p of top) {
    if (p.return > bestReturn) {
      frontier.push({ ...p });
      bestReturn = p.return;
    }
  }
  return frontier;
}
