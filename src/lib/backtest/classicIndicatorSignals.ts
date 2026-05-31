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

/**
 * MACD signal modes:
 *  • signal_cross    — long: MACD↑signal-line, short: MACD↓signal-line (классика, дефолт)
 *  • zero_cross      — long: MACD пересекает 0 ↑, short: пересекает 0 ↓ (медленнее, надёжнее)
 *  • above_zero_gate — long (continuous): MACD > 0; short: MACD < 0 (используется как фильтр в AND)
 */
export type MacdSignalMode = "signal_cross" | "zero_cross" | "above_zero_gate";
export interface MacdSettings {
  fastLen: number;
  slowLen: number;
  signalLen: number;
  cooldownBars: number;
  signalMode: MacdSignalMode;
}
export const DEFAULT_MACD: MacdSettings = {
  fastLen: 12,
  slowLen: 26,
  signalLen: 9,
  cooldownBars: 1,
  signalMode: "signal_cross",
};

/**
 * RSI signal modes:
 *  • exit_zones    — long: RSI↑ из oversold, short: RSI↓ из overbought (дефолт, классика)
 *  • enter_zones   — long: RSI входит в oversold ↓, short: входит в overbought ↑ (mean reversion-entry)
 *  • midline_cross — long: RSI пересекает 50 ↑, short: RSI пересекает 50 ↓ (моментум)
 *  • inside_zone   — long (continuous): RSI < oversold; short: RSI > overbought (filter-style)
 */
export type RsiSignalMode = "exit_zones" | "enter_zones" | "midline_cross" | "inside_zone";
export interface RsiThresholdSettings {
  length: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  cooldownBars: number;
  signalMode: RsiSignalMode;
}
export const DEFAULT_RSI_THRESHOLD: RsiThresholdSettings = {
  length: 14,
  oversoldThreshold: 30,
  overboughtThreshold: 70,
  cooldownBars: 1,
  signalMode: "exit_zones",
};

/**
 * EMA cross modes:
 *  • cross_event — edge: long при golden, short при death (дефолт)
 *  • above_below — continuous: long пока fast > slow; short пока fast < slow (трендовый фильтр)
 */
export type EmaCrossSignalMode = "cross_event" | "above_below";
export interface EmaCrossSettings {
  fastLen: number;
  slowLen: number;
  cooldownBars: number;
  signalMode: EmaCrossSignalMode;
}
export const DEFAULT_EMA_CROSS: EmaCrossSettings = {
  fastLen: 50,
  slowLen: 200,
  cooldownBars: 1,
  signalMode: "cross_event",
};

/**
 * Bollinger modes:
 *  • touch_band — long при пробое нижней полосы (mean reversion: жди отскок), short — верхней
 *  • breakout   — наоборот, breakout: long при пробое верхней (импульс вверх), short — нижней
 */
export type BollingerSignalMode = "touch_band" | "breakout";
export interface BollingerSettings {
  length: number;
  stdDevMult: number;
  cooldownBars: number;
  signalMode: BollingerSignalMode;
}
export const DEFAULT_BOLLINGER: BollingerSettings = {
  length: 20,
  stdDevMult: 2,
  cooldownBars: 1,
  signalMode: "touch_band",
};

/**
 * Stochastic modes:
 *  • exit_zones  — long: %K↑ из oversold, short: %K↓ из overbought (дефолт)
 *  • enter_zones — наоборот: long при входе в oversold ↓, short при входе в overbought ↑
 */
export type StochasticSignalMode = "exit_zones" | "enter_zones";
export interface StochasticSettings {
  kLength: number;
  kSmooth: number;
  dSmooth: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  cooldownBars: number;
  signalMode: StochasticSignalMode;
}
export const DEFAULT_STOCHASTIC: StochasticSettings = {
  kLength: 14,
  kSmooth: 3,
  dSmooth: 3,
  oversoldThreshold: 20,
  overboughtThreshold: 80,
  cooldownBars: 1,
  signalMode: "exit_zones",
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
 * MACD — три режима сигнала (см. MacdSignalMode):
 *  • signal_cross    — long: MACD↑signal, short: ↓ (классический crossover)
 *  • zero_cross      — long: MACD↑0, short: ↓0 (медленнее, надёжнее)
 *  • above_zero_gate — continuous filter: long=true пока MACD>0, short=true пока <0
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
  const n = close.length;

  const mode = settings.signalMode ?? "signal_cross";
  if (mode === "above_zero_gate") {
    const long = new Array<boolean>(n).fill(false);
    const short = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      const m = macd[i];
      if (m == null) continue;
      if (m > 0) long[i] = true;
      if (m < 0) short[i] = true;
    }
    return { long, short };
  }
  if (mode === "zero_cross") {
    const long = emitEdge(macd, (prev, curr) => prev <= 0 && curr > 0, settings.cooldownBars);
    const short = emitEdge(macd, (prev, curr) => prev >= 0 && curr < 0, settings.cooldownBars);
    return { long, short };
  }
  // signal_cross (default)
  const signal = arrayEma(macd, settings.signalLen);
  const diff: (number | null)[] = macd.map((m, i) => {
    const sg = signal[i];
    return m == null || sg == null ? null : m - sg;
  });
  const long = emitEdge(diff, (prev, curr) => prev <= 0 && curr > 0, settings.cooldownBars);
  const short = emitEdge(diff, (prev, curr) => prev >= 0 && curr < 0, settings.cooldownBars);
  return { long, short };
}

/**
 * RSI — четыре режима сигнала (см. RsiSignalMode):
 *  • exit_zones    — long: RSI↑oversold (выход из перепроданности), short: RSI↓overbought
 *  • enter_zones   — наоборот: long: RSI↓oversold (входим в зону, ждём отскок),
 *                    short: RSI↑overbought
 *  • midline_cross — long: RSI пересекает 50 ↑, short: пересекает 50 ↓ (моментум)
 *  • inside_zone   — continuous filter: long=true пока RSI<oversold; short=true пока >overbought
 */
export function computeRsiThresholdSignals(
  candles: Candle[],
  settings: RsiThresholdSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const rsi = arrayRsi(close, settings.length);
  const n = close.length;
  const mode = settings.signalMode ?? "exit_zones";

  if (mode === "inside_zone") {
    const long = new Array<boolean>(n).fill(false);
    const short = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      const v = rsi[i];
      if (v == null) continue;
      if (v < settings.oversoldThreshold) long[i] = true;
      if (v > settings.overboughtThreshold) short[i] = true;
    }
    return { long, short };
  }
  if (mode === "midline_cross") {
    const long = emitEdge(rsi, (prev, curr) => prev <= 50 && curr > 50, settings.cooldownBars);
    const short = emitEdge(rsi, (prev, curr) => prev >= 50 && curr < 50, settings.cooldownBars);
    return { long, short };
  }
  if (mode === "enter_zones") {
    const long = emitEdge(
      rsi,
      (prev, curr) =>
        prev > settings.oversoldThreshold && curr <= settings.oversoldThreshold,
      settings.cooldownBars,
    );
    const short = emitEdge(
      rsi,
      (prev, curr) =>
        prev < settings.overboughtThreshold && curr >= settings.overboughtThreshold,
      settings.cooldownBars,
    );
    return { long, short };
  }
  // exit_zones (default)
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
 * EMA Cross — два режима:
 *  • cross_event  — edge: long при golden cross, short при death (дефолт)
 *  • above_below  — continuous: long=true пока fast > slow; short=true пока fast < slow (трендовый фильтр)
 */
export function computeEmaCrossSignals(
  candles: Candle[],
  settings: EmaCrossSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const fast = arrayEma(close, settings.fastLen);
  const slow = arrayEma(close, settings.slowLen);
  const n = close.length;
  const mode = settings.signalMode ?? "cross_event";

  if (mode === "above_below") {
    const long = new Array<boolean>(n).fill(false);
    const short = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      const f = fast[i];
      const s = slow[i];
      if (f == null || s == null) continue;
      if (f > s) long[i] = true;
      if (f < s) short[i] = true;
    }
    return { long, short };
  }
  // cross_event (default)
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
 * Bollinger — два режима:
 *  • touch_band — mean reversion: long при пробое НИЖНЕЙ полосы (жди отскок),
 *                 short при пробое ВЕРХНЕЙ (дефолт)
 *  • breakout   — наоборот, моментум: long при пробое ВЕРХНЕЙ (импульс вверх),
 *                 short при пробое НИЖНЕЙ (срыв вниз)
 */
export function computeBollingerSignals(
  candles: Candle[],
  settings: BollingerSettings,
): ClassicSignalArrays {
  const close = candles.map((c) => c.close);
  const mid = arraySma(close, settings.length);
  const std = arrayStd(close, settings.length, mid);
  const n = close.length;
  const upperOffset = new Array<number | null>(n).fill(null); // close − upper
  const lowerOffset = new Array<number | null>(n).fill(null); // lower − close
  for (let i = 0; i < n; i++) {
    const m = mid[i];
    const s = std[i];
    if (m == null || s == null) continue;
    upperOffset[i] = close[i]! - (m + settings.stdDevMult * s);
    lowerOffset[i] = (m - settings.stdDevMult * s) - close[i]!;
  }
  const mode = settings.signalMode ?? "touch_band";
  if (mode === "breakout") {
    /** long: upper пробит сверху (close > upper). short: lower пробит снизу (close < lower). */
    const long = emitEdge(
      upperOffset,
      (prev, curr) => prev <= 0 && curr > 0,
      settings.cooldownBars,
    );
    const short = emitEdge(
      lowerOffset,
      (prev, curr) => prev <= 0 && curr > 0,
      settings.cooldownBars,
    );
    return { long, short };
  }
  // touch_band (default — mean reversion)
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
 * Stochastic — два режима:
 *  • exit_zones  — long: %K↑ из oversold, short: %K↓ из overbought (дефолт)
 *  • enter_zones — наоборот: long при входе в oversold ↓, short при входе в overbought ↑
 */
export function computeStochasticSignals(
  candles: Candle[],
  settings: StochasticSettings,
): ClassicSignalArrays {
  const n = candles.length;
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
  const rawKNum: number[] = rawK.map((v) => v ?? 0);
  const kSmoothed = arraySma(rawKNum, settings.kSmooth);
  const mode = settings.signalMode ?? "exit_zones";

  if (mode === "enter_zones") {
    const long = emitEdge(
      kSmoothed,
      (prev, curr) =>
        prev > settings.oversoldThreshold && curr <= settings.oversoldThreshold,
      settings.cooldownBars,
    );
    const short = emitEdge(
      kSmoothed,
      (prev, curr) =>
        prev < settings.overboughtThreshold && curr >= settings.overboughtThreshold,
      settings.cooldownBars,
    );
    return { long, short };
  }
  // exit_zones (default)
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
