/**
 * Общие типы для тяжёлых движков (optimization, Monte Carlo, walk-forward, stress, benchmark).
 * Реализации могут переноситься в Web Workers без смены контрактов.
 */

import type { BacktestSettings, EquityPoint } from "@/lib/backtest/types";

export interface OptimizationGridSpec {
  takeProfitPct: { min: number; max: number; steps: number };
  priceOverlapPct: { min: number; max: number; steps: number };
  /** расширение под будущие параметры */
}

export interface OptimizationRow {
  params: Partial<BacktestSettings>;
  totalReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeApprox: number | null;
  liquidations: number;
  overfittingRisk: "low" | "medium" | "high";
}

export interface WalkForwardPeriod {
  label: string;
  inSampleReturnPct: number;
  outSampleReturnPct: number;
  degradationPct: number;
}

export interface MonteCarloSummary {
  simulations: number;
  medianEquity: number;
  p5Equity: number;
  p95Equity: number;
  probLoss: number;
  /** Доля симуляций с просадкой equity выше 50% (грубый хвостовой риск). */
  probDdOver50Pct?: number;
  status: "ok" | "stub" | "no_trades";
  /** Короткое пояснение метода */
  note?: string;
}

export interface StressScenarioResult {
  id: string;
  label: string;
  survived: boolean;
  finalEquity: number;
  maxDrawdownPct: number;
  liquidated: boolean;
  riskScore: number;
}

export interface BenchmarkSeries {
  id: string;
  label: string;
  equity: EquityPoint[];
  totalReturnPct: number;
  maxDrawdownPct: number;
}
