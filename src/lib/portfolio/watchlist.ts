import type { AssetDataQuality } from "./dataQuality";
import { clusterOf } from "./clusters";

/**
 * Watchlist — assets the fund tracks but does not currently allocate to.
 *
 * Two flavors:
 *   1. In-basket but excluded (`reason: "no-data" | "uncategorized"
 *      | "effectively-zero"`) — these were considered but didn't earn weight.
 *   2. Out-of-basket honorary mentions (`reason: "honorary"`) — well-known
 *      tickers Pifagor Fund tracks for context, not currently held.
 *
 * Status drives the UI tone: rose = blocking constraint (no-data),
 * amber = soft constraint (uncategorized), faint = informational.
 */

export type WatchlistReason =
  | "no-data"
  | "uncategorized"
  | "effectively-zero"
  | "honorary";

export interface WatchlistEntry {
  symbol: string;
  reason: WatchlistReason;
  /** Human-readable explanation surfaced in the row. */
  detail: string;
  /** Weight in the current portfolio (0 if out-of-basket). */
  currentWeight: number;
}

/** Tickers the fund tracks even when they're not in the active basket. */
const HONORARY = [
  { symbol: "ARBUSDT", detail: "Лидер по L2 TVL — наблюдаем за rotation в Alpha." },
  { symbol: "OPUSDT", detail: "Superchain экосистема — отдельная динамика от ARB." },
  { symbol: "AVAXUSDT", detail: "High-beta L1 — резервный кандидат к SOL/TON." },
  { symbol: "DOGEUSDT", detail: "Memе-индекс рынка — sentiment proxy без покупки." },
];

const EFFECTIVELY_ZERO_THRESHOLD = 0.002;

export interface BuildWatchlistArgs {
  weights: number[];
  symbols: string[];
  dataQuality: AssetDataQuality[] | null;
}

export function buildWatchlist(args: BuildWatchlistArgs): WatchlistEntry[] {
  const { weights, symbols, dataQuality } = args;
  const dqBySymbol = new Map<string, AssetDataQuality>();
  if (dataQuality) for (const dq of dataQuality) dqBySymbol.set(dq.symbol, dq);

  const out: WatchlistEntry[] = [];

  for (let i = 0; i < weights.length; i++) {
    const sym = symbols[i];
    const w = weights[i];
    const dq = dqBySymbol.get(sym);

    if (dq?.status === "no-data") {
      out.push({
        symbol: sym,
        reason: "no-data",
        detail: `${dq.dailyCount} дней истории — исключён до накопления данных.`,
        currentWeight: w,
      });
      continue;
    }
    if (clusterOf(sym) === "other") {
      out.push({
        symbol: sym,
        reason: "uncategorized",
        detail: "Не классифицирован в таксономии фонда — нужно отнести к кластеру до полноценного включения.",
        currentWeight: w,
      });
      continue;
    }
    if (w > 0 && w < EFFECTIVELY_ZERO_THRESHOLD) {
      out.push({
        symbol: sym,
        reason: "effectively-zero",
        detail: `Модели дали ${(w * 100).toFixed(2)}% — ниже минимального исполнимого тикета.`,
        currentWeight: w,
      });
    }
  }

  // Honorary entries — only those not already in the basket.
  const inBasket = new Set(symbols);
  for (const h of HONORARY) {
    if (inBasket.has(h.symbol)) continue;
    out.push({
      symbol: h.symbol,
      reason: "honorary",
      detail: h.detail,
      currentWeight: 0,
    });
  }

  // Sort: blocking constraints first.
  const rank: Record<WatchlistReason, number> = {
    "no-data": 0,
    uncategorized: 1,
    "effectively-zero": 2,
    honorary: 3,
  };
  out.sort((a, b) => rank[a.reason] - rank[b.reason]);
  return out;
}
