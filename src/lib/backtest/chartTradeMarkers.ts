/**
 * Маркеры бэктеста: сигнал, усреднения DCA (факт исполнения лимиток), выход.
 */

import type { SeriesMarker, Time } from "lightweight-charts";
import type { TradeRecord } from "./types";

function exitMarkerText(t: TradeRecord): string {
  const pnlStr = `${t.pnlUsdt >= 0 ? "+" : ""}${t.pnlUsdt.toFixed(1)}`;
  if (t.exitReason === "tp") return `#${t.id} TP ${pnlStr} USDT`;
  if (t.exitReason === "liquidation") return `#${t.id} ликв. ${pnlStr} USDT`;
  if (t.exitReason === "sl") return `#${t.id} SL ${pnlStr} USDT`;
  return `#${t.id} конец ${pnlStr} USDT`;
}

function exitMarkerColor(reason: TradeRecord["exitReason"]): string {
  if (reason === "tp") return "#34d399";
  return "#f87171";
}

/**
 * Сигнал индикатора — стрелка на баре entrySignalTime.
 * Оранжевые точки — факт исполнения следующих лимиток усреднения (DCA 2…), если есть `dcaFillTimesMs`.
 * Выход — TP (зелёный) или иная причина (красный), с PnL.
 */
export function buildBacktestChartMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  /** На одной сделке показываем любой выход; на всём прогоне — только TP, чтобы не засорять шкалу. */
  const showNonTpExit = trades.length === 1;

  for (const t of trades) {
    const tSig = Math.floor(t.entrySignalTime / 1000) as Time;
    out.push({
      time: tSig,
      position: t.side === "long" ? "belowBar" : "aboveBar",
      color: "#22c55e",
      shape: t.side === "long" ? "arrowUp" : "arrowDown",
      text: `#${t.id}`,
    });

    const fills = t.dcaFillTimesMs;
    if (fills && fills.length > 1) {
      for (let i = 1; i < fills.length; i++) {
        const tm = Math.floor(fills[i]! / 1000) as Time;
        const level = i + 1;
        out.push({
          time: tm,
          position: t.side === "long" ? "belowBar" : "aboveBar",
          color: "#f59e0b",
          shape: "circle",
          text: `DCA ${level}`,
        });
      }
    }

    if (t.exitReason === "tp" || showNonTpExit) {
      const tEx = Math.floor(t.exitTime / 1000) as Time;
      out.push({
        time: tEx,
        position: t.side === "long" ? "aboveBar" : "belowBar",
        color: exitMarkerColor(t.exitReason),
        shape: "circle",
        text: exitMarkerText(t),
      });
    }
  }

  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
}

/** @deprecated используйте buildBacktestChartMarkers */
export function buildTradeMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  return buildBacktestChartMarkers(trades);
}
