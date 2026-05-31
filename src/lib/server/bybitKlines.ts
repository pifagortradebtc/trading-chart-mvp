/**
 * Bybit Spot kline v5 API (server-side).
 *
 * Используется как длинноисторический источник для токенов, которые есть на
 * Bybit раньше CoinGecko free-tier капа (365 дней) и которых нет на Binance/OKX:
 *   - HYPE (Hyperliquid) — Bybit listing ~Dec 2024
 *   - MNT (Mantle)       — Bybit listing 2023
 *
 * Endpoint contract:
 *   GET https://api.bybit.com/v5/market/kline
 *     ?category=spot&symbol=MNTUSDT&interval=D&end=<ms>&limit=1000
 *   Response: {
 *     retCode: 0,
 *     retMsg: "OK",
 *     result: {
 *       category: "spot",
 *       symbol: "MNTUSDT",
 *       list: [[startTimeMs, open, high, low, close, volume, turnover], ...]
 *     }
 *   }
 *   - list отсортирован **newest-first**
 *   - timestamps в ms-строках
 *
 * Rate limit: public market endpoints ~120 req/sec на IP. Запас огромный.
 */

import type { Candle } from "@/types/candle";
import { mergeCandlesSorted } from "@/lib/backtest/ohlcvUtils";

interface BybitKlineResponse {
  retCode: number;
  retMsg: string;
  result?: {
    category?: string;
    symbol?: string;
    list?: string[][];
  };
}

/** Маппинг Binance-style interval → Bybit v5 interval label. */
function bybitIntervalFromBinance(interval: string): string {
  const table: Record<string, string> = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "12h": "720",
    "1d": "D",
    "1w": "W",
    "1M": "M",
  };
  return table[interval] ?? "D";
}

function bybitRowToCandle(row: string[]): Candle {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

/**
 * Bybit spot первичен (чистая история без funding-ы и инвертных квот). Если
 * spot не существует / пусто — пробуем linear (USDT-perp) как fallback.
 */
async function fetchBybitOnce(opts: {
  category: "spot" | "linear";
  symbol: string;
  interval: string;
  endMs: number;
  limit?: number;
}): Promise<BybitKlineResponse> {
  const url = new URL("https://api.bybit.com/v5/market/kline");
  url.searchParams.set("category", opts.category);
  url.searchParams.set("symbol", opts.symbol.replace("/", "").toUpperCase());
  url.searchParams.set("interval", bybitIntervalFromBinance(opts.interval));
  url.searchParams.set("end", String(opts.endMs));
  url.searchParams.set("limit", String(opts.limit ?? 1000));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Bybit HTTP ${res.status}: ${txt}`);
  }
  return (await res.json()) as BybitKlineResponse;
}

async function fetchBybitPaginated(opts: {
  category: "spot" | "linear";
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  onChunk?: (loaded: number) => void;
}): Promise<{ candles: Candle[]; oldestInBatchMs: number | null }> {
  const { category, symbol, interval, startMs, endMs, onChunk } = opts;
  const out: Candle[] = [];
  let cursor = endMs;
  let oldestInBatch: number | null = null;
  let guard = 500;

  while (guard-- > 0) {
    const json = await fetchBybitPage({ category, symbol, interval, endMs: cursor });
    if (json.retCode !== 0) {
      throw new Error(`Bybit API ${json.retCode}: ${json.retMsg || "unknown error"}`);
    }
    const list = json.result?.list ?? [];
    if (list.length === 0) break;

    /** Bybit отдаёт newest-first → разворачиваем для монотонного обхода. */
    const batch = list.map(bybitRowToCandle).reverse();
    oldestInBatch = batch[0]!.time * 1000;

    for (const c of batch) {
      if (c.time * 1000 >= startMs && c.time * 1000 <= endMs) out.push(c);
    }
    onChunk?.(out.length);

    if (oldestInBatch <= startMs) break;
    /** next page = строго старше текущего самого старого. */
    cursor = oldestInBatch - 1;
    if (batch.length < 1000) break;
  }

  return { candles: out, oldestInBatchMs: oldestInBatch };
}

/** Tiny helper to keep retry/fallback логика читаемой. */
async function fetchBybitPage(opts: {
  category: "spot" | "linear";
  symbol: string;
  interval: string;
  endMs: number;
}): Promise<BybitKlineResponse> {
  return fetchBybitOnce({ ...opts, limit: 1000 });
}

export async function fetchBybitKlinesServer(opts: {
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
  /**
   * Сначала пробуем spot — там нет funding-ы и тики чище. Если spot символа
   * нет (пустой ответ или ошибка «not found») — пробуем linear (USDT-perp).
   */
  let result = await fetchBybitPaginated({ ...opts, category: "spot" }).catch(() => null);
  let usedCategory: "spot" | "linear" = "spot";

  if (!result || result.candles.length === 0) {
    const linear = await fetchBybitPaginated({ ...opts, category: "linear" }).catch(() => null);
    if (linear && linear.candles.length > 0) {
      result = linear;
      usedCategory = "linear";
    }
  }

  if (!result) {
    throw new Error("Bybit вернул пустой ответ и для spot, и для linear.");
  }

  const merged = mergeCandlesSorted([], result.candles).filter(
    (c) => c.time * 1000 >= opts.startMs && c.time * 1000 <= opts.endMs,
  );

  let warning: string | undefined;
  if (merged.length && merged[0]!.time * 1000 > opts.startMs + 60_000) {
    warning =
      `Bybit (${usedCategory}) отдал данные только с ` +
      `${new Date(merged[0]!.time * 1000).toISOString().slice(0, 10)}; ` +
      `запрошенный период начинался раньше — листинг на Bybit более поздний.`;
  }

  return {
    candles: merged,
    oldestAvailableMs: result.oldestInBatchMs,
    warning,
  };
}

/** Forward-only вариант для cache extension — Bybit endpoint один и тот же. */
export async function fetchBybitKlinesForward(opts: {
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  onChunk?: (loaded: number) => void;
}): Promise<Candle[]> {
  const r = await fetchBybitKlinesServer(opts);
  return r.candles;
}
