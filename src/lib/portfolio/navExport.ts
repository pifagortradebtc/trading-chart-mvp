/**
 * Export shape for the Pifagor Fund (`Криптофонд`) backend.
 *
 * The fund's admin panel accepts a JSON payload at
 *   PUT /admin/portfolio/composition
 * matching `ReplaceCompositionDto` in apps/backend/src/portfolio/dto/composition.dto.ts:
 *
 *   { items: [{ id?, symbol, name, weight: 0-100, category }] }
 *
 * Symbol is the *bare ticker* (no USDT suffix); allowed values are the keys of
 * SYMBOL_TO_COINGECKO_ID in price-feed.service.ts plus "USDT" for CASH.
 * Weights are *percent* 0-100 with max 4 decimal places, sum must equal 100
 * with tolerance ±0.01 (WEIGHT_TOTAL_TOLERANCE in composition.service.ts).
 *
 * This module is presentation-only: it transforms an in-memory `StrategyResult`
 * into the exact JSON the admin panel expects. The transport (cookie-auth POST)
 * is intentionally not handled here — copy/paste into the admin form (or
 * scripted curl with an admin cookie) keeps trading-chart-mvp decoupled.
 */

import { prettySymbol } from "./format";

/**
 * Фонд работает 100% spot (боты и ручная торговля свёрнуты, user decision
 * 2026-06-12). BOT_TRADING / MANUAL_TRADING удалены; CASH остаётся для
 * USDT-позиции, если она когда-либо появится в basket'е.
 */
export type NavCategory = "SPOT" | "CASH";

export interface NavCompositionItem {
  symbol: string;
  name: string;
  weight: number;
  category: NavCategory;
}

export interface NavExportResult {
  payload: { items: NavCompositionItem[] };
  warnings: string[];
  sumPercent: number;
}

/**
 * Maps the basket symbol (e.g. "BTCUSDT") used by trading-chart-mvp to the
 * bare ticker the fund backend expects ("BTC"). Aliases for stable-coin
 * quote variants are collapsed.
 */
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC",
  BTCUSDC: "BTC",
  ETHUSDT: "ETH",
  ETHUSDC: "ETH",
  BNBUSDT: "BNB",
  BNBUSDC: "BNB",
  SOLUSDT: "SOL",
  SOLUSDC: "SOL",
  OKBUSDT: "OKB",
  MNTUSDT: "MNT",
  HYPEUSDT: "HYPE",
  TONUSDT: "TON",
};

/** Bare tickers accepted by the fund backend (kept in sync with SUPPORTED_SPOT_SYMBOLS). */
const ALLOWED_FUND_SYMBOLS = new Set<string>([
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "OKB",
  "MNT",
  "HYPE",
  "TON",
  "USDT",
]);

const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  BNB: "BNB",
  SOL: "Solana",
  OKB: "OKB",
  MNT: "Mantle",
  HYPE: "Hyperliquid",
  TON: "The Open Network",
  USDT: "Tether USD",
};

/**
 * Build the NAV-import payload from finalFund weights.
 *
 *   - Filters out symbols not in the fund's whitelist (warns).
 *   - Renormalizes remaining weights to sum to exactly 100.0%.
 *   - Drops dust positions (< 0.05% after renormalize) to avoid 50+ tickers
 *     from numerical noise — the backend hard-caps items at 50.
 *
 * Фонд 100% spot — sleeve-логика (bot/manual → CASH) удалена.
 * Returns the full JSON payload, plus diagnostic warnings.
 */
export function buildNavExport(args: {
  weights: number[];
  symbols: string[];
}): NavExportResult {
  const { weights, symbols } = args;
  const warnings: string[] = [];

  // 1. Map to fund tickers; collect unmapped.
  type Row = { symbol: string; raw: number };
  const mapped: Row[] = [];
  const dropped: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const fundSym = SYMBOL_MAP[symbols[i]];
    if (!fundSym || !ALLOWED_FUND_SYMBOLS.has(fundSym)) {
      if (weights[i] > 1e-6) dropped.push(prettySymbol(symbols[i]));
      continue;
    }
    mapped.push({ symbol: fundSym, raw: Math.max(0, weights[i]) });
  }
  if (dropped.length > 0) {
    warnings.push(
      `Не экспортированы (нет в whitelist фонда): ${dropped.join(", ")}. ` +
        `Добавь их сначала в SUPPORTED_SPOT_SYMBOLS в Криптофонде.`
    );
  }

  // 2. Merge duplicate tickers (e.g. BTCUSDT + BTCUSDC both map to BTC).
  // Фонд 100% spot — никакого sleeve-скейлинга, веса идут как есть.
  const merged = new Map<string, number>();
  for (const r of mapped) {
    const cur = merged.get(r.symbol) ?? 0;
    merged.set(r.symbol, cur + r.raw);
  }

  // 3. Drop dust (< 0.05% of total).
  const totalPre = [...merged.values()].reduce((a, b) => a + b, 0);
  if (totalPre <= 0) {
    return {
      payload: { items: [] },
      warnings: ["Все веса нулевые — экспортировать нечего."],
      sumPercent: 0,
    };
  }
  const dust = 0.0005; // 0.05%
  for (const [sym, w] of merged.entries()) {
    if (w / totalPre < dust && sym !== "USDT") {
      merged.delete(sym);
    }
  }

  // 4. Renormalize to sum=1.0, then convert to percent with 4 decimals.
  // Round-then-fix: due to per-item rounding, sum can be 99.9996 / 100.0004;
  // we absorb the residual into the largest position so backend's ±0.01
  // tolerance is comfortably met.
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  const items: NavCompositionItem[] = [];
  let totalPct = 0;
  let largestIdx = -1;
  let largestPct = -1;
  for (const [symbol, w] of merged.entries()) {
    const pct = +((w / total) * 100).toFixed(4);
    const category: NavCategory = symbol === "USDT" ? "CASH" : "SPOT";
    items.push({
      symbol,
      name: ASSET_NAMES[symbol] ?? symbol,
      weight: pct,
      category,
    });
    totalPct += pct;
    if (pct > largestPct) {
      largestPct = pct;
      largestIdx = items.length - 1;
    }
  }
  const residual = +(100 - totalPct).toFixed(4);
  if (Math.abs(residual) > 0 && largestIdx >= 0) {
    items[largestIdx].weight = +(items[largestIdx].weight + residual).toFixed(4);
  }
  const sumPercent = items.reduce((a, b) => a + b.weight, 0);
  if (Math.abs(sumPercent - 100) > 0.01) {
    warnings.push(
      `После нормализации сумма ${sumPercent.toFixed(4)}%, отклонение > 0.01% — бэкенд отклонит.`
    );
  }

  // Sort SPOT desc by weight, CASH last — это удобный читаемый порядок.
  items.sort((a, b) => {
    if (a.category !== b.category) return a.category === "CASH" ? 1 : -1;
    return b.weight - a.weight;
  });

  if (items.length > 50) {
    warnings.push(`${items.length} позиций > 50 — backend cap. Уменьши basket.`);
  }

  return { payload: { items }, warnings, sumPercent };
}
