/**
 * Загрузка свечей Binance Spot на сервере (без CORS).
 */

import type { Candle } from "@/types/candle";
import { binanceRowToCandle, mergeCandlesSorted } from "@/lib/backtest/ohlcvUtils";
import { fetchWithTimeout } from "@/lib/server/safeFetch";

/** Свечи с startTime ≥ startMs вперёд до endMs (постранично). */
export async function fetchBinanceKlinesForward(opts: {
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  onChunk?: (loaded: number) => void;
}): Promise<Candle[]> {
  const { symbol, interval, startMs, endMs, onChunk } = opts;
  const sym = symbol.replace("/", "");
  const out: Candle[] = [];
  let cursor = startMs;
  let guard = 500;

  while (guard-- > 0 && cursor <= endMs) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", sym);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", String(cursor));
    url.searchParams.set("endTime", String(endMs));
    url.searchParams.set("limit", "1000");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Binance ${res.status}: ${txt}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;

    for (const row of raw) {
      const c = binanceRowToCandle(row);
      if (c.time * 1000 <= endMs) out.push(c);
    }

    onChunk?.(out.length);

    const lastOpen = raw[raw.length - 1]![0] as number;
    if (lastOpen >= endMs || raw.length < 1000) break;
    cursor = lastOpen + 1;
  }

  return mergeCandlesSorted([], out);
}

export async function fetchBinanceKlinesServer(opts: {
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  onChunk?: (loaded: number) => void;
}): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  const { symbol, interval, startMs, endMs, onChunk } = opts;
  const out: Candle[] = [];
  let end = endMs;
  let oldestInBatch: number | null = null;
  let guard = 500;

  while (guard-- > 0) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", symbol.replace("/", ""));
    url.searchParams.set("interval", interval);
    url.searchParams.set("endTime", String(end));
    url.searchParams.set("limit", "1000");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Binance ${res.status}: ${txt}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;

    const batch = raw.map(binanceRowToCandle);
    oldestInBatch = batch[0]!.time * 1000;
    for (const c of batch) {
      if (c.time * 1000 >= startMs && c.time * 1000 <= endMs) out.push(c);
    }

    onChunk?.(out.length);

    const firstOpen = raw[0][0] as number;
    if (firstOpen <= startMs) break;
    end = firstOpen - 1;

    if (batch.length < 1000) break;
  }

  const candles = mergeCandlesSorted([], out).filter(
    (c) => c.time * 1000 >= startMs && c.time * 1000 <= endMs,
  );

  let warning: string | undefined;
  if (candles.length && candles[0]!.time * 1000 > startMs + 60_000) {
    warning = `Биржа отдала данные только с ${new Date(candles[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
  }

  return {
    candles,
    oldestAvailableMs: oldestInBatch,
    warning,
  };
}
