/**
 * OKX Spot history-candles fetcher (server-side).
 *
 * OKX is the canonical venue for OKB and a useful fallback for tokens that
 * Binance hasn't (or won't) list. Endpoint contract:
 *   GET https://www.okx.com/api/v5/market/history-candles
 *     ?instId=OKB-USDT&bar=1Dutc&after=<ms>&limit=100
 *   Response: { code: "0", msg: "", data: [[ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm], ...] }
 *   - data sorted **newest-first**
 *   - ts is unix-ms as string
 *   - vol is base-currency units (same convention as Binance row[5])
 *
 * Pagination: pass `after=<ms>` to get candles with ts < after. Walk backwards
 * until oldestInBatch <= startMs or empty response.
 *
 * Rate limit: 20 req / 2s for public history-candles. We're fine — typical
 * call is one symbol × ~30 batches × 100 daily candles = ~3000 days back.
 */

import type { Candle } from "@/types/candle";
import { mergeCandlesSorted } from "@/lib/backtest/ohlcvUtils";
import { fetchWithTimeout } from "@/lib/server/safeFetch";

interface OkxResponse {
  code: string;
  msg: string;
  data: string[][];
}

const OKX_DAILY_BAR_DEFAULT = "1Dutc";

function okxBarFromInterval(interval: string): string {
  const table: Record<string, string> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "2h": "2H",
    "4h": "4H",
    "6h": "6Hutc",
    "12h": "12Hutc",
    "1d": "1Dutc",
    "3d": "3Dutc",
    "1w": "1Wutc",
    "1M": "1Mutc",
  };
  return table[interval] ?? OKX_DAILY_BAR_DEFAULT;
}

/**
 * Maps a Binance-style symbol to an OKX instId.
 *   BTCUSDT → BTC-USDT, OKBUSDT → OKB-USDT, ETHUSDC → ETH-USDC.
 */
export function okxInstIdFromSymbol(symbol: string): string {
  const sym = symbol.toUpperCase();
  if (sym.endsWith("USDT")) return `${sym.slice(0, -4)}-USDT`;
  if (sym.endsWith("USDC")) return `${sym.slice(0, -4)}-USDC`;
  if (sym.endsWith("BTC")) return `${sym.slice(0, -3)}-BTC`;
  return sym;
}

function okxRowToCandle(row: string[]): Candle {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

export async function fetchOkxKlinesServer(opts: {
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
  const instId = okxInstIdFromSymbol(symbol);
  const bar = okxBarFromInterval(interval);

  const out: Candle[] = [];
  let after = endMs + 1; // exclusive upper: get records strictly before this ts
  let oldestInBatch: number | null = null;
  let guard = 500;

  while (guard-- > 0) {
    const url = new URL("https://www.okx.com/api/v5/market/history-candles");
    url.searchParams.set("instId", instId);
    url.searchParams.set("bar", bar);
    url.searchParams.set("after", String(after));
    url.searchParams.set("limit", "100");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OKX ${res.status}: ${txt}`);
    }
    const json = (await res.json()) as OkxResponse;
    if (json.code !== "0") {
      throw new Error(`OKX API ${json.code}: ${json.msg || "unknown error"}`);
    }
    if (!json.data?.length) break;

    // Reverse to oldest-first within the batch so we walk timestamps monotonically.
    const batch = json.data.map(okxRowToCandle).reverse();
    oldestInBatch = batch[0]!.time * 1000;

    for (const c of batch) {
      if (c.time * 1000 >= startMs && c.time * 1000 <= endMs) out.push(c);
    }
    onChunk?.(out.length);

    if (oldestInBatch <= startMs) break;
    after = oldestInBatch; // next batch: anything older than current oldest
    if (batch.length < 100) break;
  }

  const candles = mergeCandlesSorted([], out).filter(
    (c) => c.time * 1000 >= startMs && c.time * 1000 <= endMs,
  );

  let warning: string | undefined;
  if (candles.length && candles[0]!.time * 1000 > startMs + 60_000) {
    warning = `OKX отдал данные только с ${new Date(candles[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
  }

  return {
    candles,
    oldestAvailableMs: oldestInBatch,
    warning,
  };
}

/** Forward-only variant for cache extension — mirrors fetchBinanceKlinesForward shape. */
export async function fetchOkxKlinesForward(opts: {
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  onChunk?: (loaded: number) => void;
}): Promise<Candle[]> {
  // OKX history-candles only walks backward via `after`. For "fill the tail",
  // we just fetch backward from endMs and filter by startMs.
  const r = await fetchOkxKlinesServer(opts);
  return r.candles;
}
