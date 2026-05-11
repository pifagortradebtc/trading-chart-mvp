/**
 * Уровни цен для отображения на графике (DCA, TP, ликвидация).
 * Средняя цена после усреднений рисуется отдельно отрезком entry→exit в ChartHost.
 */

import type { DcaGridRow, TradeRecord } from "./types";

export type OverlayLevelKind = "entry" | "dca" | "tp" | "liq";

/** Упрощённая цена ликвидации на графике не показываем при кроссе (залог на всём счёте — не моделируем как изолированную линию). */
function shouldDrawLiquidationLevel(tr: TradeRecord, last: DcaGridRow): boolean {
  if (tr.marginMode === "cross") return false;
  const liq = last.approxLiquidationPrice;
  const avg = last.avgPrice;
  if (!Number.isFinite(liq) || !Number.isFinite(avg) || avg <= 0) return false;
  if (tr.side === "long") return liq < avg;
  return liq > avg;
}

export interface ChartOverlayLevel {
  price: number;
  label: string;
  color: string;
  kind: OverlayLevelKind;
}

export function buildChartLevelsFromTrade(tr: TradeRecord): ChartOverlayLevel[] {
  const levels: ChartOverlayLevel[] = [];
  const rows = tr.dcaGrid?.rows ?? [];

  for (const r of rows) {
    levels.push({
      price: r.price,
      label: r.orderIndex === 1 ? "Вход 1" : `DCA ${r.orderIndex}`,
      color: r.orderIndex === 1 ? "#22c55e" : "#f59e0b",
      kind: r.orderIndex === 1 ? "entry" : "dca",
    });
  }

  const last = rows[rows.length - 1];
  if (last) {
    levels.push({
      price: last.takeProfitPrice,
      label: "Take profit",
      color: "#34d399",
      kind: "tp",
    });
    if (shouldDrawLiquidationLevel(tr, last)) {
      levels.push({
        price: last.approxLiquidationPrice,
        label: "Ликвидация ~",
        color: "#ef4444",
        kind: "liq",
      });
    }
  }

  return levels;
}
