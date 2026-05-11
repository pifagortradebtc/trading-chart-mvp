/**
 * Заглушки тяжёлых движков — UI и архитектура готовы к подключению Web Workers.
 */

import type { BacktestSettings } from "@/lib/backtest/types";
import type { Candle } from "@/types/candle";
import type {
  BenchmarkSeries,
  MonteCarloSummary,
  OptimizationRow,
  StressScenarioResult,
  WalkForwardPeriod,
} from "./types";

export type {
  OptimizationGridSpec,
  OptimizationRow,
  WalkForwardPeriod,
  MonteCarloSummary,
  StressScenarioResult,
  BenchmarkSeries,
} from "./types";

/** Оптимизация сетки параметров — заглушка (полная реализация: optimizationEngine + worker). */
export function runOptimizationStub(
  _candles: Candle[],
  _base: BacktestSettings,
): { rows: OptimizationRow[]; warning: string } {
  void _candles;
  void _base;
  return {
    rows: [],
    warning:
      "Optimization Lab: подключите сеточный перебор в worker (runOptimization). Сейчас заглушка для сохранения UI.",
  };
}

export function runWalkForwardStub(
  _candles: Candle[],
): { periods: WalkForwardPeriod[]; warning: string } {
  void _candles;
  return {
    periods: [],
    warning:
      "Walk-forward: требуется разбиение выборки и повторный бэктест по окнам. Заглушка.",
  };
}

export function runMonteCarloStub(tradesPnL: number[]): MonteCarloSummary {
  void tradesPnL;
  return {
    simulations: 0,
    medianEquity: 0,
    p5Equity: 0,
    p95Equity: 0,
    probLoss: 0,
    status: "stub",
    note: "Используйте runMonteCarloTradeOrderShuffle из monteCarloTrades.ts на клиенте.",
  };
}

export function runStressSuiteStub(): StressScenarioResult[] {
  return [
    {
      id: "fees2x",
      label: "Комиссия ×2",
      survived: true,
      finalEquity: 0,
      maxDrawdownPct: 0,
      liquidated: false,
      riskScore: 0,
    },
  ];
}

/** Buy & Hold benchmark — упрощённо по close (спот, без комиссий). */
export function computeBenchmarksStub(
  candles: Candle[],
  startingCash: number,
): BenchmarkSeries[] {
  if (!candles.length) return [];
  const first = candles[0]!.close;
  let peak = startingCash;
  const equity = candles.map((c) => {
    const eq = startingCash * (c.close / first);
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    return {
      time: c.time * 1000,
      equity: eq,
      drawdownPct: dd,
      peakEquity: peak,
    };
  });
  const finalEq = equity[equity.length - 1]!.equity;
  const ret = ((finalEq - startingCash) / startingCash) * 100;
  let maxDd = 0;
  peak = startingCash;
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return [
    {
      id: "bh",
      label: "Buy & Hold (spot)",
      equity,
      totalReturnPct: ret,
      maxDrawdownPct: maxDd,
    },
  ];
}
