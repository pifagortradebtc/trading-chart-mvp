import type { Candle } from "@/types/candle";

export interface LinePoint {
  time: number;
  value?: number;
}

export function sma(candles: Candle[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      out.push({ time: candles[i].time });
      continue;
    }
    let s = 0;
    for (let j = 0; j < period; j++) s += candles[i - j].close;
    out.push({ time: candles[i].time, value: s / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number): LinePoint[] {
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  let prev: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    if (prev === null) {
      if (i < period - 1) {
        out.push({ time: candles[i].time });
        continue;
      }
      let s = 0;
      for (let j = 0; j < period; j++) s += candles[i - j].close;
      prev = s / period;
      out.push({ time: candles[i].time, value: prev });
      continue;
    }
    prev = c * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/** RSI (Wilder smoothing); values 0–100 after warm-up bars. */
export function rsi(candles: Candle[], period = 14): LinePoint[] {
  const out: LinePoint[] = candles.map((c) => ({ time: c.time }));
  if (candles.length < period + 1) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;

  const rsiAt = () => {
    if (avgL === 0) return avgG === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgG / avgL);
  };

  out[period] = { time: candles[period].time, value: rsiAt() };

  for (let i = period + 1; i < candles.length; i++) {
    const ch = candles[i].close - candles[i - 1].close;
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = { time: candles[i].time, value: rsiAt() };
  }

  return out;
}
