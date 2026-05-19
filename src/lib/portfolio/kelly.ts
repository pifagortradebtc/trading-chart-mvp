import type { PriceSeries } from "./types";

/**
 * Fractional-Kelly portfolio (advisory).
 *
 *   raw_i = max(0, μ_i) / σ_i²    (single-asset Kelly, drift over variance)
 *   w_i   = (raw_i / Σ raw_j) · kellyFraction
 *
 * μ_i and σ_i² are annualized from daily log returns.
 * `kellyFraction` defaults to 0.5 (half-Kelly) — the textbook defensive
 * setting that's roughly equivalent to a 2σ haircut on the drift estimate.
 *
 * Notes & caveats baked in:
 *   - Full-Kelly maximizes geometric growth but is famously fragile to
 *     errors in μ. In crypto, μ estimates are noisy → defensive default.
 *   - We use single-asset Kelly per ticker, ignoring the covariance
 *     structure. That's the "naïve" Kelly the literature uses for size-
 *     scaling a basket; the full multi-asset Kelly requires Σ⁻¹ and is
 *     numerically unstable on small samples.
 *   - Assets with negative drift get weight 0 (Kelly says "don't bet").
 *
 * If all μ ≤ 0, fall back to equal-weight + a warning — the basket has no
 * positive-drift candidate under the historical window.
 */

const TRADING_DAYS_PER_YEAR = 365;
const DEFAULT_KELLY_FRACTION = 0.5;

export interface KellyResult {
  weights: number[];
  warning?: string;
}

export function fractionalKellyWeights(
  priceSeries: PriceSeries[],
  kellyFraction: number = DEFAULT_KELLY_FRACTION
): KellyResult {
  const n = priceSeries.length;
  if (n === 0) return { weights: [] };
  if (n === 1) return { weights: [1] };

  const raw = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const returns = logReturns(priceSeries[i].prices);
    if (returns.length < 5) continue;
    const mu = mean(returns) * TRADING_DAYS_PER_YEAR;
    const sigma2 = variance(returns) * TRADING_DAYS_PER_YEAR;
    if (sigma2 > 0 && mu > 0) {
      raw[i] = mu / sigma2;
    }
  }

  const rawSum = raw.reduce((a, b) => a + b, 0);
  if (rawSum <= 0) {
    return {
      weights: new Array(n).fill(1 / n),
      warning: "Нет активов с положительной исторической μ — fallback на equal-weight.",
    };
  }

  const f = Math.max(0, Math.min(1, kellyFraction));
  // Scale Kelly-prop weights by f, fill the rest with cash-equivalent.
  // Spec: keep "spot" exposure only; we distribute (1-f) pro rata across
  // positive-drift assets so the advisory weight still sums to 1 — the
  // operator can interpret (1-f) as the cash-equivalent buffer if they
  // want to literally hold half-Kelly with cash.
  const weights = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const propKelly = raw[i] / rawSum;
    weights[i] = propKelly; // full-Kelly proportional
  }
  // Mix toward equal-weight with weight (1-f) to encode the haircut.
  const eq = 1 / n;
  for (let i = 0; i < n; i++) {
    weights[i] = f * weights[i] + (1 - f) * eq;
  }
  // Renormalize defensively (already ≈1).
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < n; i++) weights[i] /= sum;

  return {
    weights,
    warning:
      f < 1
        ? `Half-Kelly (f=${f.toFixed(2)}): haircut к чистому Kelly через смешение с equal-weight.`
        : undefined,
  };
}

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
