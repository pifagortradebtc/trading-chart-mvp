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
  if (t.exitReason === "signal") return `#${t.id} сигнал ${pnlStr} USDT`;
  /** end_of_test = висящая позиция: PnL нереализованный, не закрытая. */
  return `#${t.id} OPEN ${pnlStr} USDT (нереализ.)`;
}

function exitMarkerColor(reason: TradeRecord["exitReason"]): string {
  if (reason === "tp") return "#34d399";
  /** Висящая позиция — нейтральный янтарный, не красный (это не убыток). */
  if (reason === "end_of_test") return "#fbbf24";
  return "#f87171";
}

/** Форматируем USDT-объём ордера: «1234», «50», «5.5», «0.7» — округление зависит от размера. */
function formatOrderUsdt(usdt: number): string {
  if (!Number.isFinite(usdt) || usdt <= 0) return "";
  if (usdt >= 100) return Math.round(usdt).toString();
  if (usdt >= 10) return usdt.toFixed(1);
  return usdt.toFixed(2);
}

/**
 * Сигнал индикатора — стрелка на баре entrySignalTime (текст: id и USDT первого ордера).
 * Оранжевые точки — факт исполнения следующих лимиток (DCA N), если есть `dcaFillTimesMs`;
 * каждая точка подписана объёмом ордера в USDT, чтобы видеть распределение сетки.
 * Выход — TP (зелёный) или иная причина (красный), с PnL.
 */
export function buildBacktestChartMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];

  for (const t of trades) {
    const tSig = Math.floor(t.entrySignalTime / 1000) as Time;
    const rows = t.dcaGrid?.rows ?? [];
    const firstUsdtStr = formatOrderUsdt(rows[0]?.orderUsdt ?? 0);
    out.push({
      time: tSig,
      position: t.side === "long" ? "belowBar" : "aboveBar",
      color: "#22c55e",
      shape: t.side === "long" ? "arrowUp" : "arrowDown",
      text: firstUsdtStr ? `#${t.id} · ${firstUsdtStr} USDT` : `#${t.id}`,
    });

    const fills = t.dcaFillTimesMs;
    if (fills && fills.length > 1) {
      for (let i = 1; i < fills.length; i++) {
        const tm = Math.floor(fills[i]! / 1000) as Time;
        const level = i + 1;
        const usdtStr = formatOrderUsdt(rows[level - 1]?.orderUsdt ?? 0);
        out.push({
          time: tm,
          position: t.side === "long" ? "belowBar" : "aboveBar",
          color: "#f59e0b",
          shape: "circle",
          text: usdtStr ? `DCA ${level} · ${usdtStr} USDT` : `DCA ${level}`,
        });
      }
    }

    /**
     * Все exit-причины рисуем всегда — пользователю важно видеть где сделка закрылась,
     * иначе создаётся впечатление что бот не закрывает позиции. Раньше в session-режиме
     * (multi-trade) отрисовывались только tp/signal/end_of_test, а sl/liquidation
     * молча скрывались — это вводило в заблуждение.
     */
    const tEx = Math.floor(t.exitTime / 1000) as Time;
    out.push({
      time: tEx,
      position: t.side === "long" ? "aboveBar" : "belowBar",
      color: exitMarkerColor(t.exitReason),
      shape: "circle",
      text: exitMarkerText(t),
    });
  }

  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
}

/** @deprecated используйте buildBacktestChartMarkers */
export function buildTradeMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  return buildBacktestChartMarkers(trades);
}
