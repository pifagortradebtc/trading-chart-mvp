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

export type OhlcvSource = "binance" | "okx" | "coingecko" | "bybit";

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
    source: "bybit",
    note: "HYPE (Hyperliquid) не торгуется на Binance Spot. Берём с Bybit — listing ~декабрь 2024, дольше чем CoinGecko free tier (365д).",
  },
  MNTUSDT: {
    source: "bybit",
    note: "MNT (Mantle) на Binance/OKX отсутствует. Берём с Bybit — listing 2023, заметно длиннее истории чем CoinGecko free tier.",
  },
};

export function pickOhlcvSource(symbol: string): SourceConfig {
  return OVERRIDES[symbol.toUpperCase()] ?? { source: "binance" };
}

/** Filename prefix per source so caches don't collide across venues. */
export function sourceFilenamePrefix(source: OhlcvSource): string {
  return source === "binance" ? "" : `${source}_`;
}
