import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOkxKlinesServer, okxInstIdFromSymbol } from "../okxKlines";

describe("okxInstIdFromSymbol", () => {
  it("transforms USDT pairs", () => {
    expect(okxInstIdFromSymbol("OKBUSDT")).toBe("OKB-USDT");
    expect(okxInstIdFromSymbol("BTCUSDT")).toBe("BTC-USDT");
  });

  it("transforms USDC pairs", () => {
    expect(okxInstIdFromSymbol("ETHUSDC")).toBe("ETH-USDC");
  });

  it("falls through for unknown quote currency", () => {
    expect(okxInstIdFromSymbol("BTCEUR")).toBe("BTCEUR");
  });

  it("is case-insensitive on the input", () => {
    expect(okxInstIdFromSymbol("okbusdt")).toBe("OKB-USDT");
  });
});

describe("fetchOkxKlinesServer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses an OKX response, reverses to oldest-first, and filters to the range", async () => {
    // OKX returns newest-first. Two days: 2024-01-02, 2024-01-01.
    const day1Ms = Date.UTC(2024, 0, 1);
    const day2Ms = Date.UTC(2024, 0, 2);
    const okxRows = [
      [String(day2Ms), "100.5", "101", "100", "100.7", "5.5", "550", "550", "1"],
      [String(day1Ms), "100", "100.6", "99.8", "100.5", "4.5", "450", "450", "1"],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "0", msg: "", data: okxRows }),
      }),
    );

    const result = await fetchOkxKlinesServer({
      symbol: "OKBUSDT",
      interval: "1d",
      startMs: day1Ms,
      endMs: day2Ms,
    });

    expect(result.candles).toHaveLength(2);
    // Should be oldest-first after our reverse.
    expect(result.candles[0]!.time).toBe(Math.floor(day1Ms / 1000));
    expect(result.candles[1]!.time).toBe(Math.floor(day2Ms / 1000));
    // Close prices preserved.
    expect(result.candles[0]!.close).toBeCloseTo(100.5, 5);
    expect(result.candles[1]!.close).toBeCloseTo(100.7, 5);
    // Volume preserved (base-asset units = row[5]).
    expect(result.candles[0]!.volume).toBeCloseTo(4.5, 5);
  });

  it("propagates the OKX error code as an Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "50001", msg: "Service unavailable", data: [] }),
      }),
    );

    await expect(
      fetchOkxKlinesServer({
        symbol: "OKBUSDT",
        interval: "1d",
        startMs: 0,
        endMs: Date.now(),
      }),
    ).rejects.toThrow(/Service unavailable/);
  });

  it("stops paginating when the batch crosses the startMs boundary", async () => {
    const day1Ms = Date.UTC(2024, 0, 1);
    const day2Ms = Date.UTC(2024, 0, 2);
    const day3Ms = Date.UTC(2024, 0, 3);
    const rows = [
      [String(day3Ms), "1", "1", "1", "1", "1", "1", "1", "1"],
      [String(day2Ms), "1", "1", "1", "1", "1", "1", "1", "1"],
      [String(day1Ms), "1", "1", "1", "1", "1", "1", "1", "1"],
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "0", msg: "", data: rows }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOkxKlinesServer({
      symbol: "OKBUSDT",
      interval: "1d",
      startMs: day1Ms,
      endMs: day3Ms,
    });

    expect(result.candles).toHaveLength(3);
    // Single batch covered the whole window → exactly one fetch call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
