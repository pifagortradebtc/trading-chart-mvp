/**
 * Индикаторная математика для бэктеста: EMA, RSI, ATR, ADX/DMI, Chaikin, Keltner.
 * Расчёт построчно по массивам чисел (без lookahead — только прошлые бары).
 */

/** Wilder smoothing: первое значение — SMA, далее Wilder. */
export function wilderSmooth(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
  }
  return out;
}

export function emaFromSeries(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = NaN;
      continue;
    }
    if (prev === null) {
      if (i < period - 1) continue;
      let s = 0;
      for (let j = 0; j < period; j++) s += values[i - j];
      prev = s / period;
      out[i] = prev;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** RSI Wilder, 0–100. */
export function rsi(close: number[], period: number): number[] {
  const out = new Array(close.length).fill(NaN);
  if (close.length < period + 1) return out;
  const changes: number[] = new Array(close.length).fill(0);
  for (let i = 1; i < close.length; i++) changes[i] = close[i] - close[i - 1];

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = changes[i];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;

  const rsiAt = () => {
    if (avgL === 0) return avgG === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgG / avgL);
  };

  out[period] = rsiAt();

  for (let i = period + 1; i < close.length; i++) {
    const ch = changes[i];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = rsiAt();
  }
  return out;
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const tr = new Array(high.length).fill(NaN);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  return tr;
}

/** ATR Wilder. */
export function atr(
  high: number[],
  low: number[],
  close: number[],
  period: number,
): number[] {
  const tr = trueRange(high, low, close);
  return wilderSmooth(tr, period);
}

/** Chaikin: ADL, затем osc = EMA_fast(ADL) - EMA_slow(ADL). */
export function accumulationDistributionLine(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
): number[] {
  const adl = new Array(close.length).fill(0);
  for (let i = 0; i < close.length; i++) {
    const h = high[i];
    const l = low[i];
    const c = close[i];
    const vol = volume[i] ?? 0;
    const rng = h - l;
    const mfm = rng === 0 ? 0 : ((c - l) - (h - c)) / rng;
    const mfv = mfm * vol;
    adl[i] = (i > 0 ? adl[i - 1] : 0) + mfv;
  }
  return adl;
}

export function chaikinOscillator(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  fast: number,
  slow: number,
): number[] {
  const adl = accumulationDistributionLine(high, low, close, volume);
  const ef = emaFromSeries(adl, fast);
  const es = emaFromSeries(adl, slow);
  const out = new Array(close.length).fill(NaN);
  for (let i = 0; i < close.length; i++) {
    if (Number.isFinite(ef[i]) && Number.isFinite(es[i])) out[i] = ef[i] - es[i];
  }
  return out;
}

/** +DM, -DM для ADX. */
export function plusMinusDM(high: number[], low: number[]): {
  plusDM: number[];
  minusDM: number[];
} {
  const plusDM = new Array(high.length).fill(0);
  const minusDM = new Array(high.length).fill(0);
  for (let i = 1; i < high.length; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
    if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
  }
  return { plusDM, minusDM };
}

/** RMA (Wilder) поверх ряда; ведущие значения — NaN до первого валидного сглаженного. */
function rmaOfSeries(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return out;
    sum += v;
  }
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) break;
    out[i] = (out[i - 1] * (period - 1) + v) / period;
  }
  return out;
}

/** DI+, DI-, ADX (классическая связка TR/+DM/-DM → DX → ADX). */
export function adxDi(
  high: number[],
  low: number[],
  close: number[],
  period: number,
): { adx: number[]; diPlus: number[]; diMinus: number[] } {
  const len = close.length;
  const adx = new Array(len).fill(NaN);
  const diPlus = new Array(len).fill(NaN);
  const diMinus = new Array(len).fill(NaN);
  const tr = trueRange(high, low, close);
  const { plusDM, minusDM } = plusMinusDM(high, low);

  const trRma = rmaOfSeries(tr, period);
  const pdmRma = rmaOfSeries(plusDM, period);
  const mdmRma = rmaOfSeries(minusDM, period);

  const dx = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const trv = trRma[i];
    const pp = pdmRma[i];
    const mp = mdmRma[i];
    if (!Number.isFinite(trv) || trv === 0 || !Number.isFinite(pp) || !Number.isFinite(mp)) continue;
    const pDi = (100 * pp) / trv;
    const mDi = (100 * mp) / trv;
    diPlus[i] = pDi;
    diMinus[i] = mDi;
    const s = pDi + mDi;
    dx[i] = s === 0 ? 0 : (100 * Math.abs(pDi - mDi)) / s;
  }

  /** ADX = RMA(DX), только по конечным DX (без пропусков после первого валидного бара). */
  let adxPrev: number | null = null;
  let seedSum = 0;
  let seedLeft = period;
  for (let i = 0; i < len; i++) {
    const d = dx[i];
    if (!Number.isFinite(d)) continue;
    if (seedLeft > 0) {
      seedSum += d;
      seedLeft--;
      if (seedLeft === 0) {
        adxPrev = seedSum / period;
        adx[i] = adxPrev;
      }
    } else if (adxPrev !== null) {
      adxPrev = (adxPrev * (period - 1) + d) / period;
      adx[i] = adxPrev;
    }
  }

  return { adx, diPlus, diMinus };
}

export function keltnerChannel(
  close: number[],
  high: number[],
  low: number[],
  emaLen: number,
  atrLen: number,
  mult: number,
): { basis: number[]; upper: number[]; lower: number[] } {
  const basis = emaFromSeries(close, emaLen);
  const at = atr(high, low, close, atrLen);
  const upper = new Array(close.length).fill(NaN);
  const lower = new Array(close.length).fill(NaN);
  for (let i = 0; i < close.length; i++) {
    if (Number.isFinite(basis[i]) && Number.isFinite(at[i])) {
      upper[i] = basis[i] + mult * at[i];
      lower[i] = basis[i] - mult * at[i];
    }
  }
  return { basis, upper, lower };
}

/** Highest high / lowest low за окно [i - length + 1, i]. */
export function highestHigh(high: number[], length: number): number[] {
  const out = new Array(high.length).fill(NaN);
  for (let i = 0; i < high.length; i++) {
    if (i < length - 1) continue;
    let mx = high[i - length + 1];
    for (let j = i - length + 2; j <= i; j++) mx = Math.max(mx, high[j]);
    out[i] = mx;
  }
  return out;
}

export function lowestLow(low: number[], length: number): number[] {
  const out = new Array(low.length).fill(NaN);
  for (let i = 0; i < low.length; i++) {
    if (i < length - 1) continue;
    let mn = low[i - length + 1];
    for (let j = i - length + 2; j <= i; j++) mn = Math.min(mn, low[j]);
    out[i] = mn;
  }
  return out;
}
