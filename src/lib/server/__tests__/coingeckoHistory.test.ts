import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coingeckoIdFromSymbol,
  fetchCoinGeckoDailyServer,
} from "../coingeckoHistory";

describe("coingeckoIdFromSymbol", () => {
  it("maps HYPEUSDT to hyperliquid", () => {
    expect(coingeckoIdFromSymbol("HYPEUSDT")).toBe("hyperliquid");
    expect(coingeckoIdFromSymbol("hypeusdt")).toBe("hyperliquid");
  });

  it("throws for unmapped symbols", () => {
    expect(() => coingeckoIdFromSymbol("UNKNOWNUSDT")).toThrow(/маппинга/i);
  });
});

describe("fetchCoinGeckoDailyServer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function dayMs(year: number, month: number, day: number): number {
    return Date.UTC(year, month - 1, day);
  }

  it("synthesizes OHLC from daily closes and converts USD vol → base vol", async () => {
    const d1 = dayMs(2024, 1, 1);
    const d2 = dayMs(2024, 1, 2);
    const d3 = dayMs(2024, 1, 3);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          prices: [
            [d1, 10],
            [d2, 12],
            [d3, 11],
          ],
          market_caps: [],
          total_volumes: [
            [d1, 1_000_000], // USD
            [d2, 2_400_000], // USD
            [d3, 1_100_000], // USD
          ],
        }),
      }),
    );

    const r = await fetchCoinGeckoDailyServer({
      symbol: "HYPEUSDT",
      startMs: d1,
      endMs: d3,
    });

    expect(r.candles).toHaveLength(3);

    // Day 1: first bar — open = close (no previous reference).
    expect(r.candles[0]!.open).toBe(10);
    expect(r.candles[0]!.close).toBe(10);

    // Day 2: open = prev close.
    expect(r.candles[1]!.open).toBe(10);
    expect(r.candles[1]!.close).toBe(12);
    expect(r.candles[1]!.high).toBe(12);
    expect(r.candles[1]!.low).toBe(10);

    // Day 3: close dropped from 12 to 11 → high=12, low=11.
    expect(r.candles[2]!.open).toBe(12);
    expect(r.candles[2]!.close).toBe(11);
    expect(r.candles[2]!.high).toBe(12);
    expect(r.candles[2]!.low).toBe(11);

    // USD volume → base-asset units: 1_000_000 USD / $10 = 100_000 base.
    expect(r.candles[0]!.volume).toBeCloseTo(100_000, 5);
    expect(r.candles[1]!.volume).toBeCloseTo(200_000, 5);
    expect(r.candles[2]!.volume).toBeCloseTo(100_000, 5);
  });

  it("collapses intraday timestamps into one bar per UTC day (latest wins)", async () => {
    const d1Morning = Date.UTC(2024, 0, 1, 1, 0, 0); // 01:00 UTC
    const d1Evening = Date.UTC(2024, 0, 1, 22, 0, 0); // 22:00 UTC
    const d2 = Date.UTC(2024, 0, 2);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          prices: [
            [d1Morning, 10],
            [d1Evening, 11], // later → wins for day 1
            [d2, 12],
          ],
          market_caps: [],
          total_volumes: [
            [d1Morning, 500_000],
            [d1Evening, 1_100_000],
            [d2, 1_200_000],
          ],
        }),
      }),
    );

    const d1Start = Date.UTC(2024, 0, 1);
    const r = await fetchCoinGeckoDailyServer({
      symbol: "HYPEUSDT",
      startMs: d1Start,
      endMs: d2 + 86_400_000,
    });

    expect(r.candles).toHaveLength(2);
    expect(r.candles[0]!.close).toBe(11); // evening bar wins for day 1
    expect(r.candles[1]!.close).toBe(12);
  });

  it("returns empty candles array on an empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prices: [], market_caps: [], total_volumes: [] }),
      }),
    );

    const r = await fetchCoinGeckoDailyServer({
      symbol: "HYPEUSDT",
      startMs: 0,
      endMs: Date.now(),
    });

    expect(r.candles).toEqual([]);
    expect(r.oldestAvailableMs).toBeNull();
  });

  it("propagates HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      }),
    );

    await expect(
      fetchCoinGeckoDailyServer({
        symbol: "HYPEUSDT",
        startMs: 0,
        endMs: Date.now(),
      }),
    ).rejects.toThrow(/CoinGecko 429/);
  });
});
