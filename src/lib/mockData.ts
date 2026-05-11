import type { Candle, Timeframe } from "@/types/candle";

/** Bar duration in seconds per timeframe (mock resampling granularity). */
const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
  "1W": 604800,
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic mock OHLC walk — swap symbol/tf for different streams without API. */
export function generateMockCandles(
  symbol: string,
  timeframe: Timeframe,
  count = 600,
): Candle[] {
  const step = TF_SECONDS[timeframe];
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed = (seed + symbol.charCodeAt(i) * (i + 1)) >>> 0;
  seed = (seed + timeframe.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) >>> 0;
  const rand = mulberry32(seed);

  const now = Math.floor(Date.now() / 1000);
  const start = now - count * step;
  const candles: Candle[] = [];
  let close = 80 + rand() * 40;

  for (let i = 0; i < count; i++) {
    const time = start + i * step;
    const volBase = 1000 + rand() * 5000;
    const change = (rand() - 0.48) * (close * 0.008);
    const open = close;
    close = Math.max(0.01, open + change);
    const high = Math.max(open, close) + rand() * close * 0.004;
    const low = Math.min(open, close) - rand() * close * 0.004;
    const volume = volBase * (0.5 + rand());

    candles.push({
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume,
    });
  }

  return candles;
}
