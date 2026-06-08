import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  getPersistentRoot,
  readJsonFile,
  writeJsonFile,
} from "@/lib/server/persistentStore";
import { SPOT_PRICE_SNAPSHOT } from "@/lib/portfolio/marketCaps";

export const runtime = "nodejs";

/**
 * Live spot-price proxy → CoinGecko, with a 5-minute disk cache on
 * PERSISTENT_DISK_ROOT (Render mount) or ./.cache-disk locally.
 *
 * Contract:
 *   GET /api/spotprices
 *   GET /api/spotprices?symbols=BTC,ETH
 *     200 → { prices: { BTC: 68000, ... }, fetchedAt: epochMs, source: "coingecko" | "snapshot" }
 *
 * Unlike market caps (6h TTL), spot prices need a much tighter TTL because
 * they move materially within minutes. On any CoinGecko failure we degrade
 * gracefully to the hard-coded SPOT_PRICE_SNAPSHOT and report source:"snapshot"
 * so the client can show a stale-data indicator.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const COINGECKO_TIMEOUT_MS = 10_000;

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  XRPUSDT: "ripple",
  ADAUSDT: "cardano",
  DOGEUSDT: "dogecoin",
  AVAXUSDT: "avalanche-2",
  LINKUSDT: "chainlink",
  DOTUSDT: "polkadot",
  ATOMUSDT: "cosmos",
  LTCUSDT: "litecoin",
  TONUSDT: "the-open-network",
  HYPEUSDT: "hyperliquid",
  OKBUSDT: "okb",
  MNTUSDT: "mantle",
};

interface SpotPricePayload {
  prices: Record<string, number>;
  fetchedAt: number;
  source: "coingecko" | "snapshot";
}

interface CachedPayload {
  prices: Record<string, number>;
  fetchedAt: number;
  source: "coingecko";
}

interface CoinGeckoRow {
  id: string;
  current_price: number;
}

function cacheFile(): string {
  return path.join(getPersistentRoot(), "spotprices.json");
}

/** Strip the trailing USDT (or other quote) and return the bare base symbol. */
function bareSymbol(ticker: string): string {
  return ticker.replace(/USDT$/i, "").toUpperCase();
}

function filterBySymbols(
  prices: Record<string, number>,
  symbolsParam: string | null
): Record<string, number> {
  if (!symbolsParam) return prices;
  const requested = new Set(
    symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
  if (requested.size === 0) return prices;
  const filtered: Record<string, number> = {};
  for (const [sym, price] of Object.entries(prices)) {
    if (requested.has(sym)) filtered[sym] = price;
  }
  return filtered;
}

function snapshotResponse(symbolsParam: string | null): NextResponse {
  const prices = filterBySymbols(SPOT_PRICE_SNAPSHOT, symbolsParam);
  return NextResponse.json({
    prices,
    fetchedAt: Date.now(),
    source: "snapshot",
  } satisfies SpotPricePayload);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const file = cacheFile();

  // 1. Try disk cache
  const cached = await readJsonFile<CachedPayload>(file);
  if (cached && cached.prices) {
    const age = Date.now() - cached.fetchedAt;
    if (Number.isFinite(age) && age >= 0 && age < TTL_MS) {
      return NextResponse.json({
        prices: filterBySymbols(cached.prices, symbolsParam),
        fetchedAt: cached.fetchedAt,
        source: "coingecko",
      } satisfies SpotPricePayload);
    }
  }

  // 2. Hit CoinGecko
  const ids = Object.values(COINGECKO_IDS).join(",");
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${encodeURIComponent(ids)}` +
    `&order=market_cap_desc&per_page=100&page=1&sparkline=false&locale=en`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COINGECKO_TIMEOUT_MS);

  let rows: CoinGeckoRow[];
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "pifagor-fund/spotprices (+https://pifagor.fund)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return snapshotResponse(symbolsParam);
    }
    rows = (await res.json()) as CoinGeckoRow[];
  } catch {
    return snapshotResponse(symbolsParam);
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(rows)) {
    return snapshotResponse(symbolsParam);
  }

  // 3. Map CoinGecko ids back to bare base symbols (BTC, ETH, …)
  const idToBare: Record<string, string> = {};
  for (const [ticker, id] of Object.entries(COINGECKO_IDS)) {
    idToBare[id] = bareSymbol(ticker);
  }

  const prices: Record<string, number> = {};
  for (const row of rows) {
    const sym = idToBare[row.id];
    if (!sym) continue;
    if (
      typeof row.current_price === "number" &&
      Number.isFinite(row.current_price) &&
      row.current_price > 0
    ) {
      prices[sym] = row.current_price;
    }
  }

  if (Object.keys(prices).length === 0) {
    return snapshotResponse(symbolsParam);
  }

  const fetchedAt = Date.now();
  const cachePayload: CachedPayload = {
    prices,
    fetchedAt,
    source: "coingecko",
  };

  // 4. Persist (best-effort — never block the response on disk errors)
  try {
    await writeJsonFile(file, cachePayload);
  } catch {
    // ignore — next request will just re-fetch
  }

  return NextResponse.json({
    prices: filterBySymbols(prices, symbolsParam),
    fetchedAt,
    source: "coingecko",
  } satisfies SpotPricePayload);
}
