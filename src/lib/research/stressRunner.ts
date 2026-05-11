/**
 * Стресс-сценарии: повторный бэктест с изменёнными комиссиями/funding (worker).
 */

import type { Candle } from "@/types/candle";
import { runBacktestOffMainThread } from "@/lib/backtest/runBacktestClient";
import { computeMetrics } from "@/lib/backtest/metrics";
import type { BacktestSettings } from "@/lib/backtest/types";
import type { StressScenarioResult } from "./engines/types";

function cloneSettings(base: BacktestSettings): BacktestSettings {
  return structuredClone(base);
}

function riskScoreFromMetrics(maxDdPct: number, liquidations: number): number {
  let s = Math.min(100, maxDdPct * 1.2);
  if (liquidations > 0) s = Math.min(100, s + 40);
  return Math.round(s);
}

export async function runStressSuiteClient(
  candles: Candle[],
  symbol: string,
  base: BacktestSettings,
  startMs: number,
  onProgress?: (label: string, index: number, total: number) => void,
): Promise<StressScenarioResult[]> {
  const scenarios: {
    id: string;
    label: string;
    apply: (s: BacktestSettings) => void;
  }[] = [
    {
      id: "fee2x",
      label: "Комиссия ×2",
      apply: (s) => {
        s.dca.feePctPerSide = base.dca.feePctPerSide * 2;
      },
    },
    {
      id: "fee3x",
      label: "Комиссия ×3",
      apply: (s) => {
        s.dca.feePctPerSide = base.dca.feePctPerSide * 3;
      },
    },
    {
      id: "fee2_funding2",
      label: "Комиссия ×2 + funding ×2",
      apply: (s) => {
        s.dca.feePctPerSide = base.dca.feePctPerSide * 2;
        s.dca.fundingPctPer8h = base.dca.fundingPctPer8h * 2;
      },
    },
    {
      id: "fundingNeg",
      label: "Доп. негативный funding (+0.02%/8h)",
      apply: (s) => {
        s.dca.fundingPctPer8h = base.dca.fundingPctPer8h - 0.02;
      },
    },
  ];

  const out: StressScenarioResult[] = [];
  let i = 0;
  const total = scenarios.length;

  for (const sc of scenarios) {
    i++;
    onProgress?.(sc.label, i, total);
    const s = cloneSettings(base);
    sc.apply(s);
    const res = await runBacktestOffMainThread(candles, symbol, s, startMs);
    const m = computeMetrics(res.trades, res.equity, s.dca.startDepositUsdt);
    const finalEq = s.dca.startDepositUsdt + m.totalPnlUsdt;
    const liquidated = m.liquidations > 0;
    out.push({
      id: sc.id,
      label: sc.label,
      survived: finalEq > 0 && !Number.isNaN(finalEq),
      finalEquity: finalEq,
      maxDrawdownPct: m.maxEquityDrawdownPct,
      liquidated,
      riskScore: riskScoreFromMetrics(m.maxEquityDrawdownPct, m.liquidations),
    });
  }

  return out;
}
