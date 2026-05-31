/**
 * Отрезки уровней DCA, средней цены входа и take-profit на интервале «сигнал → выход».
 */

import { LineStyle, type LineWidth, type Time } from "lightweight-charts";
import type { TradeRecord } from "./types";

export type DcaSegmentKind = "entry" | "dca" | "avg" | "tp" | "sl";

export interface DcaSegmentSpec {
  t0: Time;
  t1: Time;
  price: number;
  color: string;
  lineWidth: LineWidth;
  lineStyle: LineStyle;
  kind: DcaSegmentKind;
}

const ENTRY_COLOR = "#22c55e";
const DCA_COLORS = ["#f59e0b", "#fb923c", "#fbbf24", "#d97706", "#92400e", "#78350f"];
/** Те же цвета, что и для горизонтальных уровней (см. chartOverlayLevels.ts). */
const AVG_COLOR = "#a78bfa"; // светло-фиолетовый, видно поверх свечей
const TP_COLOR = "#34d399"; // emerald — отдельный оттенок зелёного, не путать с entry
const SL_COLOR = "#f87171"; // светло-красный — отличается от ликвидации (более тёмная)

/** Макс. число сделок с отрисовкой сетки (последние по порядку в массиве), чтобы не завис график. */
export const MAX_TRADES_FOR_DCA_SEGMENTS = 48;

/** @deprecated используйте MAX_TRADES_FOR_DCA_SEGMENTS */
export const MAX_TP_TRADES_FOR_DCA_SEGMENTS = MAX_TRADES_FOR_DCA_SEGMENTS;

/**
 * Сегменты горизонталей на интервале «сигнал → выход» для каждой сделки:
 *   1) полная лимитная сетка из `dcaGrid.rows` (вход + DCA N);
 *   2) фактическая средняя цена позиции (AVG, по `maxDcaIndex`) — только если усреднились >1 раза;
 *   3) TP по этой же фактической средней (пунктир, эмеральд) — куда реально закрылась бы позиция.
 *
 * AVG/TP считаются на актуальном row (rows[maxDcaIndex - 1]), а не на последнем row полной сетки,
 * чтобы цели соответствовали фактическому набору исполненных усреднений.
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
        lineStyle: LineStyle.Solid,
        kind: isFirst ? "entry" : "dca",
      });
    }

    const filledCount = Math.max(1, t.maxDcaIndex);
    const actualRow = rows[filledCount - 1] ?? rows[rows.length - 1];
    if (actualRow) {
      if (filledCount > 1) {
        specs.push({
          t0,
          t1,
          price: actualRow.avgPrice,
          color: AVG_COLOR,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          kind: "avg",
        });
      }
      specs.push({
        t0,
        t1,
        price: actualRow.takeProfitPrice,
        color: TP_COLOR,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        kind: "tp",
      });
      /** SL по фактической средней — только если стоп задан в настройках (stopLossPct > 0). */
      if (actualRow.stopLossPrice != null && Number.isFinite(actualRow.stopLossPrice)) {
        specs.push({
          t0,
          t1,
          price: actualRow.stopLossPrice,
          color: SL_COLOR,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          kind: "sl",
        });
      }
    }
  }

  return specs;
}
