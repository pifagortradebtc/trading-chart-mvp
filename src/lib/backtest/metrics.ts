/**
 * Агрегированная статистика по результатам бэктеста.
 */

import type { EquityPoint, TradeRecord } from "./types";

/** Человекочитаемо: почему закрылась худшая сделка (для подсказок в UI). */
export function exitReasonLabelRu(r: TradeRecord["exitReason"]): string {
  switch (r) {
    case "tp":
      return "тейк-профит";
    case "sl":
      return "стоп-лосс";
    case "liquidation":
      return "ликвидация";
    case "end_of_test":
      return "конец диапазона данных (принудительное закрытие)";
    case "signal":
      return "сигнал стратегии (правила выхода Pine)";
    default:
      return String(r);
  }
}

/** Развёрнутое объяснение для карточки «Худшая сделка» (с учётом кросс / без стопа в типичной стратегии). */
export function worstTradeDetailRu(reason: TradeRecord["exitReason"]): string {
  switch (reason) {
    case "end_of_test":
      return "К последней свече выборки цена не достигла лимитного TP — позиция закрыта по close последнего бара. Это не стоп и не ликвидация: при кросс-марже и без SL в движке других принудительных выходов нет.";
    case "tp":
      return "Выход по тейку от средней; отрицательный PnL бывает, если комиссии и фunding съели прибыль при узком TP.";
    case "sl":
      return "В настройках задан Stop loss % — срабатывание стопа от средней.";
    case "liquidation":
      return "Ветка ликвидации только при изолированной марже; при кросс-марже в бэктесте она отключена.";
    case "signal":
      return "Выход по условиям индикатора (например daily mult / diff), а не по TP.";
    default:
      return "";
  }
}

export interface MetricsSummary {
  totalPnlUsdt: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  maxEquityDrawdownPct: number;
  trades: number;
  winRatePct: number;
  profitFactor: number;
  avgWinUsdt: number;
  avgLossUsdt: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  liquidations: number;
  /** Сделки, закрытые принудительно на последней свече (нет времени дойти до TP). В старых снимках может отсутствовать. */
  endOfTestCloses?: number;
  worstTradeUsdt: number;
  /** По какой причине закрылась сделка с минимальным PnL (объясняет убыток при «всегда TP»). В старых снимках может отсутствовать. */
  worstTradeExitReason?: TradeRecord["exitReason"] | null;
  worstTradeId?: number | null;
  bestTradeUsdt: number;
  avgTradeDurationMs: number;
  maxTradeDurationMs: number;
  avgDcaOrdersPerTrade: number;
  maxDcaOrdersInTrade: number;
  fullGridHits: number;
  avgDepositLoadPct: number;
  maxDepositLoadPct: number;
  startingDeposit: number;
}

function maxDrawdownFromEquity(points: EquityPoint[]): number {
  let peak = 0;
  let maxDd = 0;
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function computeMetrics(
  trades: TradeRecord[],
  equity: EquityPoint[],
  startingDeposit: number,
): MetricsSummary {
  const wins = trades.filter((t) => t.pnlUsdt > 0);
  const losses = trades.filter((t) => t.pnlUsdt < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnlUsdt, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsdt, 0));

  let maxLossStreak = 0;
  let maxWinStreak = 0;
  let curLoss = 0;
  let curWin = 0;
  for (const t of trades) {
    if (t.pnlUsdt < 0) {
      curLoss++;
      curWin = 0;
      maxLossStreak = Math.max(maxLossStreak, curLoss);
    } else if (t.pnlUsdt > 0) {
      curWin++;
      curLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, curWin);
    }
  }

  const totalPnl = trades.reduce((s, t) => s + t.pnlUsdt, 0);
  const maxDdTrade = trades.reduce((m, t) => Math.max(m, t.maxDrawdownPct), 0);
  const maxEqDd = maxDrawdownFromEquity(equity);

  const liquidations = trades.filter((t) => t.exitReason === "liquidation").length;
  const endOfTestCloses = trades.filter((t) => t.exitReason === "end_of_test").length;

  let worstTrade: TradeRecord | null = null;
  for (const t of trades) {
    if (!worstTrade || t.pnlUsdt < worstTrade.pnlUsdt) worstTrade = t;
  }
  const worst = worstTrade?.pnlUsdt ?? 0;
  const best = trades.length ? Math.max(...trades.map((t) => t.pnlUsdt)) : 0;

  const durations = trades.map((t) => t.durationMs).filter((d) => Number.isFinite(d));
  const avgDur =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const maxDur = durations.length > 0 ? Math.max(...durations) : 0;

  const dcaCounts = trades.map((t) => t.maxDcaIndex);
  const avgDca =
    dcaCounts.length > 0 ? dcaCounts.reduce((a, b) => a + b, 0) / dcaCounts.length : 0;
  const maxDca = dcaCounts.length > 0 ? Math.max(...dcaCounts) : 0;

  const ordersFull = trades.filter(
    (t) => t.totalGridOrders > 0 && t.maxDcaIndex >= t.totalGridOrders,
  ).length;

  /** Загрузка депозита — средний и макс ratio маржи к депозиту по сделкам (упрощённо по последнему ряду сетки). */
  const loads = trades.map((t) => {
    const last = t.dcaGrid.rows[t.dcaGrid.rows.length - 1];
    if (!last) return 0;
    return (last.marginUsedUsdt / startingDeposit) * 100;
  });
  const avgLoad = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  const maxLoad = loads.length ? Math.max(...loads) : 0;

  let profitFactor = 0;
  if (grossLoss > 0) profitFactor = grossProfit / grossLoss;
  else if (grossProfit > 0) profitFactor = Infinity;

  return {
    totalPnlUsdt: totalPnl,
    totalReturnPct: startingDeposit > 0 ? (totalPnl / startingDeposit) * 100 : 0,
    maxDrawdownPct: maxDdTrade,
    maxEquityDrawdownPct: maxEqDd,
    trades: trades.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor,
    avgWinUsdt: wins.length ? grossProfit / wins.length : 0,
    avgLossUsdt: losses.length ? grossLoss / losses.length : 0,
    maxConsecutiveLosses: maxLossStreak,
    maxConsecutiveWins: maxWinStreak,
    liquidations,
    endOfTestCloses,
    worstTradeUsdt: worst,
    worstTradeExitReason: worstTrade?.exitReason ?? null,
    worstTradeId: worstTrade?.id ?? null,
    bestTradeUsdt: best,
    avgTradeDurationMs: avgDur,
    maxTradeDurationMs: maxDur,
    avgDcaOrdersPerTrade: avgDca,
    maxDcaOrdersInTrade: maxDca,
    fullGridHits: ordersFull,
    avgDepositLoadPct: avgLoad,
    maxDepositLoadPct: maxLoad,
    startingDeposit,
  };
}
