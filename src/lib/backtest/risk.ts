/**
 * Маржа, приблизительная цена ликвидации (изолированная маржа), просадки.
 */

import type { TradeDirection } from "./types";

/**
 * Упрощённая изолированная маржа без учёта maintenance buffer:
 * LONG: ликвидация когда unrealized loss ≈ начальная маржа → P ≈ entry * (1 - 1/L).
 * SHORT: зеркально P ≈ entry * (1 + 1/L).
 *
 * Для реальных бирж добавьте mmRate и буфер — здесь базовая оценка для бэктеста.
 */
export function approxLiquidationPrice(
  side: TradeDirection,
  avgEntry: number,
  leverage: number,
  maintenanceMarginRate = 0.004,
): number {
  if (!Number.isFinite(avgEntry) || avgEntry <= 0 || leverage <= 0) return NaN;
  /** Упрощение: учитываем только IM и без MM для крайней простоты; mm слегка сдвигает liq */
  const imFrac = 1 / leverage;
  if (side === "long") {
    return avgEntry * (1 - imFrac + maintenanceMarginRate);
  }
  return avgEntry * (1 + imFrac - maintenanceMarginRate);
}

/** Нереализованный PnL в USDT для позиции в монете */
export function unrealizedPnlUsdt(
  side: TradeDirection,
  avgEntry: number,
  qty: number,
  markPrice: number,
): number {
  if (side === "long") return qty * (markPrice - avgEntry);
  return qty * (avgEntry - markPrice);
}
