/**
 * Бэктест «Pifagor ALTS»: лонг с доливами фиксированного номинала на каждый сигнал Pine
 * (без сетки DCA из модели ЧайкКельт), выход по TP % и/или правилам Pine.
 */

import type { Candle } from "@/types/candle";
import {
  approxLiquidationPrice,
  effectiveLiquidationLeverage,
  maxMarginAvailableUsdt,
} from "./risk";
import { buildPifagorDailyContext, computePifagorSeries } from "./pifagorAltsIndicators";
import type {
  BacktestResult,
  BacktestSettings,
  DcaGridResult,
  DcaGridRow,
  EquityPoint,
  MarketRegime,
  OpenPositionSnapshot,
  SignalBarState,
  TradeRecord,
} from "./types";

function tpPriceFromAvg(avg: number, tpPct: number): number {
  return avg * (1 + tpPct / 100);
}

function slPriceLong(avg: number, slPct: number): number {
  return avg * (1 - slPct / 100);
}

interface FillLeg {
  barIndex: number;
  timeMs: number;
  price: number;
  notionalUsdt: number;
}

function buildGridFromFills(
  fills: FillLeg[],
  firstEntryPrice: number,
  settings: BacktestSettings,
): DcaGridResult {
  const dca = settings.dca;
  const liqLev = effectiveLiquidationLeverage(dca);
  const tpPct = dca.takeProfitPct;
  const rows: DcaGridRow[] = [];
  let cumQty = 0;
  let cumNotional = 0;
  for (let k = 0; k < fills.length; k++) {
    const f = fills[k]!;
    const orderUsdt = f.notionalUsdt;
    const price = f.price;
    const qtyCoin = orderUsdt / price;
    cumQty += qtyCoin;
    cumNotional += orderUsdt;
    const avgPrice = cumNotional / cumQty;
    const takeProfitPrice = tpPriceFromAvg(avgPrice, tpPct);
    const liq = approxLiquidationPrice("long", avgPrice, liqLev);
    const drawdownFromFirstPct = ((firstEntryPrice - avgPrice) / firstEntryPrice) * 100;
    const marginUsed = cumNotional / dca.leverage;
    rows.push({
      orderIndex: k + 1,
      price,
      orderUsdt,
      qtyCoin,
      cumNotionalUsdt: cumNotional,
      avgPrice,
      takeProfitPrice,
      approxLiquidationPrice: liq,
      drawdownFromFirstPct,
      marginUsedUsdt: marginUsed,
    });
  }
  return { side: "long", firstEntryPrice, rows };
}

export function runPifagorAltsBacktest(
  candles: Candle[],
  symbol: string,
  settings: BacktestSettings,
  _requestedFromMs: number,
): BacktestResult {
  const n = candles.length;
  const pif = settings.pifagorAlts;
  const dca = settings.dca;
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

  let equity = dca.startDepositUsdt;
  const equityCurve: EquityPoint[] = [];
  let peak = equity;
  const trades: TradeRecord[] = [];

  let tradeSeq = 1;
  let open: {
    id: number;
    firstSignalBar: number;
    firstEntryBar: number;
    firstPrice: number;
    qty: number;
    avgPrice: number;
    cumNotional: number;
    feesUsdt: number;
    fundingUsdt: number;
    maxDrawdownPct: number;
    fills: FillLeg[];
  } | null = null;

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
    const exitFee = (exitNotional * dca.feePctPerSide) / 100;
    tr.feesUsdt += exitFee;
    const pnl = gross - tr.feesUsdt - tr.fundingUsdt;
    equity += pnl;
    if (equity > peak) peak = equity;
    pushEquity(tMs);

    const entryT = candles[tr.firstEntryBar]?.time ?? candles[tr.firstSignalBar]?.time ?? 0;
    const grid = buildGridFromFills(tr.fills, tr.firstPrice, settings);
    const dcaFillTimesMs = tr.fills.map((f) => f.timeMs);

    trades.push({
      id: tr.id,
      symbol,
      side: "long",
      marginMode: dca.marginMode,
      regime: "range" as MarketRegime,
      entrySignalTime: (candles[tr.firstSignalBar]?.time ?? Math.floor(tMs / 1000)) * 1000,
      entryTime: entryT * 1000,
      exitTime: tMs,
      entryBarIndex: tr.firstEntryBar,
      exitBarIndex: barIndex,
      firstEntryPrice: tr.firstPrice,
      avgEntryPrice: tr.avgPrice,
      exitPrice,
      maxDcaIndex: tr.fills.length,
      totalGridOrders: tr.fills.length,
      maxDrawdownPct: tr.maxDrawdownPct,
      pnlUsdt: pnl,
      pnlPctOnMargin:
        tr.cumNotional > 0 ? (pnl / (tr.cumNotional / dca.leverage)) * 100 : 0,
      feesUsdt: tr.feesUsdt,
      firstEntryKind: "market",
      exitReason: exit,
      durationMs: tMs - entryT * 1000,
      comment: "Pifagor ALTS 3.7",
      dcaGrid: {
        side: "long",
        firstEntryPrice: tr.firstPrice,
        rows: grid.rows,
      },
      dcaFillTimesMs,
      equityAfterClose: equity,
    });
    open = null;
  };

  if (n > 0) pushEquity(candles[0]!.time * 1000);

  const entryNotional = Math.max(1e-9, pif.entryNotionalUsdt);

  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const tMs = c.time * 1000;

    if (open && dca.fundingPctPer8h > 0 && i > 0) {
      const prev = candles[i - 1]!;
      const dtMs = (c.time - prev.time) * 1000;
      const fundingFee =
        open.cumNotional * (dca.fundingPctPer8h / 100) * (dtMs / (8 * 3600 * 1000));
      open.fundingUsdt += fundingFee;
      equity -= fundingFee;
    }

    /** Сигнал на close бара i−1 → исполнение market по open бара i (как раньше). */
    if (i > 0 && series.enterRaw[i - 1]) {
      const fillPx = c.open;
      if (Number.isFinite(fillPx) && fillPx > 0) {
        const marginNeed = entryNotional / dca.leverage;
        const usedMargin = open ? open.cumNotional / dca.leverage : 0;
        const cap = maxMarginAvailableUsdt(dca, equity);
        const pyramidCap = Math.max(1, Math.floor(pif.maxPyramidingEntries));
        const underPyramidCap = !open || open.fills.length < pyramidCap;
        const marginOk = usedMargin + marginNeed <= cap + 1e-9;
        if (marginOk && underPyramidCap) {
          const feeIn = (entryNotional * dca.feePctPerSide) / 100;
          const addQty = entryNotional / fillPx;
          if (!open) {
            open = {
              id: tradeSeq++,
              firstSignalBar: i - 1,
              firstEntryBar: i,
              firstPrice: fillPx,
              qty: addQty,
              avgPrice: fillPx,
              cumNotional: entryNotional,
              feesUsdt: feeIn,
              fundingUsdt: 0,
              maxDrawdownPct: 0,
              fills: [
                {
                  barIndex: i,
                  timeMs: tMs,
                  price: fillPx,
                  notionalUsdt: entryNotional,
                },
              ],
            };
          } else {
            const newCum = open.cumNotional + entryNotional;
            const newQty = open.qty + addQty;
            open.cumNotional = newCum;
            open.qty = newQty;
            open.avgPrice = newCum / newQty;
            open.feesUsdt += feeIn;
            open.fills.push({
              barIndex: i,
              timeMs: tMs,
              price: fillPx,
              notionalUsdt: entryNotional,
            });
          }
        }
      }
    }

    if (open) {
      const low = c.low;
      const high = c.high;
      const close = c.close;
      const uHigh = (open.firstPrice - low) / open.firstPrice;
      open.maxDrawdownPct = Math.max(open.maxDrawdownPct, uHigh * 100);

      const tpP = tpPriceFromAvg(open.avgPrice, dca.takeProfitPct);
      const tpHit = dca.takeProfitOnClose ? close >= tpP : high >= tpP;
      const pineExit = pif.usePineExitRules && series.exitRuleRaw[i];
      const slP =
        dca.stopLossPct != null ? slPriceLong(open.avgPrice, dca.stopLossPct) : null;
      const slHit = slP != null && low <= slP;

      if (slHit) {
        finalizeTrade(open, "sl", slP, tMs, i);
      } else if (tpHit) {
        const exitPx = dca.takeProfitOnClose ? close : tpP;
        finalizeTrade(open, "tp", exitPx, tMs, i);
      } else if (pineExit) {
        finalizeTrade(open, "signal", close, tMs, i);
      }
    }

    pushEquity(tMs);
    if (equity > peak) peak = equity;
  }

  if (open && n > 0) {
    const cLast = candles[n - 1]!;
    const tMsEnd = cLast.time * 1000;
    const barIdx = n - 1;
    const openedAtMs = (candles[open.firstEntryBar]?.time ?? 0) * 1000;
    const tpTarget = tpPriceFromAvg(open.avgPrice, dca.takeProfitPct);
    const marginUsed = open.cumNotional / dca.leverage;
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
      filledLevels: open.fills.length,
      totalGridOrders: open.fills.length,
      unrealizedPnlPctOnMargin,
      distanceToTpPct,
      openedAtMs,
      lastBarAtMs: tMsEnd,
      durationMs: Math.max(0, tMsEnd - openedAtMs),
      maxDrawdownPct: open.maxDrawdownPct,
      firstEntryKind: "market",
      cumNotionalUsdt: open.cumNotional,
      leverage: dca.leverage,
      durationBars: Math.max(1, barIdx - open.firstEntryBar + 1),
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
    dataRange: { fromMs, toMs, requestedFromMs: _requestedFromMs },
    lastBarAtrKelt: undefined,
    openPositionAtDataEnd,
    warning:
      "Режим Pifagor ALTS: дневная ветка aaa1 при «больше» считается по закрытым UTC-дням (приближение к Pine). Каждый сигнал — долив фиксированного номинала, пока хватает маржи по модели кошелька/депозита.",
  };
}
