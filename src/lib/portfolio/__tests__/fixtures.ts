import type { PriceSeries } from "../types";

/**
 * Deterministic synthetic price-series fixtures for the portfolio-math
 * unit tests. Builds a small mixed basket — BTC-like (low vol drift up),
 * ETH-like (medium vol drift up), an alt (high vol, mostly sideways) — so
 * tests can assert on directional behavior (e.g. "min-vol prefers BTC") and
 * tier classifications (e.g. "limited data ≤ 5% cap") without needing
 * real exchange data.
 *
 * Generator: seeded LCG so tests are reproducible across machines/runs.
 */

interface BuildOpts {
  days: number;
  startPrice?: number;
  /** Annual drift, e.g. 0.5 = +50%/yr. */
  drift?: number;
  /** Daily volatility (stddev of log returns), e.g. 0.04 = 4%/day. */
  dailyVol?: number;
  /** Average daily base-asset volume. */
  volume?: number;
  symbol: string;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function gauss(rng: () => number): number {
  // Box-Muller; clamp tail to ±5 for stability.
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-5, Math.min(5, z));
}

export function syntheticSeries(opts: BuildOpts, seed: number): PriceSeries {
  const {
    days,
    startPrice = 100,
    drift = 0,
    dailyVol = 0.02,
    volume = 1000,
    symbol,
  } = opts;
  const rng = lcg(seed);
  const driftDaily = drift / 365;
  const prices: number[] = [startPrice];
  for (let i = 1; i < days; i++) {
    const r = driftDaily + dailyVol * gauss(rng);
    prices.push(prices[i - 1] * Math.exp(r));
  }
  const baseTime = Date.UTC(2024, 0, 1);
  const times = prices.map((_, i) => baseTime + i * 86_400_000);
  const volumes = prices.map(() => volume);
  return { symbol, times, prices, volumes };
}

/** Standard 3-asset basket: BTC (low vol up), ETH (med vol up), ALT (high vol flat). */
export function basicBasket(days = 400): PriceSeries[] {
  return [
    syntheticSeries(
      { symbol: "BTCUSDT", days, startPrice: 60_000, drift: 0.6, dailyVol: 0.025, volume: 80_000 },
      11,
    ),
    syntheticSeries(
      { symbol: "ETHUSDT", days, startPrice: 3_000, drift: 0.5, dailyVol: 0.035, volume: 250_000 },
      22,
    ),
    syntheticSeries(
      { symbol: "SOLUSDT", days, startPrice: 150, drift: 0.1, dailyVol: 0.06, volume: 50_000 },
      33,
    ),
  ];
}

/** Same as basicBasket but with one short-history asset (90 days). */
export function basketWithLimited(days = 400, shortDays = 90): PriceSeries[] {
  const full = basicBasket(days);
  const short = syntheticSeries(
    { symbol: "HYPEUSDT", days: shortDays, startPrice: 25, drift: 0.0, dailyVol: 0.08, volume: 500 },
    77,
  );
  // Align onto the shared timeline — short series only present in the last shortDays.
  const sharedTimes = full[0].times;
  const baseLast = sharedTimes.length - shortDays;
  const shortAligned: PriceSeries = {
    symbol: short.symbol,
    times: sharedTimes.slice(baseLast),
    prices: short.prices,
    volumes: short.volumes,
  };
  return [...full, shortAligned];
}

/** Basket where two assets are highly correlated (HRP / cluster sanity tests). */
export function correlatedBasket(days = 400): PriceSeries[] {
  const a = syntheticSeries(
    { symbol: "BTCUSDT", days, startPrice: 60_000, drift: 0.4, dailyVol: 0.03, volume: 80_000 },
    1,
  );
  const b: PriceSeries = {
    symbol: "ETHUSDT",
    times: a.times.slice(),
    prices: a.prices.map((p, i) => p * 0.05 * (1 + Math.sin(i / 30) * 0.02)),
    volumes: a.volumes!.slice(),
  };
  const c = syntheticSeries(
    { symbol: "SOLUSDT", days, startPrice: 100, drift: 0.0, dailyVol: 0.05, volume: 5_000 },
    99,
  );
  return [a, b, c];
}
