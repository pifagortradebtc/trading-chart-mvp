import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deltaVsLive,
  exchangeSymbolFromBare,
  type FundLiveComposition,
} from "../fundBridge";

describe("exchangeSymbolFromBare", () => {
  it("маппит известные тикеры в exchange-format", () => {
    expect(exchangeSymbolFromBare("BTC")).toBe("BTCUSDT");
    expect(exchangeSymbolFromBare("ETH")).toBe("ETHUSDT");
    expect(exchangeSymbolFromBare("MNT")).toBe("MNTUSDT");
    expect(exchangeSymbolFromBare("HYPE")).toBe("HYPEUSDT");
  });

  it("case-insensitive по входу", () => {
    expect(exchangeSymbolFromBare("btc")).toBe("BTCUSDT");
    expect(exchangeSymbolFromBare("Eth")).toBe("ETHUSDT");
  });

  it("неизвестный тикер → fallback на ${bare}USDT", () => {
    expect(exchangeSymbolFromBare("DOGE")).toBe("DOGEUSDT");
    expect(exchangeSymbolFromBare("XYZ")).toBe("XYZUSDT");
  });
});

describe("deltaVsLive", () => {
  const live: FundLiveComposition = {
    items: [
      {
        symbol: "BTCUSDT",
        bareSymbol: "BTC",
        name: "Bitcoin",
        weight: 0.6,
        category: "SPOT",
      },
      {
        symbol: "ETHUSDT",
        bareSymbol: "ETH",
        name: "Ethereum",
        weight: 0.2,
        category: "SPOT",
      },
      {
        symbol: "USDT",
        bareSymbol: "USDT",
        name: "Tether USD",
        weight: 0.2,
        category: "CASH",
      },
    ],
    lastChangedAt: "2026-05-01T00:00:00Z",
    fundUrl: "https://pifagor.fund",
    source: "ledger",
    missingPriceSymbols: [],
    fetchedAt: 0,
  };

  it("считает delta = target - live", () => {
    const rows = deltaVsLive(
      { BTCUSDT: 0.65, ETHUSDT: 0.2, USDT: 0.15 },
      live,
    );
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    const eth = rows.find((r) => r.symbol === "ETHUSDT")!;
    const usdt = rows.find((r) => r.symbol === "USDT")!;
    expect(btc.delta).toBeCloseTo(0.05, 5);
    expect(eth.delta).toBeCloseTo(0, 5);
    expect(usdt.delta).toBeCloseTo(-0.05, 5);
  });

  it("action: HOLD если |delta| <= band", () => {
    const rows = deltaVsLive({ BTCUSDT: 0.605 }, live, { band: 0.01 });
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    expect(btc.action).toBe("HOLD");
  });

  it("action: BUY если target > live за band", () => {
    const rows = deltaVsLive({ BTCUSDT: 0.65 }, live, { band: 0.01 });
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    expect(btc.action).toBe("BUY");
  });

  it("action: SELL если target < live за band", () => {
    const rows = deltaVsLive({ BTCUSDT: 0.55 }, live, { band: 0.01 });
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    expect(btc.action).toBe("SELL");
  });

  it("сортирует по |delta| desc", () => {
    const rows = deltaVsLive(
      { BTCUSDT: 0.55, ETHUSDT: 0.35, USDT: 0.1 },
      live,
    );
    expect(rows[0]!.symbol).toBe("ETHUSDT"); // |+0.15|
    expect(rows[1]!.symbol).toBe("USDT"); // |-0.10|
    expect(rows[2]!.symbol).toBe("BTCUSDT"); // |-0.05|
  });

  it("включает символы из обеих сторон (union)", () => {
    const rows = deltaVsLive(
      { SOLUSDT: 0.1 }, // только в target
      live,
    );
    const symbols = rows.map((r) => r.symbol).sort();
    expect(symbols).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT", "USDT"]);
  });

  it("без live (фонд недоступен) — все строки live=0, action на основе target vs 0", () => {
    const rows = deltaVsLive(
      { BTCUSDT: 0.65, ETHUSDT: 0.35 },
      null,
      { band: 0.01 },
    );
    expect(rows.every((r) => r.live === 0)).toBe(true);
    expect(rows.every((r) => r.action === "BUY")).toBe(true);
  });

  it("пробрасывает метаданные актива из live (bareSymbol, name, category)", () => {
    const rows = deltaVsLive({ BTCUSDT: 0.65 }, live);
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    expect(btc.bareSymbol).toBe("BTC");
    expect(btc.name).toBe("Bitcoin");
    expect(btc.category).toBe("SPOT");
  });
});

describe("fetchLiveFundComposition (mocked fetch)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("возвращает null если SSR (window undefined)", async () => {
    vi.unstubAllGlobals();
    const { fetchLiveFundComposition } = await import("../fundBridge");
    const r = await fetchLiveFundComposition();
    expect(r).toBeNull();
  });

  it("парсит валидный ответ: percent → fraction, маппит bare → exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { symbol: "BTC", name: "Bitcoin", weight: 60, category: "SPOT" },
            { symbol: "USDT", name: "Tether USD", weight: 40, category: "CASH" },
          ],
          lastChangedAt: "2026-05-01T00:00:00Z",
          fundUrl: "https://pifagor.fund",
        }),
      }),
    );

    const { fetchLiveFundComposition } = await import("../fundBridge");
    const r = await fetchLiveFundComposition();
    expect(r).not.toBeNull();
    expect(r!.items).toHaveLength(2);
    expect(r!.items[0]!.symbol).toBe("BTCUSDT");
    expect(r!.items[0]!.bareSymbol).toBe("BTC");
    expect(r!.items[0]!.weight).toBeCloseTo(0.6, 5);
    expect(r!.items[1]!.symbol).toBe("USDT"); // CASH category preserves USDT
    expect(r!.items[1]!.category).toBe("CASH");
  });

  it("возвращает null при HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }),
    );
    const { fetchLiveFundComposition } = await import("../fundBridge");
    const r = await fetchLiveFundComposition();
    expect(r).toBeNull();
  });

  it("возвращает null при network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("network down")),
    );
    const { fetchLiveFundComposition } = await import("../fundBridge");
    const r = await fetchLiveFundComposition();
    expect(r).toBeNull();
  });

  it("отфильтровывает невалидные items (вес < 0, не-number weight)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { symbol: "BTC", weight: 60, category: "SPOT" },
            { symbol: "BAD", weight: -10, category: "SPOT" },
            { symbol: "BAD2", weight: "not-a-number", category: "SPOT" },
            { symbol: "ETH", weight: 40, category: "SPOT" },
          ],
        }),
      }),
    );
    const { fetchLiveFundComposition } = await import("../fundBridge");
    const r = await fetchLiveFundComposition();
    expect(r!.items.map((i) => i.bareSymbol)).toEqual(["BTC", "ETH"]);
  });
});
