/**
 * Hard-coded market-cap snapshot for the "marketCap" strategy and the
 * Black-Litterman *equilibrium* prior. Refreshed manually — see comment.
 *
 * Snapshot date: 2026-05 (approximate spot USD market cap, in USD).
 * If a selected symbol is not in this table, `marketCapWeights()` falls back
 * to the mean cap of the table and surfaces a "limited data" warning.
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
  if (symbols.length === 0) {
    return { weights: [], fallbackSymbols: [] };
  }
  const known = Object.values(MARKET_CAP_SNAPSHOT);
  const meanCap = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length);
  const fallback: string[] = [];

  const caps = symbols.map((s) => {
    const cap = MARKET_CAP_SNAPSHOT[s];
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
