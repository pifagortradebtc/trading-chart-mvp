/**
 * Расширенные метрики исследования стратегии (quant-style).
 * Использует equity curve и сделки; без изменения движка бэктеста.
 */

import type { Candle } from "@/types/candle";
import type { EquityPoint, TradeRecord } from "@/lib/backtest/types";
import type { MetricsSummary } from "@/lib/backtest/metrics";

export interface AdvancedResearchMetrics {
  finalEquity: number;
  lowestEquity: number;
  equityPeak: number;
  /** CAGR по эквити первый→последний бар */
  cagrPct: number | null;
  /** Sharpe по дневным доходностям эквити (упрощённо) */
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  recoveryFactor: number | null;
  expectancyPerTrade: number;
  payoffRatio: number | null;
  lossRatePct: number;
  ulcerIndex: number | null;
  riskRewardApprox: number | null;
  totalFeesUsdt: number;
  yearsInSample: number;
}

function bucketEquityByDay(points: EquityPoint[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const p of points) {
    const d = new Date(p.time);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    byDay.set(key, p.equity);
  }
  return byDay;
}

function dailyReturnsFromEquity(points: EquityPoint[]): number[] {
  const byDay = bucketEquityByDay(points);
  const keys = Array.from(byDay.keys()).sort();
  const rets: number[] = [];
  for (let i = 1; i < keys.length; i++) {
    const prev = byDay.get(keys[i - 1]!)!;
    const cur = byDay.get(keys[i]!)!;
    if (prev > 0 && Number.isFinite(cur)) {
      rets.push((cur - prev) / prev);
    }
  }
  return rets;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdSample(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function downsideStd(arr: number[], target = 0): number {
  const downs = arr.filter((x) => x < target);
  if (downs.length < 2) return 0;
  const m = mean(downs);
  return Math.sqrt(downs.reduce((s, x) => s + (x - m) ** 2, 0) / (downs.length - 1));
}

/** Ulcer index — упрощённо по просадке эквити от пика */
function ulcerFromEquity(points: EquityPoint[]): number | null {
  if (points.length < 2) return null;
  let peak = points[0]!.equity;
  const ddPctSq: number[] = [];
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      ddPctSq.push(dd * dd);
    }
  }
  if (!ddPctSq.length) return null;
  return Math.sqrt(mean(ddPctSq));
}

export function computeAdvancedResearchMetrics(
  base: MetricsSummary,
  trades: TradeRecord[],
  equity: EquityPoint[],
  candles: Candle[],
  startingDeposit: number,
): AdvancedResearchMetrics {
  const totalFeesUsdt = trades.reduce((s, t) => s + t.feesUsdt, 0);

  let finalEquity = startingDeposit + base.totalPnlUsdt;
  let lowestEquity = startingDeposit;
  let equityPeak = startingDeposit;
  for (const p of equity) {
    if (p.equity < lowestEquity) lowestEquity = p.equity;
    if (p.equity > equityPeak) equityPeak = p.equity;
    finalEquity = p.equity;
  }

  const t0 = candles.length ? candles[0]!.time * 1000 : 0;
  const t1 = candles.length ? candles[candles.length - 1]!.time * 1000 : 0;
  const yearsInSample =
    t1 > t0 ? (t1 - t0) / (365.25 * 24 * 3600 * 1000) : 0;

  let cagrPct: number | null = null;
  if (yearsInSample > 0 && startingDeposit > 0 && finalEquity > 0) {
    cagrPct = ((finalEquity / startingDeposit) ** (1 / yearsInSample) - 1) * 100;
  }

  const daily = dailyReturnsFromEquity(equity);
  const drMean = mean(daily);
  const drStd = stdSample(daily);
  let sharpeRatio: number | null = null;
  if (drStd > 1e-12 && daily.length > 5) {
    sharpeRatio = (Math.sqrt(252) * drMean) / drStd;
  }

  const dDown = downsideStd(daily, 0);
  let sortinoRatio: number | null = null;
  if (dDown > 1e-12 && daily.length > 5) {
    sortinoRatio = (Math.sqrt(252) * drMean) / dDown;
  }

  let calmarRatio: number | null = null;
  if (base.maxEquityDrawdownPct > 1e-6 && cagrPct != null) {
    calmarRatio = cagrPct / base.maxEquityDrawdownPct;
  }

  const maxDdUsd = (equityPeak * base.maxEquityDrawdownPct) / 100;
  let recoveryFactor: number | null = null;
  if (maxDdUsd > 1e-6) {
    recoveryFactor = base.totalPnlUsdt / maxDdUsd;
  }

  const wins = trades.filter((t) => t.pnlUsdt > 0);
  const losses = trades.filter((t) => t.pnlUsdt < 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlUsdt, 0) / wins.length : 0;
  const avgLossAbs = losses.length
    ? Math.abs(losses.reduce((s, t) => s + t.pnlUsdt, 0) / losses.length)
    : 0;
  let payoffRatio: number | null = null;
  if (avgLossAbs > 1e-9) payoffRatio = avgWin / avgLossAbs;

  const expectancyPerTrade = trades.length ? base.totalPnlUsdt / trades.length : 0;

  const lossRatePct = trades.length ? (losses.length / trades.length) * 100 : 0;

  let riskRewardApprox: number | null = payoffRatio;
  if (avgLossAbs > 1e-9 && base.avgLossUsdt !== 0) {
    riskRewardApprox = Math.abs(base.avgWinUsdt / base.avgLossUsdt);
  }

  const ulcerIndex = ulcerFromEquity(equity);

  return {
    finalEquity,
    lowestEquity,
    equityPeak,
    cagrPct,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    recoveryFactor,
    expectancyPerTrade,
    payoffRatio,
    lossRatePct,
    ulcerIndex,
    riskRewardApprox,
    totalFeesUsdt,
    yearsInSample,
  };
}
