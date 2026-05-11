import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestSettings, EquityPoint, TradeRecord } from "@/lib/backtest/types";

/** Файл на persistent disk: последний бэктест (без массива свечей). */
export interface BacktestSnapshotFile {
  version: 1;
  savedAt: string;
  symbol: string;
  interval: string;
  yearsBack: number;
  settings: BacktestSettings;
  trades: TradeRecord[];
  equity: EquityPoint[];
  metrics: MetricsSummary;
  candleCount: number;
}
