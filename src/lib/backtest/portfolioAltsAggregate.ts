/**
 * Агрегация результатов портфельного бэктеста Pifagor ALTS.
 */

import { computeMetrics } from "./metrics";
import type {
  PortfolioBacktestResult,
  PortfolioBacktestSummary,
  PortfolioOhlcvLoadStats,
  PortfolioSingleRun,
  PortfolioSymbolMetrics,
  PortfolioSymbolResult,
} from "./portfolioAltsTypes";
import type { BacktestSettings, EquityPoint, TradeRecord } from "./types";

function equityAt(points: EquityPoint[], timeMs: number, fallback: number): number {
  if (!points.length) return fallback;
  let last = fallback;
  for (const p of points) {
    if (p.time > timeMs) break;
    last = p.equity;
  }
  return last;
}

/** Объединяет кривые equity суб-счетов в одну на общий депозит. */
export function mergePortfolioEquityCurves(
  curves: { deposit: number; points: EquityPoint[] }[],
  totalDeposit: number,
): EquityPoint[] {
  if (!curves.length) {
    return [{ time: Date.now(), equity: totalDeposit, drawdownPct: 0, peakEquity: totalDeposit }];
  }

  const times = new Set<number>();
  for (const c of curves) {
    for (const p of c.points) times.add(p.time);
  }
  const sorted = [...times].sort((a, b) => a - b);
  if (!sorted.length) {
    return [{ time: Date.now(), equity: totalDeposit, drawdownPct: 0, peakEquity: totalDeposit }];
  }

  let peak = totalDeposit;
  const out: EquityPoint[] = [];
  for (const t of sorted) {
    let sum = 0;
    for (const c of curves) {
      sum += equityAt(c.points, t, c.deposit);
    }
    if (sum > peak) peak = sum;
    const dd = peak > 0 ? ((peak - sum) / peak) * 100 : 0;
    out.push({ time: t, equity: sum, drawdownPct: dd, peakEquity: peak });
  }
  return out;
}

function symbolMetrics(
  trades: TradeRecord[],
  equity: EquityPoint[],
  deposit: number,
): PortfolioSymbolMetrics {
  const m = computeMetrics(trades, equity, deposit);
  const closed = trades.filter((t) => t.exitReason !== "end_of_test");
  return {
    totalPnlUsdt: m.totalPnlUsdt,
    totalReturnPct: m.totalReturnPct,
    trades: m.trades,
    winRatePct: m.winRatePct,
    maxEquityDrawdownPct: m.maxEquityDrawdownPct,
    avgTradeDurationMs: m.avgTradeDurationMs,
    maxTradeDurationMs: m.maxTradeDurationMs,
    closedTrades: closed.length,
    openAtEnd: trades.some((t) => t.exitReason === "end_of_test"),
  };
}

export function buildPortfolioBacktestResult(opts: {
  settings: BacktestSettings;
  interval: string;
  yearsBack: number;
  depositPerSymbolUsdt: number;
  entryNotionalPerSymbolUsdt: number;
  rows: PortfolioSymbolResult[];
  ohlcvLoads: PortfolioOhlcvLoadStats;
}): PortfolioBacktestResult {
  const { settings, interval, yearsBack, depositPerSymbolUsdt, entryNotionalPerSymbolUsdt, rows, ohlcvLoads } =
    opts;
  const okRows = rows.filter((r) => r.status === "ok");
  const totalDepositUsdt = depositPerSymbolUsdt * okRows.length;

  const combinedEquity = mergePortfolioEquityCurves(
    okRows.map((r) => ({ deposit: r.allocatedDepositUsdt, points: r.equity })),
    totalDepositUsdt,
  );

  const allTrades = okRows.flatMap((r) => r.trades);
  const closedTrades = allTrades.filter((t) => t.exitReason !== "end_of_test");
  const wins = closedTrades.filter((t) => t.pnlUsdt > 0);
  const durations = closedTrades.map((t) => t.durationMs).filter(Number.isFinite);
  const totalPnl = okRows.reduce((s, r) => s + (r.metrics?.totalPnlUsdt ?? 0), 0);
  const finalEquity =
    combinedEquity.length > 0
      ? combinedEquity[combinedEquity.length - 1]!.equity
      : totalDepositUsdt;
  const maxDd =
    combinedEquity.length > 0
      ? Math.max(...combinedEquity.map((p) => p.drawdownPct))
      : 0;

  const summary: PortfolioBacktestSummary = {
    totalDepositUsdt,
    depositPerSymbolUsdt,
    entryNotionalPerSymbolUsdt,
    symbolCount: rows.length,
    symbolsOk: okRows.length,
    symbolsSkipped: rows.filter((r) => r.status === "skipped").length,
    symbolsError: rows.filter((r) => r.status === "error").length,
    totalPnlUsdt: totalPnl,
    totalReturnPct: totalDepositUsdt > 0 ? (totalPnl / totalDepositUsdt) * 100 : 0,
    finalEquityUsdt: finalEquity,
    maxEquityDrawdownPct: maxDd,
    totalTrades: allTrades.length,
    closedTrades: closedTrades.length,
    openPositionsCount: okRows.filter((r) => r.openPositionAtDataEnd).length,
    avgTradeDurationMs: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0,
    maxTradeDurationMs: durations.length ? Math.max(...durations) : 0,
    winRatePct: closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0,
    interval,
    yearsBack,
    closewhen100: settings.pifagorAlts.closewhen100,
    ohlcvLoads,
  };

  return {
    summary,
    symbols: rows,
    combinedEquity,
    allTrades,
    ranAtMs: Date.now(),
  };
}

export function buildSymbolResultFromRun(opts: {
  symbol: string;
  label: string;
  status: PortfolioSymbolResult["status"];
  error?: string;
  warning?: string;
  candleCount: number;
  dataFromMs: number | null;
  dataToMs: number | null;
  allocatedDepositUsdt: number;
  run: PortfolioSingleRun | null;
}): PortfolioSymbolResult {
  const { run, allocatedDepositUsdt, ...rest } = opts;
  if (!run) {
    return {
      ...rest,
      allocatedDepositUsdt,
      metrics: null,
      trades: [],
      equity: [],
      openPositionAtDataEnd: null,
      finalEquityUsdt: allocatedDepositUsdt,
    };
  }

  const finalEquity =
    run.equity.length > 0
      ? run.equity[run.equity.length - 1]!.equity
      : allocatedDepositUsdt;

  return {
    ...rest,
    warning: rest.warning ?? run.warning,
    allocatedDepositUsdt,
    metrics: symbolMetrics(run.trades, run.equity, allocatedDepositUsdt),
    trades: run.trades,
    equity: run.equity,
    openPositionAtDataEnd: run.openPositionAtDataEnd,
    finalEquityUsdt: finalEquity,
  };
}
