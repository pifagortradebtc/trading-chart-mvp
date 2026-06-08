/**
 * React hook for live USD spot prices.
 *
 * Wraps `fetchLivePrices()` from `marketCaps.ts` (which proxies to
 * `/api/spotprices`) with React lifecycle: initial fetch, periodic refresh,
 * visibility-driven re-fetch, manual `refresh()`, and reactive `symbols`.
 *
 * Design notes:
 *   - Keys of the returned `prices` map use the **input** symbol verbatim
 *     (e.g. `BTCUSDT`, `USDT`, `BTC`), but the backend is queried with the
 *     *bare* ticker (USDT/USDC suffix stripped). This mirrors how the rest
 *     of the research stack stores symbols (exchange format) while the
 *     spot-price API speaks bare tickers.
 *   - On fetch failure we keep the previous `prices` and only set `error`,
 *     so the UI doesn't flicker to "no data" on transient network blips.
 *   - `stale = true` when more than 30 minutes have elapsed since
 *     `fetchedAt` — UI can dim such rows.
 *   - Each entry's `source` is "coingecko" when the symbol appeared in the
 *     live response, otherwise "snapshot" (we fall back to
 *     `SPOT_PRICE_SNAPSHOT` per-symbol).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SPOT_PRICE_SNAPSHOT,
  fetchLivePrices,
} from "@/lib/portfolio/marketCaps";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min
const VISIBILITY_REFETCH_MS = 30 * 1000; // 30 s

export interface LivePrice {
  priceUsd: number;
  source: "coingecko" | "snapshot";
  fetchedAt: number;
  stale: boolean;
}

export interface LivePricesResult {
  prices: Record<string, LivePrice>;
  lastUpdatedAt: number | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Strip the quote-currency suffix from an exchange-format symbol to get the
 * bare ticker the spot-price API expects. `BTCUSDT` → `BTC`, `USDT` → `USDT`.
 */
function toBareTicker(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith("USDT") && upper.length > 4) return upper.slice(0, -4);
  if (upper.endsWith("USDC") && upper.length > 4) return upper.slice(0, -4);
  return upper;
}

export function useLivePrices(
  symbols: string[],
  intervalMs: number = DEFAULT_INTERVAL_MS,
): LivePricesResult {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable key for the symbols array — re-fetch only when the *contents*
  // change, not on every render that produces a new array reference.
  const symbolsKey = symbols
    .map((s) => s.toUpperCase())
    .sort()
    .join(",");

  // Refs that the fetcher reads — keep them in sync without re-creating
  // the callback (which would re-trigger the effect on every render).
  const symbolsRef = useRef<string[]>(symbols);
  symbolsRef.current = symbols;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSeqRef = useRef(0);
  const lastFetchAtRef = useRef<number>(0);

  const doFetch = useCallback(async (): Promise<void> => {
    const seq = ++fetchSeqRef.current;
    const inputSymbols = symbolsRef.current;
    if (inputSymbols.length === 0) {
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      setPrices({});
      setLastUpdatedAt(Date.now());
      setError(null);
      lastFetchAtRef.current = Date.now();
      return;
    }

    setLoading(true);
    // Map input symbol → bare ticker, dedup the bare tickers we query.
    const bareBySymbol = new Map<string, string>();
    for (const s of inputSymbols) {
      bareBySymbol.set(s, toBareTicker(s));
    }
    const uniqueBares = Array.from(new Set(bareBySymbol.values()));

    try {
      const live = await fetchLivePrices(uniqueBares);
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;

      const fetchedAt = Date.now();
      lastFetchAtRef.current = fetchedAt;

      const next: Record<string, LivePrice> = {};
      for (const symbol of inputSymbols) {
        const bare = bareBySymbol.get(symbol) ?? toBareTicker(symbol);
        const livePrice = live?.[bare];
        if (
          typeof livePrice === "number" &&
          Number.isFinite(livePrice) &&
          livePrice > 0
        ) {
          next[symbol] = {
            priceUsd: livePrice,
            source: "coingecko",
            fetchedAt,
            stale: false,
          };
          continue;
        }
        const snap = SPOT_PRICE_SNAPSHOT[bare];
        if (typeof snap === "number" && snap > 0) {
          next[symbol] = {
            priceUsd: snap,
            source: "snapshot",
            fetchedAt,
            stale: false,
          };
        }
      }

      setPrices(next);
      setLastUpdatedAt(fetchedAt);
      // Treat a null response as a soft error so the UI can hint at it,
      // but we still populated `next` from the snapshot above.
      setError(live === null ? "Live prices unavailable, using snapshot" : null);
    } catch (e: unknown) {
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      // Keep previous prices intact — only flag the error.
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (mountedRef.current && seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Mount + symbols-change fetch, plus interval refresh.
  useEffect(() => {
    void doFetch();
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      void doFetch();
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [symbolsKey, intervalMs, doFetch]);

  // Re-fetch on tab focus if the last fetch is older than 30s.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const since = Date.now() - lastFetchAtRef.current;
      if (since > VISIBILITY_REFETCH_MS) void doFetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [doFetch]);

  // Recompute `stale` flags on each render based on age. We don't mutate
  // state on a timer — staleness is a derived view of `fetchedAt`.
  const now = Date.now();
  const pricesWithStale: Record<string, LivePrice> = {};
  for (const [sym, p] of Object.entries(prices)) {
    const stale = now - p.fetchedAt > STALE_AFTER_MS;
    pricesWithStale[sym] = stale === p.stale ? p : { ...p, stale };
  }

  return {
    prices: pricesWithStale,
    lastUpdatedAt,
    error,
    loading,
    refresh: doFetch,
  };
}
