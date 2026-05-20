/**
 * CoinGecko daily-history fetcher (server-side).
 *
 * Used as a data source for assets that don't list on Binance Spot or OKX —
 * e.g. HYPE (Hyperliquid native), or as a generic fallback for niche tokens.
 *
 * Endpoint contract:
 *   GET https://api.coingecko.com/api/v3/coins/{id}/market_chart
 *     ?vs_currency=usd&days=max&interval=daily
 *   Response: {
 *     prices:        [[ms, price_usd], ...],
 *     market_caps:   [[ms, cap_usd], ...],
 *     total_volumes: [[ms, vol_usd], ...]
 *   }
 *
 * OHLC synthesis: CoinGecko's market_chart returns daily close only. We
 * synthesize open=prev_close, high=max(open,close), low=min(open,close).
 * This is a known compromise — the H/L will under-state daily range, but
 * downstream portfolio math (MPT, HRP, momentum, etc.) all consume close-
 * to-close returns only, so the synthetic H/L is cosmetic.
 *
 * Volume convention: Binance row[5] is **base-asset** volume. CoinGecko
 * total_volumes is USD volume. We convert: vol_base ≈ vol_usd / close_usd
 * so the downstream `liquidity.ts` formula `close * volume = usd_volume`
 * keeps producing the right number.
 *
 * Rate limit: free tier 5-30 req/min unkeyed. Since we cache to disk, a
 * single one-off load per asset suffices.
 */

import type { Candle } from "@/types/candle";
import { mergeCandlesSorted } from "@/lib/backtest/ohlcvUtils";

interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

/**
 * Maps a Binance-style symbol to a CoinGecko coin id. We keep this table
 * hand-maintained — there's no reliable algorithmic mapping (CMC slugs and
 * CoinGecko ids diverge for many tokens).
 */
const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
  HYPEUSDT: "hyperliquid",
  HYPEUSDC: "hyperliquid",
  // Spares for future use — not currently routed here unless added in ohlcvSource.
  OKBUSDT: "okb",
  MNTUSDT: "mantle",
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  TONUSDT: "the-open-network",
};

export function coingeckoIdFromSymbol(symbol: string): string {
  const sym = symbol.toUpperCase();
  const id = COINGECKO_ID_BY_SYMBOL[sym];
  if (!id) {
    throw new Error(
      `Нет маппинга CoinGecko для ${sym}. Добавьте запись в COINGECKO_ID_BY_SYMBOL.`,
    );
  }
  return id;
}

/** Normalize ms to the start-of-UTC-day to align with daily Binance/OKX bars. */
function startOfUtcDayMs(ms: number): number {
  return Math.floor(ms / 86_400_000) * 86_400_000;
}

export async function fetchCoinGeckoDailyServer(opts: {
  symbol: string;
  startMs: number;
  endMs: number;
}): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  const { symbol, startMs, endMs } = opts;
  const coinId = coingeckoIdFromSymbol(symbol);

  // CoinGecko free tier (since 2025) ограничивает `market_chart` 365 днями
  // истории — `days=max` возвращает 401 с error_code 10012. Кэп просим то,
  // что реально влезает в free tier; для активов вроде HYPE (~17 месяцев
  // на 2026-05) этого достаточно — мы получим почти всю историю с листинга.
  // Для активов с более длинной историей (например, BTC через CoinGecko)
  // потеряем хвост — но в нашем universe такие тикеры идут через Binance.
  const requestedDays = Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
  const days = Math.min(365, requestedDays);

  const url = new URL(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`,
  );
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", String(days));
  url.searchParams.set("interval", "daily");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`CoinGecko ${res.status}: ${txt}`);
  }
  const json = (await res.json()) as MarketChartResponse;
  if (!Array.isArray(json.prices) || json.prices.length === 0) {
    return { candles: [], oldestAvailableMs: null };
  }

  // CoinGecko sometimes returns intra-day buckets (especially near the tail
  // for active tokens). Normalize to start-of-UTC-day and keep one bucket per
  // day — the latest within that day.
  const closeByDay = new Map<number, number>();
  for (const [ms, price] of json.prices) {
    const day = startOfUtcDayMs(ms);
    closeByDay.set(day, price); // later writes overwrite — fine since prices is asc
  }
  const volByDay = new Map<number, number>();
  for (const [ms, volUsd] of json.total_volumes) {
    const day = startOfUtcDayMs(ms);
    volByDay.set(day, volUsd); // last vol of the day
  }

  const sortedDays = [...closeByDay.keys()].sort((a, b) => a - b);
  if (sortedDays.length === 0) {
    return { candles: [], oldestAvailableMs: null };
  }

  const candles: Candle[] = [];
  let prevClose = closeByDay.get(sortedDays[0]!)!;
  for (const day of sortedDays) {
    const close = closeByDay.get(day)!;
    const open = candles.length === 0 ? close : prevClose;
    const volUsd = volByDay.get(day) ?? 0;
    // Convert USD volume → base-asset units so liquidity.ts (close * volume)
    // reconstructs the original USD figure.
    const volume = close > 0 ? volUsd / close : 0;
    candles.push({
      time: Math.floor(day / 1000),
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume,
    });
    prevClose = close;
  }

  const oldestAvailableMs = candles[0]!.time * 1000;
  const filtered = mergeCandlesSorted([], candles).filter((c) => {
    const t = c.time * 1000;
    return t >= startMs && t <= endMs;
  });

  let warning: string | undefined;
  if (filtered.length && filtered[0]!.time * 1000 > startMs + 86_400_000) {
    warning = `CoinGecko отдал данные только с ${new Date(filtered[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
  }

  return { candles: filtered, oldestAvailableMs, warning };
}
