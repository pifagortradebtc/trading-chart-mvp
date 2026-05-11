/**
 * Чистые функции OHLCV (без IndexedDB) — общие для клиента и сервера.
 */

import type { Candle } from "@/types/candle";

/** Нормализация Binance kline → Candle (time в секундах). */
export function binanceRowToCandle(row: unknown[]): Candle {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

export function mergeCandlesSorted(a: Candle[], b: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of a) map.set(c.time, c);
  for (const c of b) map.set(c.time, c);
  return Array.from(map.values()).sort((x, y) => x.time - y.time);
}
