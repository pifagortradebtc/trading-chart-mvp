/**
 * Бэктест «Pifagor ALTS»: один лонг без DCA-сетки, вход по сигналу Pine, выход TP % и/или правила Pine.
 */

import type { Candle } from "@/types/candle";
import { buildDcaGrid } from "./dcaGrid";
import { maxMarginAvailableUsdt } from "./risk";
import { buildPifagorDailyContext, computePifagorSeries } from "./pifagorAltsIndicators";
import type {
  BacktestResult,
  BacktestSettings,
  EquityPoint,
  DcaGridResult,
  MarketRegime,
  OpenPositionSnapshot,
  SignalBarState,
  TradeRecord,
} from "./types";

function tpPriceFromAvg(avg: number, tpPct: number): number {
  return avg * (1 + tpPct / 100);
}

function buildSingleLongGrid(entryPrice: number, settings: BacktestSettings): DcaGridResult {
  const { dca } = settings;
  const notional =
    dca.gridTotalNotionalUsdt ??
    (dca.startDepositUsdt * dca.firstOrderDepositPct) / 100;
  const patched = {
    ...dca,
    ordersCount: 1,
    priceOverlapPct: Math.max(dca.priceOverlapPct, 0.01),
    gridTotalNotionalUsdt: Math.max(notional, 1e-9),
  };
  return buildDcaGrid("long", entryPrice, patched);
}

export function runPifagorAltsBacktest(
  candles: Candle[],
  symbol: string,
  settings: BacktestSettings,
  requestedFromMs: number,
): BacktestResult {
  const n = candles.length;
  const pif = settings.pifagorAlts;
  const daily = buildPifagorDailyContext(candles);
  const series = computePifagorSeries(candles, symbol, pif, daily);

  const signalsOut: (boolean | null)[] = new Array(n).fill(null);
  const metaOut: (SignalBarState | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (series.enterRaw[i]) {
      signalsOut[i] = true;
      metaOut[i] = {
        longRange: true,
        longTrend: false,
        shortRange: false,
        shortTrend: false,
        regime: "range",
        reasonLong: "Pifagor ALTS · вход",
        reasonShort: "",
      };
    } else {
      metaOut[i] = null;
    }
  }

  let equity = settings.dca.startDepositUsdt;
  const equityCurve: EquityPoint[] = [];
  let peak = equity;
  const trades: TradeRecord[] = [];

  let tradeSeq = 1;
  let open: {
    id: number;
    signalBar: number;
    entryBar: number;
    qty: number;
    avgPrice: number;
    cumNotional: number;
    feesUsdt: number;
    fundingUsdt: number;
    grid: DcaGridResult;
    maxDrawdownPct: number;
    firstPrice: number;
  } | null = null;

  let pendingSignalBar: number | null = null;
  let openPositionAtDataEnd: OpenPositionSnapshot | null = null;

  const pushEquity = (tMs: number) => {
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    equityCurve.push({ time: tMs, equity, drawdownPct: dd, peakEquity: peak });
  };

  const finalizeTrade = (
    tr: NonNullable<typeof open>,
    exit: TradeRecord["exitReason"],
    exitPrice: number,
    tMs: number,
    barIndex: number,
  ) => {
    const gross = tr.qty * (exitPrice - tr.avgPrice);
    const exitNotional = exitPrice * tr.qty;
    const exitFee = (exitNotional * settings.dca.feePctPerSide) / 100;
    tr.feesUsdt += exitFee;
    const pnl = gross - tr.feesUsdt - tr.fundingUsdt;
    equity += pnl;
    if (equity > peak) peak = equity;
    pushEquity(tMs);

    const entryT = candles[tr.entryBar]?.time ?? candles[tr.signalBar]?.time ?? 0;
    trades.push({
      id: tr.id,
      symbol,
      side: "long",
      marginMode: settings.dca.marginMode,
      regime: "range" as MarketRegime,
      entrySignalTime: (candles[tr.signalBar]?.time ?? Math.floor(tMs / 1000)) * 1000,
      entryTime: entryT * 1000,
      exitTime: tMs,
      entryBarIndex: tr.entryBar,
      exitBarIndex: barIndex,
      firstEntryPrice: tr.firstPrice,
      avgEntryPrice: tr.avgPrice,
      exitPrice,
      maxDcaIndex: 1,
      totalGridOrders: tr.grid.rows.length,
      maxDrawdownPct: tr.maxDrawdownPct,
      pnlUsdt: pnl,
      pnlPctOnMargin:
        tr.cumNotional > 0 ? (pnl / (tr.cumNotional / settings.dca.leverage)) * 100 : 0,
      feesUsdt: tr.feesUsdt,
      firstEntryKind: "market",
      exitReason: exit,
      durationMs: tMs - entryT * 1000,
      comment: "Pifagor ALTS 3.7",
      dcaGrid: {
        side: "long",
        firstEntryPrice: tr.firstPrice,
        rows: tr.grid.rows,
      },
      dcaFillTimesMs: [entryT * 1000],
      equityAfterClose: equity,
    });
    open = null;
  };

  if (n > 0) pushEquity(candles[0]!.time * 1000);

  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const tMs = c.time * 1000;

    if (open && settings.dca.fundingPctPer8h > 0 && i > 0) {
      const prev = candles[i - 1]!;
      const dtMs = (c.time - prev.time) * 1000;
      const fundingFee =
        open.cumNotional * (settings.dca.fundingPctPer8h / 100) * (dtMs / (8 * 3600 * 1000));
      open.fundingUsdt += fundingFee;
      equity -= fundingFee;
    }

    if (!open && pendingSignalBar !== null && i === pendingSignalBar + 1) {
      const fillPx = c.open;
      const grid = buildSingleLongGrid(fillPx, settings);
      const firstRow = grid.rows[0];
      const marginOk =
        firstRow &&
        firstRow.orderUsdt / settings.dca.leverage <=
          maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
      if (marginOk && firstRow) {
        const qty0 = firstRow.orderUsdt / fillPx;
        open = {
          id: tradeSeq++,
          signalBar: pendingSignalBar,
          entryBar: i,
          qty: qty0,
          avgPrice: fillPx,
          cumNotional: firstRow.orderUsdt,
          feesUsdt: (firstRow.orderUsdt * settings.dca.feePctPerSide) / 100,
          fundingUsdt: 0,
          grid,
          maxDrawdownPct: 0,
          firstPrice: fillPx,
        };
      }
      pendingSignalBar = null;
    }

    if (open) {
      const low = c.low;
      const high = c.high;
      const close = c.close;
      const uHigh = (open.firstPrice - low) / open.firstPrice;
      open.maxDrawdownPct = Math.max(open.maxDrawdownPct, uHigh * 100);

      const tpP = tpPriceFromAvg(open.avgPrice, settings.dca.takeProfitPct);
      const tpHit = settings.dca.takeProfitOnClose ? close >= tpP : high >= tpP;
      const pineExit = pif.usePineExitRules && series.exitRuleRaw[i];

      if (tpHit) {
        const exitPx = settings.dca.takeProfitOnClose ? close : tpP;
        finalizeTrade(open, "tp", exitPx, tMs, i);
      } else if (pineExit) {
        finalizeTrade(open, "signal", close, tMs, i);
      }
    }

    if (!open && pendingSignalBar === null && series.enterRaw[i]) {
      pendingSignalBar = i;
    }

    pushEquity(tMs);
    if (equity > peak) peak = equity;
  }

  if (open && n > 0) {
    const cLast = candles[n - 1]!;
    const tMsEnd = cLast.time * 1000;
    const barIdx = n - 1;
    const openedAtMs = (candles[open.entryBar]?.time ?? 0) * 1000;
    const tpTarget = tpPriceFromAvg(open.avgPrice, settings.dca.takeProfitPct);
    const marginUsed = open.cumNotional / settings.dca.leverage;
    const gross = open.qty * (cLast.close - open.avgPrice);
    const unrealizedPnlPctOnMargin = marginUsed > 0 ? (gross / marginUsed) * 100 : 0;
    let distanceToTpPct = 0;
    if (cLast.close > 0) {
      distanceToTpPct = ((tpTarget - cLast.close) / cLast.close) * 100;
    }
    openPositionAtDataEnd = {
      symbol,
      side: "long",
      regime: "range",
      avgEntryPrice: open.avgPrice,
      takeProfitPrice: tpTarget,
      markPrice: cLast.close,
      filledLevels: 1,
      totalGridOrders: open.grid.rows.length,
      unrealizedPnlPctOnMargin,
      distanceToTpPct,
      openedAtMs,
      lastBarAtMs: tMsEnd,
      durationMs: Math.max(0, tMsEnd - openedAtMs),
      maxDrawdownPct: open.maxDrawdownPct,
      firstEntryKind: "market",
      cumNotionalUsdt: open.cumNotional,
      leverage: settings.dca.leverage,
      durationBars: Math.max(1, barIdx - open.entryBar + 1),
    };
    finalizeTrade(open, "end_of_test", cLast.close, tMsEnd, barIdx);
  }

  const fromMs = n ? candles[0]!.time * 1000 : 0;
  const toMs = n ? candles[n - 1]!.time * 1000 : 0;

  return {
    candles,
    signals: signalsOut,
    signalMeta: metaOut,
    trades,
    equity: equityCurve,
    dataRange: { fromMs, toMs, requestedFromMs },
    lastBarAtrKelt: undefined,
    openPositionAtDataEnd,
    warning:
      "Режим Pifagor ALTS: дневная ветка aaa1 при «больше» считается по закрытым UTC-дням (приближение к Pine). Сверяйте сигналы с TradingView.",
  };
}
