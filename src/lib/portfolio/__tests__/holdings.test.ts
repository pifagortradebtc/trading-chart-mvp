import { describe, expect, it } from "vitest";
import {
  emptyPayload,
  computeTotals,
  computeWeights,
  applyTransactions,
  computeDrift,
  normalizeForRebalance,
  createBaselineSnapshot,
  upsertHolding,
  removeHolding,
  addTransaction,
  voidTransaction,
  addBaseline,
} from "../holdings";
import type { Holding, Transaction, BaselineSnapshot } from "../holdings";

// ---------------------------------------------------------------------------
// Tiny factories — keep test setup terse and explicit.
// ---------------------------------------------------------------------------

function h(symbol: string, qty: number, costBasisUsd?: number): Holding {
  return {
    symbol,
    qty,
    ...(costBasisUsd != null ? { costBasisUsd } : {}),
    addedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "kind" | "symbol" | "qty">,
): Transaction {
  return {
    id: partial.id ?? `tx-${Math.random().toString(36).slice(2)}`,
    kind: partial.kind,
    symbol: partial.symbol,
    qty: partial.qty,
    priceUsd: partial.priceUsd ?? null,
    occurredAt: partial.occurredAt ?? 1_700_000_000_000,
    loggedAt: partial.loggedAt ?? 1_700_000_000_000,
    ...(partial.voidedAt != null ? { voidedAt: partial.voidedAt } : {}),
    ...(partial.note != null ? { note: partial.note } : {}),
  };
}

// ---------------------------------------------------------------------------

describe("emptyPayload", () => {
  it("returns version 1 with empty arrays and default prefs", () => {
    const p = emptyPayload();
    expect(p.version).toBe(1);
    expect(p.holdings).toEqual([]);
    expect(p.transactions).toEqual([]);
    expect(p.baselines).toEqual([]);
    expect(p.prefs).toEqual({ inputMode: "qty", autoRefreshMs: 300_000 });
  });
});

describe("computeTotals", () => {
  it("empty holdings → totalUsd 0 and empty perAsset", () => {
    const out = computeTotals([], {});
    expect(out.totalUsd).toBe(0);
    expect(out.perAsset).toEqual({});
  });

  it("single holding → totalUsd = qty * price", () => {
    const out = computeTotals([h("BTCUSDT", 2)], { BTCUSDT: 50_000 });
    expect(out.totalUsd).toBe(100_000);
    expect(out.perAsset).toEqual({ BTCUSDT: 100_000 });
  });

  it("missing price → asset excluded from total but listed in perAsset as 0", () => {
    const out = computeTotals([h("BTCUSDT", 1), h("ETHUSDT", 5)], {
      BTCUSDT: 60_000,
    });
    expect(out.totalUsd).toBe(60_000);
    expect(out.perAsset.BTCUSDT).toBe(60_000);
    expect(out.perAsset.ETHUSDT).toBe(0);
  });

  it("multiple holdings sum correctly", () => {
    const out = computeTotals([h("BTCUSDT", 1), h("ETHUSDT", 10)], {
      BTCUSDT: 50_000,
      ETHUSDT: 2_000,
    });
    expect(out.totalUsd).toBe(70_000);
    expect(out.perAsset).toEqual({ BTCUSDT: 50_000, ETHUSDT: 20_000 });
  });

  it("perAsset record covers every input symbol", () => {
    const out = computeTotals(
      [h("BTCUSDT", 1), h("ETHUSDT", 2), h("SOLUSDT", 0)],
      { BTCUSDT: 100, ETHUSDT: 200, SOLUSDT: 50 },
    );
    expect(Object.keys(out.perAsset).sort()).toEqual([
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
    ]);
  });
});

describe("computeWeights", () => {
  it("empty holdings → {}", () => {
    expect(computeWeights([], {})).toEqual({});
  });

  it("single asset with price → weight 1.0", () => {
    expect(computeWeights([h("BTCUSDT", 1)], { BTCUSDT: 100 })).toEqual({
      BTCUSDT: 1,
    });
  });

  it("weights sum to 1 within 1e-9", () => {
    const w = computeWeights(
      [h("BTCUSDT", 1), h("ETHUSDT", 4), h("SOLUSDT", 25)],
      { BTCUSDT: 50_000, ETHUSDT: 2_500, SOLUSDT: 100 },
    );
    const sum = Object.values(w).reduce((acc, v) => acc + v, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("zero total → {}", () => {
    expect(computeWeights([h("BTCUSDT", 1)], { BTCUSDT: 0 })).toEqual({});
    expect(computeWeights([h("BTCUSDT", 0)], { BTCUSDT: 100 })).toEqual({});
  });

  it("asset without price is excluded from weights", () => {
    const w = computeWeights([h("BTCUSDT", 1), h("ETHUSDT", 1)], {
      BTCUSDT: 100,
    });
    expect(w.BTCUSDT).toBe(1);
    expect(w.ETHUSDT ?? 0).toBe(0);
  });
});

describe("applyTransactions", () => {
  it("empty tx list → returns initial holdings unchanged", () => {
    const initial = [h("BTCUSDT", 2, 30_000)];
    const out = applyTransactions(initial, []);
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].symbol).toBe("BTCUSDT");
    expect(out.holdings[0].qty).toBe(2);
    expect(out.holdings[0].costBasisUsd).toBe(30_000);
  });

  it("single BUY → qty added with cost basis equal to price", () => {
    const out = applyTransactions(
      [],
      [tx({ kind: "BUY", symbol: "BTCUSDT", qty: 1, priceUsd: 50_000 })],
    );
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].qty).toBe(1);
    expect(out.holdings[0].costBasisUsd).toBe(50_000);
    expect(out.avgCostBySymbol.BTCUSDT).toBe(50_000);
  });

  it("two BUYs at different prices → weighted-average cost basis", () => {
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 40_000,
          occurredAt: 1,
        }),
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 3,
          priceUsd: 60_000,
          occurredAt: 2,
        }),
      ],
    );
    expect(out.holdings[0].qty).toBe(4);
    // (1*40000 + 3*60000) / 4 = 55000
    expect(out.avgCostBySymbol.BTCUSDT).toBeCloseTo(55_000, 6);
    expect(out.holdings[0].costBasisUsd).toBeCloseTo(55_000, 6);
  });

  it("BUY then SELL → qty reduced, cost basis preserved", () => {
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 2,
          priceUsd: 50_000,
          occurredAt: 1,
        }),
        tx({
          kind: "SELL",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 70_000,
          occurredAt: 2,
        }),
      ],
    );
    expect(out.holdings[0].qty).toBe(1);
    expect(out.avgCostBySymbol.BTCUSDT).toBe(50_000);
  });

  it("SELL beyond qty → clamped to 0", () => {
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 50_000,
          occurredAt: 1,
        }),
        tx({
          kind: "SELL",
          symbol: "BTCUSDT",
          qty: 10,
          priceUsd: 60_000,
          occurredAt: 2,
        }),
      ],
    );
    expect(out.holdings[0].qty).toBe(0);
  });

  it("DEPOSIT/WITHDRAW affect qty without touching cost basis", () => {
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 50_000,
          occurredAt: 1,
        }),
        tx({
          kind: "DEPOSIT",
          symbol: "BTCUSDT",
          qty: 2,
          priceUsd: null,
          occurredAt: 2,
        }),
        tx({
          kind: "WITHDRAW",
          symbol: "BTCUSDT",
          qty: 0.5,
          priceUsd: null,
          occurredAt: 3,
        }),
      ],
    );
    expect(out.holdings[0].qty).toBeCloseTo(2.5, 9);
    expect(out.avgCostBySymbol.BTCUSDT).toBe(50_000);
  });

  it("voided transactions are ignored", () => {
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 50_000,
          occurredAt: 1,
        }),
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 99,
          priceUsd: 1_000_000,
          occurredAt: 2,
          voidedAt: 3,
        }),
      ],
    );
    expect(out.holdings[0].qty).toBe(1);
    expect(out.avgCostBySymbol.BTCUSDT).toBe(50_000);
  });

  it("chronological order respected even when input is shuffled", () => {
    // SELL before BUY in input order, but BUY occurredAt is earlier.
    const out = applyTransactions(
      [],
      [
        tx({
          kind: "SELL",
          symbol: "BTCUSDT",
          qty: 1,
          priceUsd: 70_000,
          occurredAt: 200,
        }),
        tx({
          kind: "BUY",
          symbol: "BTCUSDT",
          qty: 5,
          priceUsd: 50_000,
          occurredAt: 100,
        }),
      ],
    );
    // BUY 5 first, then SELL 1 → 4 left.
    expect(out.holdings[0].qty).toBe(4);
  });
});

describe("computeDrift", () => {
  it("identical state → all deltas 0", () => {
    const holdings = [h("BTCUSDT", 1), h("ETHUSDT", 4)];
    const prices = { BTCUSDT: 50_000, ETHUSDT: 2_500 };
    const baseline = createBaselineSnapshot(holdings, prices);
    const report = computeDrift(holdings, baseline, prices);
    expect(report.totalDeltaUsd).toBe(0);
    expect(report.totalDeltaPct).toBe(0);
    for (const row of report.rows) {
      expect(row.deltaWeightPp).toBeCloseTo(0, 9);
      expect(row.deltaValueUsd).toBeCloseTo(0, 6);
      expect(row.deltaPricePct).toBeCloseTo(0, 9);
    }
  });

  it("empty baseline with totalUsd 0 → handles divide-by-zero cleanly", () => {
    const emptyBaseline: BaselineSnapshot = {
      id: "b1",
      label: "empty",
      takenAt: 1,
      quantities: {},
      pricesAtSnapshot: {},
      totalUsd: 0,
      weights: {},
    };
    const report = computeDrift(
      [h("BTCUSDT", 1)],
      emptyBaseline,
      { BTCUSDT: 50_000 },
    );
    expect(report.totalAtBaseline).toBe(0);
    expect(report.totalDeltaPct).toBe(0);
    expect(Number.isFinite(report.totalDeltaUsd)).toBe(true);
  });

  it("asset removed since baseline → row present with weightNow 0 and weight drift = -baseline_pct", () => {
    const baselineHoldings = [h("BTCUSDT", 1), h("ETHUSDT", 25)];
    const prices = { BTCUSDT: 50_000, ETHUSDT: 2_000 };
    const baseline = createBaselineSnapshot(baselineHoldings, prices);
    // Current state: ETH removed entirely.
    const report = computeDrift(
      [h("BTCUSDT", 1)],
      baseline,
      { BTCUSDT: 50_000, ETHUSDT: 2_000 },
    );
    const ethRow = report.rows.find((r) => r.symbol === "ETHUSDT");
    expect(ethRow).toBeDefined();
    expect(ethRow!.weightNow).toBe(0);
    expect(ethRow!.deltaWeightPp).toBeCloseTo(
      -baseline.weights.ETHUSDT * 100,
      6,
    );
  });

  it("price change → deltaPricePct reflects relative change", () => {
    const baselineHoldings = [h("BTCUSDT", 1)];
    const baseline = createBaselineSnapshot(baselineHoldings, {
      BTCUSDT: 50_000,
    });
    const report = computeDrift(baselineHoldings, baseline, {
      BTCUSDT: 60_000,
    });
    const row = report.rows.find((r) => r.symbol === "BTCUSDT")!;
    expect(row.deltaPricePct).toBeCloseTo(0.2, 6);
  });

  it("topDrifter is the symbol with the largest absolute weight drift", () => {
    const baselineHoldings = [h("BTCUSDT", 1), h("ETHUSDT", 20)];
    const baseline = createBaselineSnapshot(baselineHoldings, {
      BTCUSDT: 50_000, // 50k
      ETHUSDT: 2_500, // 50k
    });
    // Now ETH price drops a lot → its weight drops; BTC weight rises.
    const report = computeDrift(baselineHoldings, baseline, {
      BTCUSDT: 50_000,
      ETHUSDT: 500,
    });
    expect(report.topDrifter === "BTCUSDT" || report.topDrifter === "ETHUSDT")
      .toBe(true);
    // Absolute drift on both rows should be equal (one + one -).
    const btc = report.rows.find((r) => r.symbol === "BTCUSDT")!;
    const eth = report.rows.find((r) => r.symbol === "ETHUSDT")!;
    expect(Math.abs(btc.deltaWeightPp)).toBeCloseTo(
      Math.abs(eth.deltaWeightPp),
      6,
    );
  });
});

describe("normalizeForRebalance", () => {
  it("drops symbols not in basket", () => {
    const out = normalizeForRebalance(
      { BTCUSDT: 0.5, ETHUSDT: 0.3, SOLUSDT: 0.2 },
      ["BTCUSDT", "ETHUSDT"],
    );
    expect(Object.keys(out).sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it("renormalizes kept weights to sum to 1 within 1e-9", () => {
    const out = normalizeForRebalance(
      { BTCUSDT: 0.5, ETHUSDT: 0.3, SOLUSDT: 0.2 },
      ["BTCUSDT", "ETHUSDT"],
    );
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    // BTC : ETH ratio is preserved at 5:3.
    expect(out.BTCUSDT / out.ETHUSDT).toBeCloseTo(5 / 3, 9);
  });

  it("empty weights → {}", () => {
    expect(normalizeForRebalance({}, ["BTCUSDT"])).toEqual({});
  });

  it("sum-zero (after masking) input → {}", () => {
    expect(
      normalizeForRebalance({ BTCUSDT: 0, ETHUSDT: 0 }, ["BTCUSDT", "ETHUSDT"]),
    ).toEqual({});
  });
});

describe("createBaselineSnapshot", () => {
  it("returns an object with all required fields populated", () => {
    const snap = createBaselineSnapshot(
      [h("BTCUSDT", 2), h("ETHUSDT", 5)],
      { BTCUSDT: 50_000, ETHUSDT: 2_000 },
    );
    expect(snap.id).toEqual(expect.any(String));
    expect(snap.label).toEqual(expect.any(String));
    expect(snap.takenAt).toEqual(expect.any(Number));
    expect(snap.quantities).toEqual({ BTCUSDT: 2, ETHUSDT: 5 });
    expect(snap.pricesAtSnapshot).toEqual({ BTCUSDT: 50_000, ETHUSDT: 2_000 });
    expect(snap.totalUsd).toBe(110_000);
    expect(snap.weights.BTCUSDT).toBeCloseTo(100_000 / 110_000, 9);
    expect(snap.weights.ETHUSDT).toBeCloseTo(10_000 / 110_000, 9);
  });

  it("id is a non-empty string and takenAt is positive", () => {
    const snap = createBaselineSnapshot([h("BTCUSDT", 1)], { BTCUSDT: 100 });
    expect(snap.id.length).toBeGreaterThan(0);
    expect(snap.takenAt).toBeGreaterThan(0);
  });

  it("custom label is preserved when provided", () => {
    const snap = createBaselineSnapshot([], {}, "Перед ребалансом");
    expect(snap.label).toBe("Перед ребалансом");
  });
});

describe("upsertHolding", () => {
  it("adds a new holding", () => {
    const out = upsertHolding([], "BTCUSDT", 1.5);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("BTCUSDT");
    expect(out[0].qty).toBe(1.5);
  });

  it("updates qty of an existing holding", () => {
    const prev = upsertHolding([], "BTCUSDT", 1);
    const next = upsertHolding(prev, "BTCUSDT", 3);
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe(3);
  });

  it("preserves addedAt on update", () => {
    const prev: Holding[] = [
      {
        symbol: "BTCUSDT",
        qty: 1,
        addedAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ];
    const next = upsertHolding(prev, "BTCUSDT", 5);
    expect(next[0].addedAt).toBe(1_700_000_000_000);
  });
});

describe("removeHolding", () => {
  it("removes the specified symbol", () => {
    const list = [h("BTCUSDT", 1), h("ETHUSDT", 2)];
    const out = removeHolding(list, "BTCUSDT");
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("ETHUSDT");
  });

  it("no-op when symbol is missing", () => {
    const list = [h("BTCUSDT", 1)];
    const out = removeHolding(list, "ETHUSDT");
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("BTCUSDT");
  });
});

describe("addTransaction", () => {
  it("appends a tx with a generated id and loggedAt", () => {
    const state = emptyPayload();
    const next = addTransaction(state, {
      kind: "BUY",
      symbol: "BTCUSDT",
      qty: 1,
      priceUsd: 50_000,
      occurredAt: 1_700_000_000_000,
    });
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].id.length).toBeGreaterThan(0);
    expect(next.transactions[0].loggedAt).toBeGreaterThan(0);
  });

  it("recomputes holdings from the new tx list", () => {
    const state = emptyPayload();
    const next = addTransaction(state, {
      kind: "BUY",
      symbol: "BTCUSDT",
      qty: 2,
      priceUsd: 50_000,
      occurredAt: 1_700_000_000_000,
    });
    expect(next.holdings).toHaveLength(1);
    expect(next.holdings[0].qty).toBe(2);
    expect(next.holdings[0].costBasisUsd).toBe(50_000);
  });

  it("returns a NEW payload — does not mutate input", () => {
    const state = emptyPayload();
    const next = addTransaction(state, {
      kind: "BUY",
      symbol: "BTCUSDT",
      qty: 1,
      priceUsd: 50_000,
      occurredAt: 1_700_000_000_000,
    });
    expect(next).not.toBe(state);
    expect(state.transactions).toHaveLength(0);
    expect(state.holdings).toHaveLength(0);
  });
});

describe("voidTransaction", () => {
  it("marks voidedAt on the matching tx and recomputes holdings", () => {
    let state = emptyPayload();
    state = addTransaction(state, {
      kind: "BUY",
      symbol: "BTCUSDT",
      qty: 2,
      priceUsd: 50_000,
      occurredAt: 1_700_000_000_000,
    });
    const txId = state.transactions[0].id;
    const next = voidTransaction(state, txId);
    expect(next.transactions[0].voidedAt).toBeGreaterThan(0);
    // Voided BUY → no qty left.
    const btc = next.holdings.find((x) => x.symbol === "BTCUSDT");
    expect(btc?.qty ?? 0).toBe(0);
  });

  it("no-op when id is missing", () => {
    let state = emptyPayload();
    state = addTransaction(state, {
      kind: "BUY",
      symbol: "BTCUSDT",
      qty: 1,
      priceUsd: 50_000,
      occurredAt: 1_700_000_000_000,
    });
    const out = voidTransaction(state, "no-such-id");
    expect(out).toBe(state);
  });
});

describe("addBaseline", () => {
  it("prepends a snapshot to baselines", () => {
    const state = emptyPayload();
    const snap = createBaselineSnapshot([h("BTCUSDT", 1)], { BTCUSDT: 100 });
    const next = addBaseline(state, snap);
    expect(next.baselines).toHaveLength(1);
    expect(next.baselines[0]).toBe(snap);
  });

  it("caps the history at 20 entries (oldest dropped)", () => {
    let state = emptyPayload();
    for (let i = 0; i < 25; i += 1) {
      const snap: BaselineSnapshot = {
        id: `snap-${i}`,
        label: `s${i}`,
        takenAt: 1_700_000_000_000 + i,
        quantities: {},
        pricesAtSnapshot: {},
        totalUsd: 0,
        weights: {},
      };
      state = addBaseline(state, snap);
    }
    expect(state.baselines).toHaveLength(20);
    // Most recently prepended is at index 0.
    expect(state.baselines[0].id).toBe("snap-24");
    // The 20 kept correspond to ids 24..5 (oldest 5 dropped).
    expect(state.baselines[19].id).toBe("snap-5");
  });
});
