import path from "path";
import { NextResponse } from "next/server";
import {
  getPersistentRoot,
  readJsonFile,
  writeJsonFile,
} from "@/lib/server/persistentStore";

export const runtime = "nodejs";

/**
 * Live market-cap proxy → CoinGecko, with a 6h disk cache on
 * PERSISTENT_DISK_ROOT (Render mount) or ./.cache-disk locally.
 *
 * Contract:
 *   GET /api/marketcaps
 *     200 → { caps: { BTCUSDT: 1.8e12, ... }, cachedAt: ISO, source: "coingecko" | "disk" }
 *     502 → { error: string }
 *
 * Cache lifetime is intentional: market caps move <1%/hour for top assets, and
 * CoinGecko's free tier rate-limits at ~30 req/min/IP. The client treats any
 * non-200 as "fall back to the hard-coded snapshot in marketCaps.ts".
 */

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
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

interface CachedPayload {
  caps: Record<string, number>;
  prices: Record<string, number>;
  cachedAt: string;
  source: "coingecko" | "disk";
}

interface CoinGeckoRow {
  id: string;
  market_cap: number;
  current_price: number;
}

function cacheFile(): string {
  return path.join(getPersistentRoot(), "marketcaps.json");
}

export async function GET(): Promise<NextResponse> {
  const file = cacheFile();

  // 1. Try disk cache
  const cached = await readJsonFile<CachedPayload>(file);
  if (cached) {
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    if (Number.isFinite(age) && age < TTL_MS && cached.caps) {
      return NextResponse.json({
        caps: cached.caps,
        prices: cached.prices ?? {},
        cachedAt: cached.cachedAt,
        source: "disk",
      } satisfies CachedPayload);
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
        "User-Agent": "pifagor-fund/marketcaps (+https://pifagor.fund)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // SECURITY: don't leak upstream status text to client.
      if (typeof console !== "undefined") {
        console.warn(`[marketcaps] CoinGecko ${res.status} ${res.statusText}`);
      }
      return NextResponse.json(
        { error: `CoinGecko upstream unavailable (${res.status})` },
        { status: 502 }
      );
    }
    rows = (await res.json()) as CoinGeckoRow[];
  } catch (e) {
    // SECURITY: log full error server-side, return generic message to client.
    const message =
      e instanceof Error
        ? e.name === "AbortError"
          ? "CoinGecko request timed out (10s)"
          : "CoinGecko request failed"
        : "CoinGecko request failed";
    if (typeof console !== "undefined" && e instanceof Error) {
      console.warn(`[marketcaps] fetch error: ${e.message}`);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "Unexpected CoinGecko response shape" },
      { status: 502 }
    );
  }

  // 3. Map back to TICKERS
  const idToTicker: Record<string, string> = {};
  for (const [ticker, id] of Object.entries(COINGECKO_IDS)) {
    idToTicker[id] = ticker;
  }

  const caps: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const row of rows) {
    const ticker = idToTicker[row.id];
    if (!ticker) continue;
    if (typeof row.market_cap === "number" && Number.isFinite(row.market_cap) && row.market_cap > 0) {
      caps[ticker] = row.market_cap;
    }
    if (typeof row.current_price === "number" && Number.isFinite(row.current_price) && row.current_price > 0) {
      prices[ticker] = row.current_price;
    }
  }

  if (Object.keys(caps).length === 0) {
    return NextResponse.json(
      { error: "CoinGecko returned no usable market_cap values" },
      { status: 502 }
    );
  }

  const payload: CachedPayload = {
    caps,
    prices,
    cachedAt: new Date().toISOString(),
    source: "coingecko",
  };

  // 4. Persist (best-effort — never block the response on disk errors)
  try {
    await writeJsonFile(file, payload);
  } catch {
    // ignore — next request will just re-fetch
  }

  return NextResponse.json(payload);
}
