/**
 * Типы портфельного бэктеста Pifagor ALTS по списку top-монет.
 */

import type { BacktestResult, EquityPoint, OpenPositionSnapshot, TradeRecord } from "./types";

export type PortfolioSymbolStatus = "ok" | "skipped" | "error";

export interface PortfolioSymbolMetrics {
  totalPnlUsdt: number;
  totalReturnPct: number;
  trades: number;
  winRatePct: number;
  maxEquityDrawdownPct: number;
  avgTradeDurationMs: number;
  maxTradeDurationMs: number;
  closedTrades: number;
  openAtEnd: boolean;
}

export interface PortfolioSymbolResult {
  symbol: string;
  label: string;
  status: PortfolioSymbolStatus;
  error?: string;
  warning?: string;
  candleCount: number;
  dataFromMs: number | null;
  dataToMs: number | null;
  allocatedDepositUsdt: number;
  metrics: PortfolioSymbolMetrics | null;
  trades: TradeRecord[];
  equity: EquityPoint[];
  openPositionAtDataEnd: OpenPositionSnapshot | null;
  /** Финальная equity на последнем баре (включая открытую позицию). */
  finalEquityUsdt: number;
}

export interface PortfolioBacktestSummary {
  totalDepositUsdt: number;
  depositPerSymbolUsdt: number;
  symbolCount: number;
  symbolsOk: number;
  symbolsSkipped: number;
  symbolsError: number;
  totalPnlUsdt: number;
  totalReturnPct: number;
  finalEquityUsdt: number;
  maxEquityDrawdownPct: number;
  totalTrades: number;
  closedTrades: number;
  openPositionsCount: number;
  avgTradeDurationMs: number;
  maxTradeDurationMs: number;
  winRatePct: number;
  interval: string;
  yearsBack: number;
  closewhen100: boolean;
}

export interface PortfolioBacktestResult {
  summary: PortfolioBacktestSummary;
  symbols: PortfolioSymbolResult[];
  combinedEquity: EquityPoint[];
  allTrades: TradeRecord[];
  ranAtMs: number;
}

export type PortfolioRunProgress = {
  phase: "load" | "run" | "aggregate";
  current: number;
  total: number;
  symbol: string;
  message: string;
};

/** Урезанный результат одного символа для агрегации. */
export type PortfolioSingleRun = Pick<
  BacktestResult,
  "trades" | "equity" | "openPositionAtDataEnd" | "warning"
>;
