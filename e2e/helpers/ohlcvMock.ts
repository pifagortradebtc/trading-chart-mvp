import type { Page } from "@playwright/test";

/**
 * Mocks /api/ohlcv with a deterministic synthetic price series so the
 * Portfolio compute can run without reaching Binance. We respond with the
 * exact shape the dev API returns (`{ candles, source: "fixture" }`).
 *
 * Distinct seed per symbol → realistic vol/drift differences (BTC-like,
 * ETH-like, alt-like) → finalFund weights look believable in the UI without
 * mocking the math itself.
 *
 * Also mocks /api/marketcaps with a stable snapshot so live-marketcaps
 * fetches don't time out.
 */
export async function mockMarketData(page: Page): Promise<void> {
  await page.route("**/api/ohlcv*", async (route) => {
    const url = new URL(route.request().url());
    const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
    const days = 1095;
    const seed = hashSymbol(symbol);
    const params = profileFor(symbol);
    const candles = synthCandles(days, seed, params);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "playwright-fixture",
        symbol,
        candles,
        oldestAvailableMs: candles[0] ? candles[0].time * 1000 : Date.now(),
        cachedAt: new Date().toISOString(),
      }),
    });
  });

  await page.route("**/api/marketcaps*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "playwright-fixture",
        marketCaps: {
          BTC: 2_500_000_000_000,
          ETH: 480_000_000_000,
          BNB: 120_000_000_000,
          SOL: 110_000_000_000,
          HYPE: 12_000_000_000,
          TON: 16_000_000_000,
          OKB: 4_500_000_000,
        },
        cachedAt: new Date().toISOString(),
      }),
    });
  });
}

interface Profile {
  startPrice: number;
  drift: number;
  dailyVol: number;
  baseVolume: number;
}

function profileFor(symbol: string): Profile {
  const map: Record<string, Profile> = {
    BTCUSDT: { startPrice: 60_000, drift: 0.55, dailyVol: 0.025, baseVolume: 80_000 },
    ETHUSDT: { startPrice: 3_000, drift: 0.45, dailyVol: 0.035, baseVolume: 250_000 },
    SOLUSDT: { startPrice: 150, drift: 0.3, dailyVol: 0.055, baseVolume: 50_000 },
    BNBUSDT: { startPrice: 500, drift: 0.15, dailyVol: 0.03, baseVolume: 40_000 },
    HYPEUSDT: { startPrice: 25, drift: 0.4, dailyVol: 0.08, baseVolume: 5_000 },
    TONUSDT: { startPrice: 6, drift: 0.0, dailyVol: 0.05, baseVolume: 30_000 },
    OKBUSDT: { startPrice: 50, drift: -0.05, dailyVol: 0.04, baseVolume: 8_000 },
  };
  return map[symbol] ?? { startPrice: 1, drift: 0, dailyVol: 0.05, baseVolume: 1_000 };
}

function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.max(-5, Math.min(5, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

interface SynthCandle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function synthCandles(days: number, seed: number, p: Profile): SynthCandle[] {
  const rng = lcg(seed);
  const driftDaily = p.drift / 365;
  let price = p.startPrice;
  const out: SynthCandle[] = [];
  const baseTime = Math.floor(Date.UTC(2024, 0, 1) / 1000);
  for (let i = 0; i < days; i++) {
    const r = driftDaily + p.dailyVol * gauss(rng);
    const open = price;
    const close = open * Math.exp(r);
    const high = Math.max(open, close) * (1 + Math.abs(gauss(rng)) * p.dailyVol * 0.3);
    const low = Math.min(open, close) * (1 - Math.abs(gauss(rng)) * p.dailyVol * 0.3);
    const volume = p.baseVolume * (0.8 + rng() * 0.4);
    out.push({
      time: baseTime + i * 86_400,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return out;
}
