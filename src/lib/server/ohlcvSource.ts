/**
 * Routes a symbol to the right OHLCV venue. Centralizes the "where does this
 * asset live" knowledge so the /api/ohlcv route and the cache layer stay
 * agnostic of individual exchanges.
 *
 * Default is Binance Spot (matches the project's original assumption).
 * Overrides cover the two known gaps:
 *   - OKB doesn't list on Binance — it's an OKX-native exchange token.
 *   - HYPE (Hyperliquid) isn't listed on Binance Spot at the time of writing;
 *     CoinGecko aggregates its history across the venues that do list it.
 */

export type OhlcvSource = "binance" | "okx" | "coingecko";

export interface SourceConfig {
  source: OhlcvSource;
  /** Operator-facing reason this symbol is routed elsewhere — surfaced in warnings. */
  note?: string;
}

const OVERRIDES: Record<string, SourceConfig> = {
  OKBUSDT: {
    source: "okx",
    note: "OKB листится только на OKX, не на Binance Spot.",
  },
  HYPEUSDT: {
    source: "coingecko",
    note: "HYPE (Hyperliquid) не торгуется на Binance Spot — история берётся с CoinGecko.",
  },
  MNTUSDT: {
    source: "coingecko",
    note: "MNT (Mantle) на Binance/OKX отсутствует — берём с CoinGecko (free tier ограничен 365 днями).",
  },
};

export function pickOhlcvSource(symbol: string): SourceConfig {
  return OVERRIDES[symbol.toUpperCase()] ?? { source: "binance" };
}

/** Filename prefix per source so caches don't collide across venues. */
export function sourceFilenamePrefix(source: OhlcvSource): string {
  return source === "binance" ? "" : `${source}_`;
}
