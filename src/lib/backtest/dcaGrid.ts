/**
 * Расчёт факторной DCA-сетки: цены уровней, объёмы, средняя цена, TP, приблизительная ликвидация.
 */

import type { DcaBotSettings, DcaGridResult, DcaGridRow, TradeDirection } from "./types";
import { approxLiquidationPrice, effectiveLiquidationLeverage } from "./risk";

/**
 * Строит сетку из `ordersCount` ордеров от первой цены входа.
 * Общий диапазон цены от первого до последнего уровня = priceOverlapPct% от первой цены (в сторону усреднения).
 *
 * Расстояния между соседними уровнями растут в геометрической прогрессии с множителем priceFactor.
 * Объёмы ордеров в USDT: каждый следующий умножается на volumeFactor.
 */
export function buildDcaGrid(
  side: TradeDirection,
  firstEntryPrice: number,
  settings: DcaBotSettings,
): DcaGridResult {
  const {
    ordersCount,
    priceOverlapPct,
    priceFactor,
    volumeFactor,
    takeProfitPct,
    leverage,
    startDepositUsdt,
    firstOrderDepositPct,
  } = settings;

  const liqLeverage = effectiveLiquidationLeverage(settings);

  const firstOrderUsdt = (startDepositUsdt * firstOrderDepositPct) / 100;

  if (
    ordersCount < 1 ||
    firstEntryPrice <= 0 ||
    !Number.isFinite(firstEntryPrice) ||
    priceOverlapPct <= 0 ||
    !Number.isFinite(firstOrderUsdt) ||
    firstOrderUsdt <= 0
  ) {
    return {
      side,
      firstEntryPrice,
      rows: [],
    };
  }

  const totalLevels = Math.max(1, Math.floor(ordersCount));
  const overlapAbs =
    side === "long"
      ? firstEntryPrice * (priceOverlapPct / 100)
      : firstEntryPrice * (priceOverlapPct / 100);

  /** Интервалов между уровнями = totalLevels - 1 */
  const intervals = Math.max(0, totalLevels - 1);
  const rows: DcaGridRow[] = [];

  /** Геометрические шаги сырья (в долларах движения цены), сумма = overlapAbs */
  let stepWeights: number[] = [];
  if (intervals === 0) {
    stepWeights = [];
  } else if (Math.abs(priceFactor - 1) < 1e-12) {
    const w = 1 / intervals;
    stepWeights = Array.from({ length: intervals }, () => overlapAbs * w);
  } else {
    /** Сумма геом. прогрессии: a + a*r + ... = a * (r^n - 1)/(r - 1) = overlapAbs */
    const r = priceFactor;
    const n = intervals;
    const sumGeom = (r ** n - 1) / (r - 1);
    const a = overlapAbs / sumGeom;
    stepWeights = [];
    for (let k = 0; k < intervals; k++) {
      stepWeights.push(a * r ** k);
    }
  }

  /** Цены уровней */
  const prices: number[] = [];
  prices.push(firstEntryPrice);
  for (let k = 0; k < intervals; k++) {
    const step = stepWeights[k] ?? 0;
    const prev = prices[prices.length - 1]!;
    const next =
      side === "long" ? prev - step : prev + step;
    prices.push(next);
  }

  /** Объёмы USDT по уровням */
  const notionals: number[] = [];
  for (let i = 0; i < totalLevels; i++) {
    const usdt = firstOrderUsdt * volumeFactor ** i;
    notionals.push(usdt);
  }

  let cumQty = 0;
  let cumNotional = 0;

  for (let i = 0; i < totalLevels; i++) {
    const price = prices[i]!;
    const orderUsdt = notionals[i]!;
    const qty = orderUsdt / price;
    cumQty += qty;
    cumNotional += orderUsdt;
    const avgPrice = cumNotional / cumQty;
    const tpRaw =
      side === "long"
        ? avgPrice * (1 + takeProfitPct / 100)
        : avgPrice * (1 - takeProfitPct / 100);
    const liq = approxLiquidationPrice(side, avgPrice, liqLeverage);
    const drawdownFromFirstPct =
      side === "long"
        ? ((firstEntryPrice - avgPrice) / firstEntryPrice) * 100
        : ((avgPrice - firstEntryPrice) / firstEntryPrice) * 100;
    const marginUsed = cumNotional / leverage;

    rows.push({
      orderIndex: i + 1,
      price,
      orderUsdt,
      qtyCoin: qty,
      cumNotionalUsdt: cumNotional,
      avgPrice,
      takeProfitPrice: tpRaw,
      approxLiquidationPrice: liq,
      drawdownFromFirstPct,
      marginUsedUsdt: marginUsed,
    });
  }

  return {
    side,
    firstEntryPrice,
    rows,
  };
}
