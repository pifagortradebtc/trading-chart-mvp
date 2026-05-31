/**
 * DCA-сетка: для LONG — как в Pine `ChaykKelt_OTKATOM_BACK_V2` (`f_initGrid`);
 * для SHORT — прежняя геометрия по overlap (редкий режим).
 */

import type { DcaBotSettings, DcaGridResult, DcaGridRow, TradeDirection } from "./types";
import { approxLiquidationPrice, effectiveLiquidationLeverage } from "./risk";

/**
 * Pine `f_initGrid(price)` для лонга: сумма USDT по ордерам = `marginPerTrade`,
 * цены от anchor вниз по нормированным весам (priceCoef).
 */
export function buildDcaGridPineOtkatomLong(anchorPrice: number, settings: DcaBotSettings): DcaGridResult {
  const side: TradeDirection = "long";
  const {
    ordersCount,
    priceOverlapPct,
    priceFactor,
    volumeFactor,
    takeProfitPct,
    leverage,
    gridTotalNotionalUsdt,
    startDepositUsdt,
  } = settings;

  const marginPerTrade = gridTotalNotionalUsdt ?? startDepositUsdt;
  const gridOrders = Math.max(1, Math.floor(ordersCount));
  const F = priceFactor;
  const M = volumeFactor;

  const liqLeverage = effectiveLiquidationLeverage(settings);

  if (
    anchorPrice <= 0 ||
    !Number.isFinite(anchorPrice) ||
    priceOverlapPct <= 0 ||
    !Number.isFinite(marginPerTrade) ||
    marginPerTrade <= 0
  ) {
    return { side, firstEntryPrice: anchorPrice, rows: [] };
  }

  const lowestPrice = anchorPrice * (1 - priceOverlapPct / 100);
  const priceRange = anchorPrice - lowestPrice;

  let coefSum: number;
  if (gridOrders <= 1) {
    coefSum = 1;
  } else if (Math.abs(F - 1) < 1e-12) {
    coefSum = gridOrders - 1;
  } else {
    coefSum = (F ** (gridOrders - 1) - 1) / (F - 1);
  }

  let volumeCoefSum: number;
  if (Math.abs(M - 1) < 1e-12) {
    volumeCoefSum = gridOrders;
  } else {
    volumeCoefSum = (M ** gridOrders - 1) / (M - 1);
  }

  const baseQtyUsdt = marginPerTrade / volumeCoefSum;

  const prices: number[] = [];
  const notionals: number[] = [];

  for (let i = 0; i < gridOrders; i++) {
    let priceCoef_i: number;
    if (Math.abs(F - 1) < 1e-12) {
      priceCoef_i = i;
    } else {
      priceCoef_i = (F ** i - 1) / (F - 1);
    }
    const normalized = coefSum > 0 ? priceCoef_i / coefSum : 0;
    const price_i = anchorPrice - priceRange * normalized;
    prices.push(price_i);

    const volumeCoef_i = M ** i;
    notionals.push(baseQtyUsdt * volumeCoef_i);
  }

  let cumQty = 0;
  let cumNotional = 0;
  const rows: DcaGridRow[] = [];

  for (let i = 0; i < gridOrders; i++) {
    const price = prices[i]!;
    const orderUsdt = notionals[i]!;
    const qty = orderUsdt / price;
    cumQty += qty;
    cumNotional += orderUsdt;
    const avgPrice = cumNotional / cumQty;
    const tpRaw = avgPrice * (1 + takeProfitPct / 100);
    /** SL для LONG: ниже средней на stopLossPct% (если задан). */
    const slRaw =
      settings.stopLossPct != null && settings.stopLossPct > 0
        ? avgPrice * (1 - settings.stopLossPct / 100)
        : undefined;
    const liq = approxLiquidationPrice("long", avgPrice, liqLeverage);
    const drawdownFromFirstPct = ((anchorPrice - avgPrice) / anchorPrice) * 100;
    const marginUsed = cumNotional / leverage;

    rows.push({
      orderIndex: i + 1,
      price,
      orderUsdt,
      qtyCoin: qty,
      cumNotionalUsdt: cumNotional,
      avgPrice,
      takeProfitPrice: tpRaw,
      stopLossPrice: slRaw,
      approxLiquidationPrice: liq,
      drawdownFromFirstPct,
      marginUsedUsdt: marginUsed,
    });
  }

  return {
    side,
    firstEntryPrice: anchorPrice,
    rows,
  };
}

/** Прежняя сетка (overlap + первый ордер % от депозита) — для SHORT. */
function buildDcaGridLegacyShort(
  firstEntryPrice: number,
  settings: DcaBotSettings,
): DcaGridResult {
  const side: TradeDirection = "short";
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
    return { side, firstEntryPrice, rows: [] };
  }

  const totalLevels = Math.max(1, Math.floor(ordersCount));
  const overlapAbs = firstEntryPrice * (priceOverlapPct / 100);
  const intervals = Math.max(0, totalLevels - 1);
  let stepWeights: number[] = [];
  if (intervals === 0) {
    stepWeights = [];
  } else if (Math.abs(priceFactor - 1) < 1e-12) {
    const w = 1 / intervals;
    stepWeights = Array.from({ length: intervals }, () => overlapAbs * w);
  } else {
    const r = priceFactor;
    const n = intervals;
    const sumGeom = (r ** n - 1) / (r - 1);
    const a = overlapAbs / sumGeom;
    stepWeights = [];
    for (let k = 0; k < intervals; k++) {
      stepWeights.push(a * r ** k);
    }
  }

  const prices: number[] = [firstEntryPrice];
  for (let k = 0; k < intervals; k++) {
    const step = stepWeights[k] ?? 0;
    const prev = prices[prices.length - 1]!;
    prices.push(prev + step);
  }

  const notionals: number[] = [];
  for (let i = 0; i < totalLevels; i++) {
    notionals.push(firstOrderUsdt * volumeFactor ** i);
  }

  let cumQty = 0;
  let cumNotional = 0;
  const rows: DcaGridRow[] = [];

  for (let i = 0; i < totalLevels; i++) {
    const price = prices[i]!;
    const orderUsdt = notionals[i]!;
    const qty = orderUsdt / price;
    cumQty += qty;
    cumNotional += orderUsdt;
    const avgPrice = cumNotional / cumQty;
    const tpRaw = avgPrice * (1 - takeProfitPct / 100);
    /** SL для SHORT: выше средней на stopLossPct%. */
    const slRaw =
      settings.stopLossPct != null && settings.stopLossPct > 0
        ? avgPrice * (1 + settings.stopLossPct / 100)
        : undefined;
    const liq = approxLiquidationPrice("short", avgPrice, liqLeverage);
    const drawdownFromFirstPct = ((avgPrice - firstEntryPrice) / firstEntryPrice) * 100;
    const marginUsed = cumNotional / leverage;

    rows.push({
      orderIndex: i + 1,
      price,
      orderUsdt,
      qtyCoin: qty,
      cumNotionalUsdt: cumNotional,
      avgPrice,
      takeProfitPrice: tpRaw,
      stopLossPrice: slRaw,
      approxLiquidationPrice: liq,
      drawdownFromFirstPct,
      marginUsedUsdt: marginUsed,
    });
  }

  return { side, firstEntryPrice, rows };
}

export function buildDcaGrid(
  side: TradeDirection,
  firstEntryPrice: number,
  settings: DcaBotSettings,
): DcaGridResult {
  if (side === "long") {
    return buildDcaGridPineOtkatomLong(firstEntryPrice, settings);
  }
  return buildDcaGridLegacyShort(firstEntryPrice, settings);
}
