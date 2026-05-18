import type { AggregateRules } from "./strategyTypes";

/**
 * Per-asset weight caps used as the *Pifagor Fund* policy floor on the
 * Recommended Allocation. Editable in the UI (RiskCapsTab).
 *
 * min/max are fractions, 0..1. Missing keys = unconstrained on that side.
 */
export const DEFAULT_RISK_CAPS: Record<
  string,
  { min?: number; max?: number }
> = {
  BTCUSDT: { min: 0.45, max: 0.65 },
  ETHUSDT: { min: 0.15, max: 0.25 },
  SOLUSDT: { max: 0.12 },
  BNBUSDT: { max: 0.08 },
  HYPEUSDT: { max: 0.05 },
  TONUSDT: { max: 0.04 },
  OKBUSDT: { max: 0.03 },
};

/** Aggregate-level invariants that take priority over per-asset caps. */
export const DEFAULT_AGGREGATE_RULES: AggregateRules = {
  coreMin: 0.65,
  smallAltsMax: 0.08,
};

/**
 * Symbols treated as "majors" — exempt from the small-alts cap.
 * Everything else from the user's basket is "small alt".
 */
export const MAJOR_SYMBOLS = new Set([
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "HYPEUSDT",
  "TONUSDT",
  "OKBUSDT",
]);

const CORE_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT"]);

export interface ApplyRiskCapsResult {
  weights: number[];
  violations: string[];
}

/**
 * Project a raw weight vector onto the policy box and aggregate rules.
 *
 * Pipeline:
 *   1. Clip each w_i to [min_i, max_i] (defaults: 0..1).
 *   2. Renormalize so the vector sums to 1.
 *   3. If BTC+ETH < coreMin, shift mass from non-core assets into BTC/ETH
 *      (pro rata of their current core split).
 *   4. If small-alts > smallAltsMax, shave the overshoot off small-alts
 *      pro rata and add it to BTC.
 *   5. Re-clip & renormalize once more (idempotent in well-posed cases).
 *
 * Each transformation that fires emits a string in `violations` so the UI
 * can show *why* the user's caps were tightened.
 *
 * Note: this is a heuristic projection, not a quadratic program. It is
 * intentionally biased toward BTC when rules conflict — the fund prefers
 * adding core conservatism over leaving small alts at policy-breaching size.
 */
export function applyRiskCaps(
  weights: number[],
  symbols: string[],
  caps: Record<string, { min?: number; max?: number }> = DEFAULT_RISK_CAPS,
  aggregate: AggregateRules = DEFAULT_AGGREGATE_RULES
): ApplyRiskCapsResult {
  if (weights.length !== symbols.length) {
    throw new Error("riskCaps: weights length mismatch with symbols.");
  }
  const n = weights.length;
  const violations: string[] = [];
  let w = weights.slice();

  // 1. Per-asset clip
  for (let i = 0; i < n; i++) {
    const cap = caps[symbols[i]];
    const lo = cap?.min ?? 0;
    const hi = cap?.max ?? 1;
    if (w[i] < lo) {
      violations.push(`${symbols[i]} below floor (${pct(w[i])} < ${pct(lo)})`);
      w[i] = lo;
    } else if (w[i] > hi) {
      violations.push(`${symbols[i]} above cap (${pct(w[i])} > ${pct(hi)})`);
      w[i] = hi;
    }
  }
  w = renormalize(w);

  // 2. Core floor (BTC + ETH)
  const coreSum = sumWhere(w, symbols, (s) => CORE_SYMBOLS.has(s));
  if (coreSum > 0 && coreSum < aggregate.coreMin) {
    const deficit = aggregate.coreMin - coreSum;
    violations.push(
      `BTC+ETH below floor (${pct(coreSum)} < ${pct(aggregate.coreMin)})`
    );
    // Pro-rata current BTC vs ETH split — if both are zero, hand all to BTC.
    const btcIdx = symbols.indexOf("BTCUSDT");
    const ethIdx = symbols.indexOf("ETHUSDT");
    const totalCore = coreSum > 0 ? coreSum : 1;
    const btcShare = btcIdx >= 0 ? w[btcIdx] / totalCore : 0;
    const ethShare = ethIdx >= 0 ? w[ethIdx] / totalCore : 0;
    const split =
      btcIdx >= 0 && ethIdx >= 0
        ? { btc: btcShare, eth: ethShare }
        : btcIdx >= 0
          ? { btc: 1, eth: 0 }
          : { btc: 0, eth: 1 };

    // Shave deficit pro rata from non-core assets (those above their floor).
    const nonCoreIdx = symbols
      .map((s, i) => (CORE_SYMBOLS.has(s) ? -1 : i))
      .filter((i) => i >= 0);
    const nonCoreSum = nonCoreIdx.reduce((a, i) => a + w[i], 0);
    if (nonCoreSum > 0) {
      const shaveFactor = Math.min(1, deficit / nonCoreSum);
      for (const i of nonCoreIdx) {
        const cap = caps[symbols[i]];
        const floor = cap?.min ?? 0;
        const shave = Math.min(w[i] - floor, w[i] * shaveFactor);
        w[i] -= Math.max(0, shave);
      }
      if (btcIdx >= 0) w[btcIdx] += deficit * split.btc;
      if (ethIdx >= 0) w[ethIdx] += deficit * split.eth;
    }
    w = renormalize(w);
  }

  // 3. Small-alts cap
  const smallAltsIdx = symbols
    .map((s, i) => (!MAJOR_SYMBOLS.has(s) ? i : -1))
    .filter((i) => i >= 0);
  if (smallAltsIdx.length > 0) {
    const smallAltsSum = smallAltsIdx.reduce((a, i) => a + w[i], 0);
    if (smallAltsSum > aggregate.smallAltsMax + 1e-9) {
      violations.push(
        `Small alts above cap (${pct(smallAltsSum)} > ${pct(aggregate.smallAltsMax)})`
      );
      const overshoot = smallAltsSum - aggregate.smallAltsMax;
      const scale = aggregate.smallAltsMax / smallAltsSum;
      for (const i of smallAltsIdx) w[i] *= scale;
      const btcIdx = symbols.indexOf("BTCUSDT");
      if (btcIdx >= 0) w[btcIdx] += overshoot;
      w = renormalize(w);
    }
  }

  // 4. Final re-clip (handles rare cases where core injection pushed BTC over its cap).
  for (let i = 0; i < n; i++) {
    const cap = caps[symbols[i]];
    const hi = cap?.max ?? 1;
    if (w[i] > hi + 1e-9) w[i] = hi;
  }
  w = renormalize(w);

  return { weights: w, violations };
}

function renormalize(w: number[]): number[] {
  const sum = w.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return w.map(() => 1 / Math.max(1, w.length));
  return w.map((x) => Math.max(0, x) / sum);
}

function sumWhere(
  w: number[],
  symbols: string[],
  pred: (s: string) => boolean
): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) if (pred(symbols[i])) s += w[i];
  return s;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
