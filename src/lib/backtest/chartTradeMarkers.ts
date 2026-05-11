/**
 * Маркеры бэктеста на графике: сигнал индикатора + выход по TP (без «каши» от всех выходов).
 */

import type { SeriesMarker, Time } from "lightweight-charts";
import type { TradeRecord } from "./types";

/**
 * Сигнал индикатора — стрелка вверх/вниз на баре entrySignalTime (в Pine — момент сигнала).
 * Выход — только если сделка закрыта по take profit (зелёный круг с PnL).
 */
export function buildBacktestChartMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];

  for (const t of trades) {
    const tSig = Math.floor(t.entrySignalTime / 1000) as Time;
    out.push({
      time: tSig,
      position: t.side === "long" ? "belowBar" : "aboveBar",
      color: "#22c55e",
      shape: t.side === "long" ? "arrowUp" : "arrowDown",
      text: `#${t.id}`,
    });

    if (t.exitReason === "tp") {
      const tEx = Math.floor(t.exitTime / 1000) as Time;
      const pnlStr = `${t.pnlUsdt >= 0 ? "+" : ""}${t.pnlUsdt.toFixed(1)}`;
      out.push({
        time: tEx,
        position: t.side === "long" ? "aboveBar" : "belowBar",
        color: "#34d399",
        shape: "circle",
        text: `#${t.id} TP ${pnlStr} USDT`,
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
