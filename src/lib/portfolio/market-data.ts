"use client";

import type { Candle } from "@/types/candle";
import type { Kline, PriceSeries } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FetchKlinesOptions {
  symbol: string;
  days: number;
}

/**
 * Pulls daily closes for a single symbol via the project's own `/api/ohlcv`
 * proxy, which is backed by Binance Spot klines and a server-side disk cache.
 * Returns the compact `{ time, close }` shape MPT math expects (timestamps
 * in milliseconds), even though Candle.time is stored in seconds.
 */
export async function fetchPortfolioCloses(
  opts: FetchKlinesOptions
): Promise<Kline[]> {
  const endMs = Date.now();
  const startMs = endMs - opts.days * DAY_MS;
  const yearsBack = Math.max(1, Math.min(12, Math.ceil(opts.days / 365)));

  const url = new URL("/api/ohlcv", window.location.origin);
  url.searchParams.set("symbol", opts.symbol.toUpperCase());
  url.searchParams.set("interval", "1d");
  url.searchParams.set("startMs", String(startMs));
  url.searchParams.set("endMs", String(endMs));
  url.searchParams.set("yearsBack", String(yearsBack));

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json()) as
    | { candles: Candle[]; warning?: string }
    | { error: string };
  if (!res.ok || "error" in json) {
    throw new Error(
      `${opts.symbol}: ${"error" in json ? json.error : res.statusText}`
    );
  }

  const klines: Kline[] = json.candles.map((c) => ({
    time: c.time * 1000,
    close: c.close,
    volume: c.volume,
  }));
  return dedupAndSort(klines).filter((k) => k.time >= startMs);
}

function dedupAndSort(klines: Kline[]): Kline[] {
  const map = new Map<number, Kline>();
  for (const k of klines) map.set(k.time, k);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/**
 * Aligns multiple kline series on the intersection of timestamps. Different
 * assets list at different times — we only keep days where every selected
 * asset has a close price.
 */
export function alignSeries(
  series: { symbol: string; klines: Kline[] }[]
): PriceSeries[] {
  if (series.length === 0) return [];

  let common: Set<number> | null = null;
  for (const s of series) {
    const times = new Set(s.klines.map((k) => k.time));
    if (!common) common = times;
    else common = intersection(common, times);
  }
  const sortedTimes = [...(common ?? [])].sort((a, b) => a - b);

  return series.map((s) => {
    const byTime = new Map(s.klines.map((k) => [k.time, k]));
    const hasVolume = s.klines.some(
      (k) => typeof k.volume === "number" && Number.isFinite(k.volume)
    );
    return {
      symbol: s.symbol,
      times: sortedTimes,
      prices: sortedTimes.map((t) => byTime.get(t)!.close),
      volumes: hasVolume
        ? sortedTimes.map((t) => byTime.get(t)?.volume ?? 0)
        : undefined,
    };
  });
}

function intersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const v of small) if (big.has(v)) out.add(v);
  return out;
}
