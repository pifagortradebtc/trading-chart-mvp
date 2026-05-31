/**
 * Вычисление сигналов BuyForce (long) и SellForce (short) для backtest.
 *
 * Формулы (ровно как в продакшен-индикаторе Pifagor + Hermes):
 *   BuyForce  RO = (bid_3 − ask_8) / ask_1.5    →  RO > zero_level = long
 *   SellForce RO = (ask_3 − bid_8) / bid_1.5    →  RO > zero_level = short
 *
 * Триггер: ребро (edge) — `prev_ro <= zero_level AND curr_ro > zero_level`.
 * Один сигнал на одно пересечение. Пока RO остаётся > zero_level — повторных
 * сигналов нет. Когда RO снова ≤ zero_level и потом опять > zero_level — следующий.
 *
 * Если для свечи нет depth-данных (timestamps OHLCV и depth не совпали или
 * snapshot отсутствует) — RO=NaN, prev_ro не двигается, сигнала нет.
 *
 * Cooldown — те же бары что и для Chaikin: после сигнала следующий нельзя
 * выдавать в течение `cooldownBars` следующих свечей.
 */

import type { Candle } from "@/types/candle";
import type { DepthBar } from "./depthTypes";

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface BuyForceSettings {
  /** Уровень нуля — над ним RO считается «бычьим» и триггерит сигнал. */
  zeroLevel: number;
  /** Минимум баров между сигналами (как в Chaikin). */
  cooldownBars: number;
}

export interface SellForceSettings {
  zeroLevel: number;
  cooldownBars: number;
}

export const DEFAULT_BUYFORCE_SETTINGS: BuyForceSettings = {
  zeroLevel: 0,
  cooldownBars: 1,
};

export const DEFAULT_SELLFORCE_SETTINGS: SellForceSettings = {
  zeroLevel: 0,
  cooldownBars: 1,
};

// ─── Compute RO ───────────────────────────────────────────────────────────────

/** BuyForce: положительное → bid близкий давит, дальний ask слабее → buy. */
export function computeBuyForceRo(b: DepthBar): number {
  if (!b.ask_1_5 || b.ask_1_5 === 0) return Number.NaN;
  return (b.bid_3 - b.ask_8) / b.ask_1_5;
}

/** SellForce: положительное → ask близкий давит, дальний bid слабее → sell. */
export function computeSellForceRo(b: DepthBar): number {
  if (!b.bid_1_5 || b.bid_1_5 === 0) return Number.NaN;
  return (b.ask_3 - b.bid_8) / b.bid_1_5;
}

// ─── Signal computation ───────────────────────────────────────────────────────

export interface DepthSignalResult {
  /** RO значение для каждой свечи (NaN если нет depth-бара). */
  ro: number[];
  /** Активен ли сигнал на этом баре (edge cross ↑). */
  active: boolean[];
  /** Сколько баров с depth-данными (для метрики качества) */
  depthBarsAvailable: number;
  /** Сколько баров пустых (для метрики качества) */
  missingDepth: number;
}

function indexDepthByTime(bars: DepthBar[]): Map<number, DepthBar> {
  const m = new Map<number, DepthBar>();
  for (const b of bars) m.set(b.t, b);
  return m;
}

/**
 * Универсальный расчёт edge-trigger по любой RO-формуле.
 * Используется и для BuyForce, и для SellForce.
 */
function computeEdgeSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  computeRo: (b: DepthBar) => number,
  zeroLevel: number,
  cooldownBars: number,
): DepthSignalResult {
  const byT = indexDepthByTime(depthBars);
  const n = candles.length;
  const ro = new Array<number>(n).fill(Number.NaN);
  const active = new Array<boolean>(n).fill(false);

  let prevRo = Number.NaN;
  let lastSignalIdx = -Infinity;
  let depthBarsAvailable = 0;
  let missingDepth = 0;

  for (let i = 0; i < n; i++) {
    const candle = candles[i];
    // candle.time — unix seconds (lightweight-charts convention)
    const depth = byT.get(candle.time);
    if (!depth) {
      missingDepth++;
      // Не двигаем prev_ro: оставляем как было, чтобы edge на следующем
      // baren с данными считался относительно последнего известного RO.
      continue;
    }
    depthBarsAvailable++;
    const currRo = computeRo(depth);
    ro[i] = currRo;

    if (Number.isFinite(prevRo) && Number.isFinite(currRo)) {
      const crossedUp = prevRo <= zeroLevel && currRo > zeroLevel;
      if (crossedUp && i - lastSignalIdx > cooldownBars) {
        active[i] = true;
        lastSignalIdx = i;
      }
    }
    if (Number.isFinite(currRo)) prevRo = currRo;
  }

  return { ro, active, depthBarsAvailable, missingDepth };
}

/**
 * Сигналы BuyForce (long-only стратегия): RO пересёк zero_level снизу вверх.
 */
export function computeBuyForceSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  settings: BuyForceSettings,
): DepthSignalResult {
  return computeEdgeSignals(
    candles,
    depthBars,
    computeBuyForceRo,
    settings.zeroLevel,
    Math.max(0, Math.floor(settings.cooldownBars)),
  );
}

/**
 * Сигналы SellForce (short-only стратегия): RO пересёк zero_level снизу вверх.
 */
export function computeSellForceSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  settings: SellForceSettings,
): DepthSignalResult {
  return computeEdgeSignals(
    candles,
    depthBars,
    computeSellForceRo,
    settings.zeroLevel,
    Math.max(0, Math.floor(settings.cooldownBars)),
  );
}

// ─── BidAsk Spread (классический индикатор из Pifagor Trade Limits) ─────────

/**
 * BidAsk Spread: простая разница объёмов стакана в радиусах X% и Y%.
 *
 * Формула в исходном TV-индикаторе (bid-ask.js, файл pifagor-trade-website-2):
 *   value = bid_<bidRadius>%  −  ask_<askRadius>%     (в USDT, raw subtraction)
 *
 * Дефолты в Pifagor Trade Limits:
 *   bidRadius = 1.5%   askRadius = 8%   threshold = 0
 *
 * Семантика:
 *   value > threshold  → bid-сторона давит сильнее → BUY-сигнал (LONG)
 *   value < threshold  → ask-сторона давит сильнее → SELL-сигнал (SHORT)
 *
 * Опционально: SMA-сглаживание по `smoothingLength` баров (отдельно для bid_X
 * и ask_Y, потом разница) — повторяет логику TV-индикатора с 2-sided SMA.
 */
export type DepthRadius = 1.5 | 3 | 8;
export type BidAskSpreadSignalMode = "long_above" | "short_above" | "both";

export interface BidAskSpreadSettings {
  /** Радиус bid-объёма в % от mid-price. Доступны те, что есть в DepthBar: 1.5 / 3 / 8. */
  bidRadiusPct: DepthRadius;
  /** Радиус ask-объёма в % от mid-price. */
  askRadiusPct: DepthRadius;
  /** Уровень порога в USDT (raw разность). По умолчанию 0. */
  threshold: number;
  /**
   * SMA-сглаживание (длина в барах). 1 = без сглаживания. Применяется отдельно
   * к bid- и ask-сериям до взятия разности (как в TV-индикаторе).
   */
  smoothingLength: number;
  /**
   * Что считать сигналом:
   *  • long_above  — value > threshold → LONG (default)
   *  • short_above — value > threshold → SHORT (инверсия для bear-формул)
   *  • both        — > → LONG, < → SHORT (двусторонний для AUTO-режима)
   */
  signalMode: BidAskSpreadSignalMode;
  cooldownBars: number;
}

export const DEFAULT_BIDASK_SPREAD: BidAskSpreadSettings = {
  bidRadiusPct: 1.5,
  askRadiusPct: 8,
  threshold: 0,
  smoothingLength: 1,
  signalMode: "long_above",
  cooldownBars: 1,
};

function depthFieldByRadius(b: DepthBar, side: "bid" | "ask", radius: DepthRadius): number {
  if (side === "bid") {
    if (radius === 1.5) return b.bid_1_5;
    if (radius === 3) return b.bid_3;
    return b.bid_8;
  }
  if (radius === 1.5) return b.ask_1_5;
  if (radius === 3) return b.ask_3;
  return b.ask_8;
}

/**
 * Trailing SMA в окне `len`. На undefined/NaN — возвращает NaN.
 * Используется для сглаживания bid/ask серии до взятия разности.
 */
function smaArray(values: number[], len: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(Number.NaN);
  if (len <= 1) {
    for (let i = 0; i < n; i++) out[i] = values[i]!;
    return out;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
    if (i >= len) {
      const drop = values[i - len]!;
      if (Number.isFinite(drop)) {
        sum -= drop;
        count--;
      }
    }
    if (count === len) out[i] = sum / len;
  }
  return out;
}

export interface BidAskSpreadSignals {
  long: boolean[];
  short: boolean[];
  value: number[];
  depthBarsAvailable: number;
  missingDepth: number;
}

export function computeBidAskSpreadSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  settings: BidAskSpreadSettings,
): BidAskSpreadSignals {
  const byT = indexDepthByTime(depthBars);
  const n = candles.length;
  const bidSeries = new Array<number>(n).fill(Number.NaN);
  const askSeries = new Array<number>(n).fill(Number.NaN);
  let depthBarsAvailable = 0;
  let missingDepth = 0;

  for (let i = 0; i < n; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const depth = byT.get(candle.time);
    if (!depth) {
      missingDepth++;
      continue;
    }
    depthBarsAvailable++;
    bidSeries[i] = depthFieldByRadius(depth, "bid", settings.bidRadiusPct);
    askSeries[i] = depthFieldByRadius(depth, "ask", settings.askRadiusPct);
  }

  const smoothLen = Math.max(1, Math.floor(settings.smoothingLength));
  const bidSmoothed = smaArray(bidSeries, smoothLen);
  const askSmoothed = smaArray(askSeries, smoothLen);
  const value: number[] = bidSmoothed.map((b, i) => {
    const a = askSmoothed[i]!;
    if (!Number.isFinite(b) || !Number.isFinite(a)) return Number.NaN;
    return b - a;
  });

  const long = new Array<boolean>(n).fill(false);
  const short = new Array<boolean>(n).fill(false);
  let prevVal = Number.NaN;
  let lastLongIdx = -Infinity;
  let lastShortIdx = -Infinity;
  const cooldown = Math.max(0, Math.floor(settings.cooldownBars));

  for (let i = 0; i < n; i++) {
    const curr = value[i]!;
    if (Number.isFinite(prevVal) && Number.isFinite(curr)) {
      const crossUp = prevVal <= settings.threshold && curr > settings.threshold;
      const crossDown = prevVal >= settings.threshold && curr < settings.threshold;
      const mode = settings.signalMode;
      if (crossUp && (mode === "long_above" || mode === "both")) {
        if (i - lastLongIdx > cooldown) {
          long[i] = true;
          lastLongIdx = i;
        }
      }
      if (crossUp && mode === "short_above") {
        if (i - lastShortIdx > cooldown) {
          short[i] = true;
          lastShortIdx = i;
        }
      }
      if (crossDown && mode === "both") {
        if (i - lastShortIdx > cooldown) {
          short[i] = true;
          lastShortIdx = i;
        }
      }
    }
    if (Number.isFinite(curr)) prevVal = curr;
  }

  return { long, short, value, depthBarsAvailable, missingDepth };
}
