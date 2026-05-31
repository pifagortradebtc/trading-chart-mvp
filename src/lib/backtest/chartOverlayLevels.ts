/**
 * Уровни цен для отображения на графике (DCA, TP, ликвидация).
 * Средняя цена после усреднений рисуется отрезком entry→exit в ChartHost.
 */

import type { DcaGridRow, TradeRecord } from "./types";

export type OverlayLevelKind = "entry" | "dca" | "avg" | "tp" | "liq";

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

const DCA_COLORS = ["#f59e0b", "#fb923c", "#fbbf24", "#d97706", "#92400e", "#78350f"];

function levelsFromTrade(tr: TradeRecord, idPrefix: string): ChartOverlayLevel[] {
  const levels: ChartOverlayLevel[] = [];
  const rows = tr.dcaGrid?.rows ?? [];

  for (const r of rows) {
    const isFirst = r.orderIndex === 1;
    levels.push({
      price: r.price,
      label: isFirst
        ? `${idPrefix}Вход 1`
        : `${idPrefix}DCA ${r.orderIndex}`,
      color: isFirst ? "#22c55e" : DCA_COLORS[(r.orderIndex - 2) % DCA_COLORS.length]!,
      kind: isFirst ? "entry" : "dca",
    });
  }

  // Берём row по **фактически** заполненным уровням — это позиция реально
  // сложилась после maxDcaIndex исполнений. avg и TP относительно неё,
  // а не относительно гипотетической полной сетки.
  const filledCount = Math.max(1, tr.maxDcaIndex);
  const actualRow = rows[filledCount - 1] ?? rows[rows.length - 1];

  if (actualRow) {
    // Средняя цена входа после фактических усреднений. Показываем только
    // если усреднений было больше одного (иначе avg == entry, дублируем).
    if (filledCount > 1) {
      levels.push({
        price: actualRow.avgPrice,
        label: idPrefix ? `${idPrefix}AVG` : "Средняя",
        color: "#8b5cf6", // violet — выделяется среди entry/dca/tp/liq
        kind: "avg",
      });
    }

    // TP по фактической средней — куда реально закроется позиция.
    // Раньше брали last row (полная сетка), что давало неточный TP, если
    // не все DCA заполнились.
    levels.push({
      price: actualRow.takeProfitPrice,
      label: idPrefix ? `${idPrefix}TP` : "Take profit",
      color: "#34d399",
      kind: "tp",
    });

    if (shouldDrawLiquidationLevel(tr, actualRow)) {
      levels.push({
        price: actualRow.approxLiquidationPrice,
        label: idPrefix ? `${idPrefix}Ликвидация ~` : "Ликвидация ~",
        color: "#ef4444",
        kind: "liq",
      });
    }
  }

  return levels;
}

/** Одна сделка (детальный просмотр): подписи без номера сделки. */
export function buildChartLevelsFromTrade(tr: TradeRecord): ChartOverlayLevel[] {
  return levelsFromTrade(tr, "");
}

/** Весь прогон бэктеста: уровни лимитной сетки и TP по каждой сделке с префиксом #id. */
export function buildSessionChartLevels(trades: TradeRecord[]): ChartOverlayLevel[] {
  const out: ChartOverlayLevel[] = [];
  for (const tr of trades) {
    out.push(...levelsFromTrade(tr, `#${tr.id} `));
  }
  return out;
}
