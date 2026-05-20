import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalize,
  computeParamsHash,
  diffWeights,
  type EngineRunParams,
} from "../engineRuns";

describe("canonicalize", () => {
  it("сортирует ключи объекта рекурсивно", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("разный порядок массива даёт разный canonical (порядок важен)", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("обрабатывает вложенные структуры", () => {
    const v1 = canonicalize({ a: { z: 1, y: 2 }, b: [{ k: 1 }] });
    const v2 = canonicalize({ b: [{ k: 1 }], a: { y: 2, z: 1 } });
    expect(v1).toBe(v2);
  });

  it("корректно обрабатывает null и примитивы", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hi")).toBe('"hi"');
  });
});

describe("computeParamsHash", () => {
  const baseParams: EngineRunParams = {
    assets: ["BTCUSDT", "ETHUSDT"],
    riskCaps: { BTCUSDT: { max: 0.7 } },
    aggregateRules: { smallAltsMax: 0.2, otherAggregateRules: undefined } as never,
    views: [{ symbol: "BTCUSDT", expectedReturn: 0.2, confidence: 0.8, maxWeight: 0.65 }],
    cvarDefenseThreshold: -0.08,
    mode: "Balanced",
    riskFreeRate: 0.04,
    simulations: 50_000,
    historyDays: 1095,
  };

  it("одинаковые params → одинаковый hash (детерминированно)", async () => {
    const h1 = await computeParamsHash(baseParams);
    const h2 = await computeParamsHash({ ...baseParams });
    expect(h1).toBe(h2);
  });

  it("отличающийся mode → другой hash", async () => {
    const h1 = await computeParamsHash(baseParams);
    const h2 = await computeParamsHash({ ...baseParams, mode: "Aggressive" });
    expect(h1).not.toBe(h2);
  });

  it("разный порядок ассетов меняет hash (порядок имеет значение)", async () => {
    const h1 = await computeParamsHash(baseParams);
    const h2 = await computeParamsHash({
      ...baseParams,
      assets: ["ETHUSDT", "BTCUSDT"],
    });
    expect(h1).not.toBe(h2);
  });

  it("hash имеет фиксированную длину 16", async () => {
    const h = await computeParamsHash(baseParams);
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("чуть-чуть другие risk caps → другой hash", async () => {
    const h1 = await computeParamsHash(baseParams);
    const h2 = await computeParamsHash({
      ...baseParams,
      riskCaps: { BTCUSDT: { max: 0.7001 } },
    });
    expect(h1).not.toBe(h2);
  });
});

describe("diffWeights", () => {
  it("показывает delta по каждому символу", () => {
    const before = { weights: { BTCUSDT: 0.6, ETHUSDT: 0.3 } };
    const after = { weights: { BTCUSDT: 0.55, ETHUSDT: 0.4 } };
    const rows = diffWeights(before, after);
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    const eth = rows.find((r) => r.symbol === "ETHUSDT")!;
    expect(btc.delta).toBeCloseTo(-0.05, 5);
    expect(eth.delta).toBeCloseTo(0.1, 5);
  });

  it("включает символы из обоих runs (union)", () => {
    const before = { weights: { BTCUSDT: 0.5 } };
    const after = { weights: { BTCUSDT: 0.4, ETHUSDT: 0.1 } };
    const rows = diffWeights(before, after);
    expect(rows.map((r) => r.symbol).sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("сортирует по |delta| desc", () => {
    // A: 0.5 → 0.48, |Δ| 0.02
    // B: 0.4 → 0.2,  |Δ| 0.20
    // C: 0.1 → 0.32, |Δ| 0.22 ← самый большой
    const before = { weights: { A: 0.5, B: 0.4, C: 0.1 } };
    const after = { weights: { A: 0.48, B: 0.2, C: 0.32 } };
    const rows = diffWeights(before, after);
    expect(rows[0]!.symbol).toBe("C");
    expect(rows[1]!.symbol).toBe("B");
    expect(rows[2]!.symbol).toBe("A");
  });

  it("заменяет отсутствующий вес нулём (новый/исчезнувший символ)", () => {
    const before = { weights: { BTCUSDT: 0.5 } };
    const after = { weights: { ETHUSDT: 0.3 } };
    const rows = diffWeights(before, after);
    const btc = rows.find((r) => r.symbol === "BTCUSDT")!;
    const eth = rows.find((r) => r.symbol === "ETHUSDT")!;
    expect(btc.before).toBe(0.5);
    expect(btc.after).toBe(0);
    expect(eth.before).toBe(0);
    expect(eth.after).toBe(0.3);
  });
});

describe("localStorage round-trip", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadLocalRuns возвращает [] при пустом storage", async () => {
    const { loadLocalRuns } = await import("../engineRuns");
    expect(loadLocalRuns()).toEqual([]);
  });

  it("loadLocalRuns gracefully возвращает [] при невалидном JSON", async () => {
    store["mpt-simulator:engine-runs/v1"] = "not-json{";
    const { loadLocalRuns } = await import("../engineRuns");
    expect(loadLocalRuns()).toEqual([]);
  });

  it("loadLocalRuns gracefully возвращает [] если в storage не-array", async () => {
    store["mpt-simulator:engine-runs/v1"] = JSON.stringify({ not: "array" });
    const { loadLocalRuns } = await import("../engineRuns");
    expect(loadLocalRuns()).toEqual([]);
  });
});
