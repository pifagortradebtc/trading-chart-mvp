/**
 * Мини-сетка оптимизации TP × overlap в worker-бэктесте (последовательные прогоны).
 */

import type { Candle } from "@/types/candle";
import { runBacktestOffMainThread } from "@/lib/backtest/runBacktestClient";
import { computeMetrics } from "@/lib/backtest/metrics";
import type { BacktestSettings } from "@/lib/backtest/types";
import type { OptimizationRow } from "./engines/types";
import { computeAdvancedResearchMetrics } from "./advancedMetrics";

const TP_GRID = [0.5, 0.55, 0.6];
const OVERLAP_GRID = [20, 25, 30];

function cloneSettings(base: BacktestSettings): BacktestSettings {
  return structuredClone(base);
}

export async function runMiniTpOverlapGrid(
  candles: Candle[],
  symbol: string,
  baseSettings: BacktestSettings,
  startMs: number,
  onProgress?: (done: number, total: number) => void,
): Promise<OptimizationRow[]> {
  const rows: OptimizationRow[] = [];
  const combos: { tp: number; ov: number }[] = [];
  for (const tp of TP_GRID) {
    for (const ov of OVERLAP_GRID) {
      combos.push({ tp, ov });
    }
  }
  const total = combos.length;
  let done = 0;

  for (const { tp, ov } of combos) {
    const s = cloneSettings(baseSettings);
    s.dca.takeProfitPct = tp;
    s.dca.priceOverlapPct = ov;

    const res = await runBacktestOffMainThread(candles, symbol, s, startMs);
    const m = computeMetrics(res.trades, res.equity, s.dca.startDepositUsdt);
    const adv = computeAdvancedResearchMetrics(m, res.trades, res.equity, candles, s.dca.startDepositUsdt);

    rows.push({
      params: {
        dca: {
          takeProfitPct: tp,
          priceOverlapPct: ov,
        },
      } as Partial<BacktestSettings>,
      totalReturnPct: m.totalReturnPct,
      maxDrawdownPct: m.maxEquityDrawdownPct,
      profitFactor: m.profitFactor === Infinity ? 99 : m.profitFactor,
      sharpeApprox: adv.sharpeRatio,
      liquidations: m.liquidations,
      /** Мини-сетка без hold-out — высокий риск переоптимизации при экстраполяции. */
      overfittingRisk: "medium",
    });

    done++;
    onProgress?.(done, total);
  }

  return rows.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
}
