import type { PriceSeries } from "./types";

/**
 * Liquidity assessment for the active basket.
 *
 * Source data: Binance Spot daily candles' base-asset volume × close price
 * gives an estimate of *daily USD volume*. It's slightly biased (volume × close
 * uses end-of-day close, while actual trades hit different intraday prices),
 * but the error is well under one tier-band, so liquidity classification
 * remains correct.
 *
 * Tier thresholds reflect Pifagor Fund operating reality — a $5M ticket
 * needs $100M+ daily volume to be invisible (5% of ADV), a $50M ticket
 * needs $1B+. Below $10M/day, retail-only execution is infeasible.
 *
 *   blue   ≥ $1B / day    — institutional-grade depth, any ticket
 *   green  $100M–$1B/day  — fund-tier, ticket up to $5M with care
 *   yellow $10M–$100M/day — retail-large, ticket ≤ $500k
 *   red    < $10M / day   — pivot to OTC or skip
 *
 * "Max executable position" is the largest single ticket (in USD) the fund
 * can take in one day without exceeding `MAX_ADV_FRACTION` (5%) of average
 * daily volume — a conservative market-impact heuristic. The number is
 * advisory, not enforced; the operator decides whether to split execution.
 */

export type LiquidityTier = "blue" | "green" | "yellow" | "red" | "no-data";

const LOOKBACK_DAYS = 30;
const MAX_ADV_FRACTION = 0.05;

const TIER_THRESHOLDS = [
  { tier: "blue", minUsd: 1_000_000_000 },
  { tier: "green", minUsd: 100_000_000 },
  { tier: "yellow", minUsd: 10_000_000 },
  { tier: "red", minUsd: 0 },
] as const;

export interface LiquidityAssessment {
  symbol: string;
  /** 30-day mean of daily USD volume (close × base-volume per bar, averaged). */
  avgDailyUsdVolume: number;
  /** Most recent day's USD volume — surfaces sudden dry-ups. */
  latestDailyUsdVolume: number;
  tier: LiquidityTier;
  /** Max single ticket the fund could execute today at MAX_ADV_FRACTION of ADV. */
  maxExecutableUsd: number;
  /** Human-readable note used in tooltips and UI rows. */
  note: string;
}

export function assessLiquidity(
  priceSeries: PriceSeries[],
  lookback: number = LOOKBACK_DAYS
): LiquidityAssessment[] {
  return priceSeries.map((p) => {
    if (!p.volumes || p.volumes.length === 0 || p.prices.length === 0) {
      return makeNoData(p.symbol, "Volume не получен — Binance не вернул объём.");
    }
    const n = p.prices.length;
    const span = Math.min(lookback, n);
    let sum = 0;
    let samples = 0;
    for (let i = n - span; i < n; i++) {
      const close = p.prices[i];
      const vol = p.volumes[i];
      if (close > 0 && Number.isFinite(vol) && vol >= 0) {
        sum += close * vol;
        samples++;
      }
    }
    if (samples === 0) {
      return makeNoData(p.symbol, "Volume есть, но все значения 0 — рынок мог быть остановлен.");
    }
    const avgDailyUsd = sum / samples;
    const latestUsd = p.prices[n - 1] * (p.volumes[n - 1] ?? 0);
    const tier = classifyTier(avgDailyUsd);
    const maxExec = avgDailyUsd * MAX_ADV_FRACTION;
    return {
      symbol: p.symbol,
      avgDailyUsdVolume: avgDailyUsd,
      latestDailyUsdVolume: latestUsd,
      tier,
      maxExecutableUsd: maxExec,
      note: tierNote(tier, maxExec),
    };
  });
}

function classifyTier(usd: number): LiquidityTier {
  for (const t of TIER_THRESHOLDS) {
    if (usd >= t.minUsd) return t.tier;
  }
  return "red";
}

function tierNote(tier: LiquidityTier, maxExec: number): string {
  const human = formatUsdShort(maxExec);
  switch (tier) {
    case "blue":
      return `Институциональная глубина — single-day ticket до ${human} незаметен.`;
    case "green":
      return `Fund-tier ликвидность — ticket до ${human} исполним за день при дисциплинированных лимитках.`;
    case "yellow":
      return `Retail-large глубина — ticket до ${human}; крупнее → разбить на 2-5 дней.`;
    case "red":
      return `Тонкий рынок — даже ${human} даст рыночный импакт. Рассмотри OTC или сократи позицию.`;
    default:
      return "Volume недоступен — нельзя оценить лимит исполнения.";
  }
}

function makeNoData(symbol: string, note: string): LiquidityAssessment {
  return {
    symbol,
    avgDailyUsdVolume: 0,
    latestDailyUsdVolume: 0,
    tier: "no-data",
    maxExecutableUsd: 0,
    note,
  };
}

export function formatUsdShort(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

/**
 * Aggregate basket-level liquidity score: weighted-by-portfolio-weight average
 * of per-asset USD volume, with red/yellow tier penalty. Returns 0..100.
 */
export function basketLiquidityScore(
  weights: number[],
  assessments: LiquidityAssessment[]
): number {
  let score = 100;
  let totalRedYellow = 0;
  for (let i = 0; i < weights.length; i++) {
    const a = assessments[i];
    if (!a) continue;
    if (a.tier === "no-data" || a.tier === "red") totalRedYellow += weights[i];
    else if (a.tier === "yellow") totalRedYellow += weights[i] * 0.5;
  }
  // Each 1% in red/yellow shaves ~1.5pp off the score, capped at 0.
  score -= totalRedYellow * 150;
  return Math.max(0, Math.min(100, Math.round(score)));
}
