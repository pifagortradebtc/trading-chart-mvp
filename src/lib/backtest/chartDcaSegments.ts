/**
 * Отрезки уровней лимитной сетки DCA только на интервале «сигнал → выход по TP».
 */

import type { LineWidth, Time } from "lightweight-charts";
import type { TradeRecord } from "./types";

export interface DcaSegmentSpec {
  t0: Time;
  t1: Time;
  price: number;
  color: string;
  lineWidth: LineWidth;
}

const ENTRY_COLOR = "#22c55e";
const DCA_COLORS = ["#f59e0b", "#fb923c", "#fbbf24", "#d97706", "#92400e", "#78350f"];

/** Макс. число сделок с отрисовкой сетки (последние по порядку в массиве), чтобы не завис график. */
export const MAX_TRADES_FOR_DCA_SEGMENTS = 48;

/** @deprecated используйте MAX_TRADES_FOR_DCA_SEGMENTS */
export const MAX_TP_TRADES_FOR_DCA_SEGMENTS = MAX_TRADES_FOR_DCA_SEGMENTS;

/**
 * Сегменты горизонталей: от бара сигнала до выхода по любой причине.
 * Уровни — полная лимитная сетка из настроек DCA (`dcaGrid.rows`).
 */
export function buildDcaSegmentSpecs(trades: TradeRecord[]): DcaSegmentSpec[] {
  const capped =
    trades.length <= MAX_TRADES_FOR_DCA_SEGMENTS
      ? trades
      : trades.slice(-MAX_TRADES_FOR_DCA_SEGMENTS);

  const specs: DcaSegmentSpec[] = [];

  for (const t of capped) {
    const t0 = Math.floor(t.entrySignalTime / 1000) as Time;
    let t1 = Math.floor(t.exitTime / 1000) as Time;
    if ((t1 as number) <= (t0 as number)) {
      t1 = ((t0 as number) + 1) as Time;
    }

    const rows = t.dcaGrid?.rows ?? [];
    for (const r of rows) {
      const isFirst = r.orderIndex === 1;
      specs.push({
        t0,
        t1,
        price: r.price,
        color: isFirst ? ENTRY_COLOR : DCA_COLORS[(r.orderIndex - 2) % DCA_COLORS.length]!,
        lineWidth: isFirst ? 2 : 1,
      });
    }
  }

  return specs;
}
