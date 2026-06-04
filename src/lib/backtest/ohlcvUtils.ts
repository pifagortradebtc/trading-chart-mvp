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

/** Длина одной свечи TF Binance (мс). Для 1M — усреднённый месяц. */
export function binanceIntervalToMs(interval: string): number {
  const table: Record<string, number> = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 3600_000,
    "2h": 2 * 3600_000,
    "4h": 4 * 3600_000,
    "6h": 6 * 3600_000,
    "8h": 8 * 3600_000,
    "12h": 12 * 3600_000,
    "1d": 24 * 3600_000,
    "3d": 3 * 24 * 3600_000,
    "1w": 7 * 24 * 3600_000,
    "1M": 30 * 24 * 3600_000,
  };
  return table[interval] ?? 60_000;
}

/**
 * Допустимый «хвост» без докачки: 1.5 дня для дневных TF, 2 дня для intraday.
 *
 * Раньше для 1d стояла НЕДЕЛЯ — это означало что 4-дневное отставание cache от
 * «сейчас» считалось ОК. Юзер видел старые свечи и не мог нормально бэктестить
 * до самого свежего бара. Поджали до 1.5 дня: хватает чтобы пережить незакрытую
 * сегодняшнюю дневную свечу (Binance не возвращает её до 00:00 UTC закрытия),
 * но любое реальное отставание тут же триггерит forward-fetch с биржи.
 */
export function ohlcvForwardGapToleranceMs(barMs: number): number {
  const oneAndHalfDay = 1.5 * 24 * 3600 * 1000;
  const twoDays = 2 * 24 * 3600 * 1000;
  if (barMs >= 24 * 3600_000) return oneAndHalfDay;
  return Math.max(twoDays, barMs * 10);
}

export function ohlcvCacheNeedsExtension(
  merged: Candle[],
  startMs: number,
  endMs: number,
  barMs: number,
): { needBack: boolean; needFwd: boolean } {
  if (!merged.length) return { needBack: true, needFwd: true };
  const firstMs = merged[0]!.time * 1000;
  const lastMs = merged[merged.length - 1]!.time * 1000;
  const fwdTol = ohlcvForwardGapToleranceMs(barMs);
  return {
    needBack: firstMs > startMs + barMs,
    needFwd: lastMs < endMs - fwdTol,
  };
}

export function filterCandlesToRange(candles: Candle[], startMs: number, endMs: number): Candle[] {
  return candles.filter((c) => {
    const t = c.time * 1000;
    return t >= startMs && t <= endMs;
  });
}

/** Обрезать хвост старше скользящего окна (лет × средний год). */
export function trimCandlesOlderThan(
  candles: Candle[],
  endMs: number,
  yearsBack: number,
  slackMs = 0,
): Candle[] {
  const spanMs = yearsBack * 365.25 * 24 * 3600 * 1000;
  const cut = endMs - spanMs - slackMs;
  return candles.filter((c) => c.time * 1000 >= cut);
}
