/**
 * Уровни цен для отображения на графике (DCA, TP, средняя, ликвидация).
 */

import type { TradeRecord } from "./types";

export type OverlayLevelKind = "entry" | "dca" | "tp" | "avg" | "liq";

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
      price: last.avgPrice,
      label: "Средняя",
      color: "#38bdf8",
      kind: "avg",
    });
    levels.push({
      price: last.takeProfitPrice,
      label: "Take profit",
      color: "#34d399",
      kind: "tp",
    });
    levels.push({
      price: last.approxLiquidationPrice,
      label: "Ликвидация ~",
      color: "#ef4444",
      kind: "liq",
    });
  }

  return levels;
}
