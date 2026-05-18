import type { ViewInput } from "./strategyTypes";

/**
 * Default Black-Litterman views used as the starting point in the UI.
 * Reflects the Pifagor Fund's standing strategic view: BTC + ETH dominate
 * the book; selective high-conviction alts at smaller weights.
 *
 * Numbers are annual expected returns (0.20 = +20%/year). Confidence is
 * 0..1. maxWeight is a hard cap on that asset's posterior weight.
 */
export const DEFAULT_VIEWS: ViewInput[] = [
  { symbol: "BTCUSDT", expectedReturn: 0.20, confidence: 0.80, maxWeight: 0.65 },
  { symbol: "ETHUSDT", expectedReturn: 0.15, confidence: 0.80, maxWeight: 0.25 },
  { symbol: "SOLUSDT", expectedReturn: 0.40, confidence: 0.60, maxWeight: 0.12 },
  { symbol: "BNBUSDT", expectedReturn: 0.20, confidence: 0.50, maxWeight: 0.08 },
  { symbol: "HYPEUSDT", expectedReturn: 0.60, confidence: 0.35, maxWeight: 0.05 },
  { symbol: "TONUSDT", expectedReturn: 0.30, confidence: 0.40, maxWeight: 0.04 },
  { symbol: "OKBUSDT", expectedReturn: 0.20, confidence: 0.40, maxWeight: 0.03 },
];

/**
 * Returns the views filtered down to the symbols actually in the basket.
 * Unknown symbols receive a neutral default (mid confidence, +15%).
 */
export function defaultViewsForSymbols(symbols: string[]): ViewInput[] {
  const byKey = new Map(DEFAULT_VIEWS.map((v) => [v.symbol, v]));
  return symbols.map(
    (s) =>
      byKey.get(s) ?? {
        symbol: s,
        expectedReturn: 0.15,
        confidence: 0.40,
        maxWeight: 0.10,
      }
  );
}
