"use client";

import { create } from "zustand";
import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestResult } from "@/lib/backtest/types";

/**
 * Последний успешный прогон бэктеста — переживает переход на /chart и обратно
 * (локальный state BacktestPage при размонтировании теряется).
 */
interface BacktestLastRunState {
  lastResult: BacktestResult | null;
  lastMetrics: MetricsSummary | null;
  setLastRun: (result: BacktestResult, metrics: MetricsSummary | null) => void;
  clearLastRun: () => void;
}

export const useBacktestLastRunStore = create<BacktestLastRunState>((set) => ({
  lastResult: null,
  lastMetrics: null,
  setLastRun: (result, metrics) => set({ lastResult: result, lastMetrics: metrics }),
  clearLastRun: () => set({ lastResult: null, lastMetrics: null }),
}));
