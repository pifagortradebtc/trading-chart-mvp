/**
 * Маржа, приблизительная цена ликвидации, просадки.
 */

import type { DcaBotSettings, TradeDirection } from "./types";

/**
 * Эффективное плечо для упрощённой формулы ликвидации при кросс-марже:
 * считаем, что доступный залог для позиции масштабируется как walletBalanceUsdt / startDepositUsdt
 * при том же номинальном плече биржи → цена ликвидации смещается как при более высоком L.
 * При marginMode === isolated возвращается dca.leverage.
 */
export function effectiveLiquidationLeverage(dca: DcaBotSettings): number {
  const L = dca.leverage;
  if (dca.marginMode !== "cross") return L;
  const w = dca.walletBalanceUsdt;
  const base = dca.startDepositUsdt;
  if (!Number.isFinite(L) || L <= 0) return L;
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(base) || base <= 0) return L;
  const ratio = Math.max(w / base, 1);
  return L * ratio;
}

/** Доступная маржа (USDT) для проверки первого ордера: при кроссе — полный кошелёк, при изолированной — equity стратегии. */
export function maxMarginAvailableUsdt(dca: DcaBotSettings, strategyEquity: number): number {
  if (
    dca.marginMode === "cross" &&
    Number.isFinite(dca.walletBalanceUsdt) &&
    dca.walletBalanceUsdt > 0
  ) {
    return dca.walletBalanceUsdt;
  }
  return strategyEquity;
}

/**
 * Упрощённая маржа без учёта сложного MM биржи:
 * LONG: ликвидация когда unrealized loss ≈ начальная маржа → P ≈ entry * (1 - 1/L).
 * SHORT: зеркально P ≈ entry * (1 + 1/L).
 *
 * Параметр `leverage` передавайте как `effectiveLiquidationLeverage(dca)` для кросс-сценария.
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
