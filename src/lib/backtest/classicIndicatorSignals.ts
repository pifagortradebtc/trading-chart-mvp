/**
 * Classic technical indicators as composite signal generators.
 *
 * Каждый индикатор:
 *   • получает candles + свои settings
 *   • возвращает {long, short} массивы булевых per-bar сигналов
 *   • edge-trigger (только на баре пересечения уровня/линии), с cooldownBars между сигналами
 *
 * Реализованы: MACD, RSI threshold, EMA cross, Bollinger touch, Stochastic, ADX filter.
 * Все используют raw-array математику (без LinePoint оверхеда из ../indicators/math).
 */

import type { Candle } from "@/types/candle";

export interface ClassicSignalArrays {
  long: boolean[];
  short: boolean[];
}

// ─────────────── Helpers ───────────────

function arrayEma(values: (number | null)[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out = new Array<number | null>(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (prev == null) {
      /** Прогрев: simple average первого «полного» окна. */
      if (i < period - 1) continue;
      let s = 0;
      let ok = true;
      for (let j = 0; j < period; j++) {
        const x = values[i - j];
        if (x == null || !Number.isFinite(x)) {
          ok = false;
          break;
        }
        s += x;
      }
      if (!ok) continue;
      prev = s / period;
      out[i] = prev;
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function arraySma(values: number[], period: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (period < 1) return out;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i]!;
    if (i >= period) s -= values[i - period]!;
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

/** Стандартное отклонение цены в скользящем окне (для Bollinger). */
function arrayStd(values: number[], period: number, smaArr: (number | null)[]): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const mean = smaArr[i];
    if (mean == null) continue;
    let s = 0;
    for (let j = 0; j < period; j++) {
      const diff = values[i - j]! - mean;
      s += diff * diff;
    }
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

/** True Range для ATR / ADX. */
function trueRange(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    if (i === 0) {
      out[i] = c.high - c.low;
      continue;
    }
    const prev = candles[i - 1]!;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return out;
}

/** Wilder smoothing (RMA): атр стандартный для индикаторов TV. */
function wilderRma(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out = new Array<number | null>(n).fill(null);
  if (n < period) return out;
  let s = 0;
  for (let i = 0; i < period; i++) s += values[i]!;
  let prev = s / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/** RSI (Wilder) на массиве close. */
function arrayRsi(close: number[], period: number): (number | null)[] {
  const n = close.length;
  const out = new Array<number | null>(n).fill(null);
  if (n < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = close[i]! - close[i - 1]!;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const rsiVal = () => {
    if (avgL === 0) return avgG === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgG / avgL);
  };
  out[period] = rsiVal();
  for (let i = period + 1; i < n; i++) {
    const ch = close[i]! - close[i - 1]!;
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = rsiVal();
  }
  return out;
}

/** ADX (Wilder) — возвращает массив значений ADX (0-100, чем выше, тем сильнее тренд). */
function arrayAdx(candles: Candle[], period: number): (number | null)[] {
  const n = candles.length;
  const tr = trueRange(candles);
  const dmPlus = new Array<number>(n).fill(0);
  const dmMinus = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i]!.high - candles[i - 1]!.high;
    const dn = candles[i - 1]!.low - candles[i]!.low;
    dmPlus[i] = up > dn && up > 0 ? up : 0;
    dmMinus[i] = dn > up && dn > 0 ? dn : 0;
  }
  const trS = wilderRma(tr, period);
  const dmpS = wilderRma(dmPlus, period);
  const dmnS = wilderRma(dmMinus, period);
  const dx = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const t = trS[i];
    const p = dmpS[i];
    const m = dmnS[i];
    if (t == null || p == null || m == null || t === 0) continue;
    const diP = (100 * p) / t;
    const diM = (100 * m) / t;
    const sum = diP + diM;
    dx[i] = sum > 0 ? (100 * Math.abs(diP - diM)) / sum : 0;
  }
  /** ADX = Wilder smoothing of DX. */
  const dxNums: number[] = dx.map((v) => v ?? 0);
  return wilderRma(dxNums, period);
}

/** Edge-trigger: arr[i-1] OP threshold && arr[i] OP-INV threshold. cooldown в барах. */
function emitEdge(
  values: (number | null)[],
  predicate: (prev: number, curr: number) => boolean,
  cooldownBars: number,
): boolean[] {
  const n = values.length;
  const out = new Array<boolean>(n).fill(false);
  let lastFire = -Infinity;
  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev == null || curr == null) continue;
    if (predicate(prev, curr)) {
      if (i - lastFire >= cooldownBars) {
        out[i] = true;
        lastFire = i;
      }
    }
  }
  return out;
}

// ─────────────── Settings ───────────────

export interface MacdSettings {
  fastLen: number;
  slowLen: number;
  signalLen: number;
  cooldownBars: number;
}
export const DEFAULT_MACD: MacdSettings = {
  fastLen: 12,
  slowLen: 26,
  signalLen: 9,
  cooldownBars: 1,
};

export interface RsiThresholdSettings {
  length: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  cooldownBars: number;
}
export const DEFAULT_RSI_THRESHOLD: RsiThresholdSettings = {
  length: 14,
  oversoldThreshold: 30,
  overboughtThreshold: 70,
  cooldownBars: 1,
};

export interface EmaCrossSettings {
  fastLen: number;
  slowLen: number;
  cooldownBars: number;
}
export const DEFAULT_EMA_CROSS: EmaCrossSettings = {
  fastLen: 50,
  slowLen: 200,
  cooldownBars: 1,
};

export interface BollingerSettings {
  length: number;
  stdDevMult: number;
  cooldownBars: number;
}
export const DEFAULT_BOLLINGER: BollingerSettings = {
  length: 20,
  stdDevMult: 2,
  cooldownBars: 1,
};

export interface StochasticSettings {
  kLength: number;
  kSmooth: number;
  dSmooth: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  cooldownBars: number;
}
export const DEFAULT_STOCHASTIC: StochasticSettings = {
  kLength: 14,
  kSmooth: 3,
  dSmooth: 3,
  oversoldThreshold: 20,
  overboughtThreshold: 80,
  cooldownBars: 1,
};

export interface AdxFilterSettings {
  length: number;
  threshold: number;
}
export const DEFAULT_ADX_FILTER: AdxFilterSettings = {
  length: 14,
  threshold: 25,
};

// ─────────────── Signal computers ───────────────

/**
 * MACD: long = MACD пересекает signal-line вверх; short = вниз.
 * Параметры стандартные (12/26/9).
 */
export function computeMacdSignals(
  candles: Candle[],
  settings: MacdSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const fast = arrayEma(close, settings.fastLen);
  const slow = arrayEma(close, settings.slowLen);
  const macd: (number | null)[] = close.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f == null || s == null ? null : f - s;
  });
  const signal = arrayEma(macd, settings.signalLen);
  /** «macd - signal»: long на cross UP, short на cross DOWN. */
  const diff: (number | null)[] = macd.map((m, i) => {
    const sg = signal[i];
    return m == null || sg == null ? null : m - sg;
  });
  const long = emitEdge(diff, (prev, curr) => prev <= 0 && curr > 0, settings.cooldownBars);
  const short = emitEdge(diff, (prev, curr) => prev >= 0 && curr < 0, settings.cooldownBars);
  return { long, short };
}

/**
 * RSI threshold: long = RSI пересекает oversold уровень вверх (выход из перепроданности);
 * short = пересекает overbought уровень вниз.
 */
export function computeRsiThresholdSignals(
  candles: Candle[],
  settings: RsiThresholdSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const rsi = arrayRsi(close, settings.length);
  const long = emitEdge(
    rsi,
    (prev, curr) =>
      prev <= settings.oversoldThreshold && curr > settings.oversoldThreshold,
    settings.cooldownBars,
  );
  const short = emitEdge(
    rsi,
    (prev, curr) =>
      prev >= settings.overboughtThreshold && curr < settings.overboughtThreshold,
    settings.cooldownBars,
  );
  return { long, short };
}

/**
 * EMA cross («golden»/«death»): long = fast EMA пересекает slow EMA вверх; short — вниз.
 * Дефолт 50/200 (классика для дневных графиков).
 */
export function computeEmaCrossSignals(
  candles: Candle[],
  settings: EmaCrossSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const fast = arrayEma(close, settings.fastLen);
  const slow = arrayEma(close, settings.slowLen);
  const diff: (number | null)[] = close.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f == null || s == null ? null : f - s;
  });
  const long = emitEdge(diff, (prev, curr) => prev <= 0 && curr > 0, settings.cooldownBars);
  const short = emitEdge(diff, (prev, curr) => prev >= 0 && curr < 0, settings.cooldownBars);
  return { long, short };
}

/**
 * Bollinger touch: long = close пересекает lower band сверху вниз (касание/пробой нижней);
 * short = close пересекает upper band снизу вверх. Mean reversion.
 */
export function computeBollingerSignals(
  candles: Candle[],
  settings: BollingerSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const mid = arraySma(close, settings.length);
  const std = arrayStd(close, settings.length, mid);
  const n = close.length;
  const upperOffset = new Array<number | null>(n).fill(null);
  const lowerOffset = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const m = mid[i];
    const s = std[i];
    if (m == null || s == null) continue;
    upperOffset[i] = close[i]! - (m + settings.stdDevMult * s);
    lowerOffset[i] = (m - settings.stdDevMult * s) - close[i]!;
  }
  /** long: lowerOffset переходит из <0 в >=0 (close спустился к нижней или ниже). */
  const long = emitEdge(
    lowerOffset,
    (prev, curr) => prev < 0 && curr >= 0,
    settings.cooldownBars,
  );
  const short = emitEdge(
    upperOffset,
    (prev, curr) => prev < 0 && curr >= 0,
    settings.cooldownBars,
  );
  return { long, short };
}

/**
 * Stochastic: long = %K пересекает oversold вверх; short = %K пересекает overbought вниз.
 * Используется smoothed %K (как в TV). %D пока не задействован для сигнала, только %K.
 */
export function computeStochasticSignals(
  candles: Candle[],
  settings: StochasticSettings,
): ClassicSignalArrays {
  const n = candles.length;
  /** Raw %K = 100 × (close − lowestLow_kLength) / (highestHigh_kLength − lowestLow_kLength). */
  const rawK = new Array<number | null>(n).fill(null);
  for (let i = settings.kLength - 1; i < n; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < settings.kLength; j++) {
      const c = candles[i - j]!;
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const range = hi - lo;
    rawK[i] = range > 0 ? (100 * (candles[i]!.close - lo)) / range : 50;
  }
  /** Сглаживание %K (часто называется "%K slowed"). */
  const rawKNum: number[] = rawK.map((v) => v ?? 0);
  const kSmoothed = arraySma(rawKNum, settings.kSmooth);
  /** Для сигнала используем сглаженный %K. */
  const long = emitEdge(
    kSmoothed,
    (prev, curr) =>
      prev <= settings.oversoldThreshold && curr > settings.oversoldThreshold,
    settings.cooldownBars,
  );
  const short = emitEdge(
    kSmoothed,
    (prev, curr) =>
      prev >= settings.overboughtThreshold && curr < settings.overboughtThreshold,
    settings.cooldownBars,
  );
  return { long, short };
}

/**
 * ADX filter: continuous-style сигнал «есть сильный тренд» — long=short=true когда ADX > threshold.
 * Это не edge-trigger, а постоянный фильтр: используется в композите чтобы пропускать сигналы
 * других слотов только в сильном тренде (или наоборот, в боковике если invert).
 */
export function computeAdxFilterSignals(
  candles: Candle[],
  settings: AdxFilterSettings,
): ClassicSignalArrays {
  const adx = arrayAdx(candles, settings.length);
  const n = adx.length;
  const active = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const v = adx[i];
    if (v != null && v > settings.threshold) active[i] = true;
  }
  /** ADX не даёт направления — он применяется как «оба разрешены». В composite AND-режиме
   *  это работает как фильтр: BuyForce даст LONG, ADX подтвердит силу → composite LONG. */
  return { long: active, short: active };
}
