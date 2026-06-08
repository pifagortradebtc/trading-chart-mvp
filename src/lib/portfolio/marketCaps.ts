/**
 * Hard-coded market-cap snapshot for the "marketCap" strategy and the
 * Black-Litterman *equilibrium* prior. Refreshed manually — see comment.
 *
 * Snapshot date: 2026-05 (approximate spot USD market cap, in USD).
 * If a selected symbol is not in this table, `marketCapWeights()` falls back
 * to the mean cap of the table and surfaces a "limited data" warning.
 *
 * Live override: `fetchLiveMarketCaps()` pulls from /api/marketcaps (CoinGecko
 * with 6h disk cache). `marketCapWeightsWithLive()` consumes that override
 * when present and falls back to the static snapshot otherwise.
 */

export const MARKET_CAP_SNAPSHOT: Record<string, number> = {
  BTCUSDT: 1_800_000_000_000,
  ETHUSDT: 400_000_000_000,
  SOLUSDT: 90_000_000_000,
  BNBUSDT: 100_000_000_000,
  XRPUSDT: 110_000_000_000,
  ADAUSDT: 25_000_000_000,
  DOGEUSDT: 25_000_000_000,
  AVAXUSDT: 18_000_000_000,
  LINKUSDT: 12_000_000_000,
  DOTUSDT: 11_000_000_000,
  ATOMUSDT: 5_000_000_000,
  LTCUSDT: 8_000_000_000,
  HYPEUSDT: 12_000_000_000,
  TONUSDT: 15_000_000_000,
  OKBUSDT: 4_000_000_000,
  MNTUSDT: 2_500_000_000,
};

export interface MarketCapWeightResult {
  weights: number[];
  /** Symbols that were missing from the snapshot and got a fallback cap. */
  fallbackSymbols: string[];
}

/**
 * Returns market-cap weights for the supplied symbols, normalized to sum=1.
 * Missing symbols receive the mean cap of the snapshot (so they are not
 * silently dropped). Caller can surface `fallbackSymbols` in the UI.
 */
export function marketCapWeights(symbols: string[]): MarketCapWeightResult {
  return marketCapWeightsWithLive(symbols);
}

/**
 * Same as `marketCapWeights` but accepts an explicit market-cap override
 * (e.g. the live CoinGecko response from `/api/marketcaps`). When `override`
 * is missing or empty the function falls back to `MARKET_CAP_SNAPSHOT`.
 *
 * Per-symbol fallback: if a symbol is missing in `override` AND `snapshot`,
 * the mean cap of the active source is used and the symbol is surfaced in
 * `fallbackSymbols` so the UI can show a "limited data" hint.
 */
export function marketCapWeightsWithLive(
  symbols: string[],
  override?: Record<string, number> | null
): MarketCapWeightResult {
  if (symbols.length === 0) {
    return { weights: [], fallbackSymbols: [] };
  }
  const useLive = override && Object.keys(override).length > 0;
  const source: Record<string, number> = useLive
    ? { ...MARKET_CAP_SNAPSHOT, ...override } // live overrides snapshot per-symbol
    : MARKET_CAP_SNAPSHOT;

  const known = Object.values(source);
  const meanCap = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length);
  const fallback: string[] = [];

  const caps = symbols.map((s) => {
    const cap = source[s];
    if (cap === undefined || cap <= 0) {
      fallback.push(s);
      return meanCap;
    }
    return cap;
  });

  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return {
      weights: symbols.map(() => 1 / symbols.length),
      fallbackSymbols: fallback,
    };
  }
  return {
    weights: caps.map((c) => c / sum),
    fallbackSymbols: fallback,
  };
}

/**
 * Fetches live market caps from the local /api/marketcaps proxy (CoinGecko
 * with disk cache). Returns null on SSR, network errors, or non-200 responses
 * — callers should treat null as "fall back to the static snapshot". Never
 * throws.
 */
export async function fetchLiveMarketCaps(): Promise<Record<string, number> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/marketcaps", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { caps?: Record<string, number> };
    if (!data?.caps || typeof data.caps !== "object") return null;
    // Filter out non-finite/negative values defensively.
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.caps)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) clean[k] = v;
    }
    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}

/**
 * Approximate spot USD prices per bare ticker — used as offline/error
 * fallback when `/api/spotprices` is unreachable or returns an error.
 * Snapshot date: 2026-05. Keep in sync with `MARKET_CAP_SNAPSHOT` symbols.
 */
export const SPOT_PRICE_SNAPSHOT: Record<string, number> = {
  BTC: 65000,
  ETH: 2400,
  BNB: 300,
  SOL: 150,
  OKB: 45,
  MNT: 0.6,
  HYPE: 18,
  TON: 5,
  XRP: 0.55,
  ADA: 0.45,
  DOGE: 0.12,
  AVAX: 30,
  LINK: 14,
  DOT: 6.5,
  ATOM: 8,
  LTC: 75,
  USDT: 1.0,
  USDC: 1.0,
};

/**
 * Fetches live spot USD prices from the local /api/spotprices proxy. Optional
 * `symbols` filter is passed as a comma-joined `?symbols=BTC,ETH` query string
 * (bare tickers, no USDT suffix). Returns null on SSR, network errors, or
 * non-200 responses — callers should treat null as "fall back to
 * `SPOT_PRICE_SNAPSHOT`". Never throws.
 */
export async function fetchLivePrices(
  symbols?: string[]
): Promise<Record<string, number> | null> {
  if (typeof window === "undefined") return null;
  try {
    const qs =
      symbols && symbols.length > 0
        ? `?symbols=${encodeURIComponent(symbols.join(","))}`
        : "";
    const res = await fetch(`/api/spotprices${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { prices?: Record<string, number> };
    if (!data?.prices || typeof data.prices !== "object") return null;
    // Filter out non-finite/negative values defensively.
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.prices)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) clean[k] = v;
    }
    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}
