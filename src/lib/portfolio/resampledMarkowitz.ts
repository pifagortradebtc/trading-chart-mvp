import type { PriceSeries } from "./types";

/**
 * Resampled Markowitz (Michaud, 1998) — robust MVO via bootstrap averaging.
 *
 *   for r in 1..N_RESAMPLES:
 *     1. Resample daily log-returns with replacement (n=T) — synthetic history.
 *     2. Recompute μ̂_r and Σ̂_r from the resample.
 *     3. Find max-Sharpe weights on (μ̂_r, Σ̂_r) via a Dirichlet sampler.
 *   average all w_r → resampled-frontier weights, renormalize.
 *
 * Why: classical MVO is famous for "estimation-error maximization" — small
 * shifts in μ produce wildly different weights. Averaging weights across many
 * synthetic histories smooths that out without needing a QP solver. Trades
 * compute for robustness.
 *
 * Compute budget: N_RESAMPLES (24) × N_SAMPLES_PER (800) = 19.2k Dirichlet
 * trials per call. On a 7-asset basket and a 1095-day window this runs in
 * ~300-500ms in the web worker.
 *
 * Deterministic: seeded from RESAMPLE_SEED → same inputs always give the same
 * weights. Important for the Recommended Tab UX, where users expect stable
 * weights on identical configs.
 */

const TRADING_DAYS_PER_YEAR = 365;
const N_RESAMPLES = 24;
const N_SAMPLES_PER = 800;
const RESAMPLE_SEED = 0xa11ce;

export interface ResampledResult {
  weights: number[];
  warning?: string;
}

export function resampledMarkowitzWeights(
  priceSeries: PriceSeries[],
  riskFreeRate: number
): ResampledResult {
  const n = priceSeries.length;
  if (n === 0) return { weights: [] };
  if (n === 1) return { weights: [1] };

  const returns: number[][] = priceSeries.map((p) => logReturns(p.prices));
  // Align to shortest series so bootstrap indices map to all assets simultaneously.
  let T = Infinity;
  for (const r of returns) T = Math.min(T, r.length);
  if (!Number.isFinite(T) || T < 30) {
    return {
      weights: equal(n),
      warning: `Слишком короткая история (${T}d) — нужно ≥30d. Fallback equal-weight.`,
    };
  }
  for (let i = 0; i < n; i++) returns[i] = returns[i].slice(0, T);

  const rng = mulberry32(RESAMPLE_SEED);
  const accumulator = new Array<number>(n).fill(0);
  const indices = new Array<number>(T);

  for (let r = 0; r < N_RESAMPLES; r++) {
    // Bootstrap day indices (with replacement)
    for (let k = 0; k < T; k++) indices[k] = Math.floor(rng() * T);

    // Build resampled returns matrix on the fly when computing μ and Σ
    const muHat = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < T; k++) s += returns[i][indices[k]];
      muHat[i] = (s / T) * TRADING_DAYS_PER_YEAR;
    }

    const sigmaHat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let s = 0;
        for (let k = 0; k < T; k++) {
          s += (returns[i][indices[k]] - muHat[i] / TRADING_DAYS_PER_YEAR) *
            (returns[j][indices[k]] - muHat[j] / TRADING_DAYS_PER_YEAR);
        }
        const c = (s / Math.max(1, T - 1)) * TRADING_DAYS_PER_YEAR;
        sigmaHat[i][j] = c;
        sigmaHat[j][i] = c;
      }
    }

    // Mini-MC max-Sharpe inside this resample.
    let bestSharpe = -Infinity;
    let bestW: number[] | null = null;
    for (let s = 0; s < N_SAMPLES_PER; s++) {
      const w = dirichlet(n, rng);
      const ret = dot(w, muHat);
      const vol = Math.sqrt(Math.max(0, quadForm(w, sigmaHat)));
      const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : -Infinity;
      if (sharpe > bestSharpe) {
        bestSharpe = sharpe;
        bestW = w.slice();
      }
    }
    if (bestW) {
      for (let i = 0; i < n; i++) accumulator[i] += bestW[i];
    }
  }

  // Average and renormalize.
  let sum = 0;
  for (let i = 0; i < n; i++) sum += accumulator[i];
  if (sum <= 0) {
    return {
      weights: equal(n),
      warning: "Resample sampler не сошёлся — fallback equal-weight.",
    };
  }
  const weights = accumulator.map((x) => x / sum);
  return { weights };
}

// ───── helpers ──────────────────────────────────────────────────────────────

function equal(n: number): number[] {
  if (n <= 0) return [];
  return new Array(n).fill(1 / n);
}

function logReturns(prices: number[]): number[] {
  const r = new Array<number>(prices.length - 1);
  for (let i = 1; i < prices.length; i++) r[i - 1] = Math.log(prices[i] / prices[i - 1]);
  return r;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function quadForm(w: number[], m: number[][]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    let row = 0;
    for (let j = 0; j < w.length; j++) row += m[i][j] * w[j];
    s += w[i] * row;
  }
  return s;
}

function dirichlet(n: number, rng: () => number): number[] {
  const w = new Array<number>(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const u = rng();
    const e = -Math.log(u > 0 ? u : 1e-12);
    w[i] = e;
    s += e;
  }
  for (let i = 0; i < n; i++) w[i] /= s;
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
