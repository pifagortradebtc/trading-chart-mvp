/**
 * Holdings module — pure types and functions for the "Мои активы" feature.
 *
 * Responsibilities:
 *  - Define the persisted shape (HoldingsPayload v1).
 *  - Replay transactions into current holdings with weighted-average cost basis.
 *  - Compute portfolio totals, weights, and drift vs. a baseline snapshot.
 *  - Provide immutable update helpers for holdings, transactions, and baselines.
 *
 * All update functions return NEW values — never mutate inputs.
 */

export type ExchangeSymbol = string;

export interface Holding {
  symbol: ExchangeSymbol;
  qty: number;
  costBasisUsd?: number;
  addedAt: number;
  updatedAt: number;
}

export type TxKind = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAW";

export interface Transaction {
  id: string;
  kind: TxKind;
  symbol: ExchangeSymbol;
  qty: number;
  priceUsd: number | null;
  occurredAt: number;
  loggedAt: number;
  voidedAt?: number;
  note?: string;
}

export interface BaselineSnapshot {
  id: string;
  label: string;
  takenAt: number;
  quantities: Record<ExchangeSymbol, number>;
  pricesAtSnapshot: Record<ExchangeSymbol, number>;
  totalUsd: number;
  weights: Record<ExchangeSymbol, number>;
}

export interface HoldingsPayload {
  version: 1;
  holdings: Holding[];
  transactions: Transaction[];
  baselines: BaselineSnapshot[];
  prefs: {
    inputMode: "qty" | "tx";
    autoRefreshMs: number;
  };
}

export interface DriftRow {
  symbol: ExchangeSymbol;
  qty: number;
  qtyAtBaseline: number;
  priceNow: number;
  priceAtBaseline: number;
  valueNow: number;
  valueAtBaseline: number;
  weightNow: number;
  weightAtBaseline: number;
  deltaWeightPp: number;
  deltaValueUsd: number;
  deltaPricePct: number;
}

export interface DriftReport {
  rows: DriftRow[];
  totalNow: number;
  totalAtBaseline: number;
  totalDeltaUsd: number;
  totalDeltaPct: number;
  topDrifter: ExchangeSymbol | null;
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/** Current epoch in ms. Wrapped so tests can be reasoned about deterministically. */
function nowMs(): number {
  return Date.now();
}

/**
 * Generate a UUID. Uses crypto.randomUUID() when available
 * (modern browsers / Node 19+), otherwise falls back to a short random hex.
 */
function makeId(): string {
  const g: { crypto?: { randomUUID?: () => string; getRandomValues?: (buf: Uint8Array) => Uint8Array } } =
    (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: { randomUUID?: () => string; getRandomValues?: (buf: Uint8Array) => Uint8Array } }) : {}) ?? {};
  const c = g.crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // fall through
    }
  }
  if (c && typeof c.getRandomValues === "function") {
    try {
      const buf = new Uint8Array(16);
      c.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // fall through
    }
  }
  // Last-resort fallback: time-mixed Math.random hex.
  const r1 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const r2 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const t = Date.now().toString(16);
  return `${t}-${r1}${r2}`;
}

/** Safe finite number coercion — NaN/Infinity become 0. */
function safeNum(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Format a baseline default label like "Снимок 2026-06-08 14:32". */
function defaultBaselineLabel(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Снимок ${date} ${time}`;
}

// ---------------------------------------------------------------------------
// Public pure functions
// ---------------------------------------------------------------------------

/** Default empty payload for a fresh user. */
export function emptyPayload(): HoldingsPayload {
  return {
    version: 1,
    holdings: [],
    transactions: [],
    baselines: [],
    prefs: {
      inputMode: "qty",
      autoRefreshMs: 300_000,
    },
  };
}

/**
 * Compute portfolio total USD and per-asset USD value.
 * Assets with missing or non-positive price contribute 0 to the total
 * but are still listed in `perAsset` so the UI can render them.
 */
export function computeTotals(
  holdings: ReadonlyArray<Holding>,
  prices: Readonly<Record<string, number>>,
): { totalUsd: number; perAsset: Record<string, number> } {
  const perAsset: Record<string, number> = {};
  let totalUsd = 0;
  if (!holdings || holdings.length === 0) {
    return { totalUsd: 0, perAsset };
  }
  for (const h of holdings) {
    const price = safeNum(prices?.[h.symbol]);
    const qty = safeNum(h.qty);
    if (price > 0 && qty !== 0) {
      const value = qty * price;
      perAsset[h.symbol] = value;
      totalUsd += value;
    } else {
      perAsset[h.symbol] = 0;
    }
  }
  return { totalUsd, perAsset };
}

/**
 * Compute per-asset weights (0..1) from current holdings and prices.
 * Returns {} if total portfolio value is zero.
 */
export function computeWeights(
  holdings: ReadonlyArray<Holding>,
  prices: Readonly<Record<string, number>>,
): Record<string, number> {
  const { totalUsd, perAsset } = computeTotals(holdings, prices);
  if (totalUsd <= 0) return {};
  const weights: Record<string, number> = {};
  for (const symbol of Object.keys(perAsset)) {
    weights[symbol] = perAsset[symbol] / totalUsd;
  }
  return weights;
}

/**
 * Chronologically replay a transaction log into a set of holdings.
 *
 *  - Skips voided transactions (those with `voidedAt` set).
 *  - BUY: increases qty; recomputes weighted-average cost from BUYs only.
 *  - SELL: decreases qty (clamped at 0); does not change cost basis.
 *  - DEPOSIT / WITHDRAW: affects qty only; cost basis unchanged.
 *
 * Returns a fresh array of holdings covering the union of symbols in
 * `initial` and `txs`, plus a map of weighted-average cost per symbol.
 */
export function applyTransactions(
  initial: ReadonlyArray<Holding>,
  txs: ReadonlyArray<Transaction>,
): { holdings: Holding[]; avgCostBySymbol: Record<string, number> } {
  // Seed working state from initial holdings.
  const qtyBySymbol: Record<string, number> = {};
  const addedAtBySymbol: Record<string, number> = {};
  const updatedAtBySymbol: Record<string, number> = {};
  // BUY accumulators for weighted-average cost.
  const buyQty: Record<string, number> = {};
  const buyCostUsd: Record<string, number> = {};
  // Seed avgCost from initial holdings.costBasisUsd (treat current qty as "already-bought").
  const seededAvgCost: Record<string, number> = {};

  for (const h of initial ?? []) {
    qtyBySymbol[h.symbol] = safeNum(h.qty);
    addedAtBySymbol[h.symbol] = h.addedAt ?? nowMs();
    updatedAtBySymbol[h.symbol] = h.updatedAt ?? addedAtBySymbol[h.symbol];
    if (typeof h.costBasisUsd === "number" && Number.isFinite(h.costBasisUsd)) {
      seededAvgCost[h.symbol] = h.costBasisUsd;
    }
  }

  // Stable chronological sort: by occurredAt, ties broken by loggedAt.
  const ordered = [...(txs ?? [])]
    .filter((t) => !t || t.voidedAt == null)
    .sort((a, b) => {
      const ao = safeNum(a.occurredAt);
      const bo = safeNum(b.occurredAt);
      if (ao !== bo) return ao - bo;
      return safeNum(a.loggedAt) - safeNum(b.loggedAt);
    });

  for (const tx of ordered) {
    if (!tx || !tx.symbol) continue;
    const sym = tx.symbol;
    const qty = safeNum(tx.qty);
    if (qtyBySymbol[sym] == null) {
      qtyBySymbol[sym] = 0;
      addedAtBySymbol[sym] = tx.occurredAt ?? nowMs();
    }
    updatedAtBySymbol[sym] = Math.max(updatedAtBySymbol[sym] ?? 0, tx.occurredAt ?? 0);

    switch (tx.kind) {
      case "BUY": {
        qtyBySymbol[sym] += qty;
        const price = tx.priceUsd == null ? 0 : safeNum(tx.priceUsd);
        if (qty > 0 && price > 0) {
          buyQty[sym] = (buyQty[sym] ?? 0) + qty;
          buyCostUsd[sym] = (buyCostUsd[sym] ?? 0) + qty * price;
        }
        break;
      }
      case "SELL": {
        qtyBySymbol[sym] = Math.max(0, qtyBySymbol[sym] - qty);
        break;
      }
      case "DEPOSIT": {
        qtyBySymbol[sym] += qty;
        break;
      }
      case "WITHDRAW": {
        qtyBySymbol[sym] = Math.max(0, qtyBySymbol[sym] - qty);
        break;
      }
      default:
        // Unknown kinds are ignored.
        break;
    }
  }

  const avgCostBySymbol: Record<string, number> = {};
  for (const sym of Object.keys(qtyBySymbol)) {
    const bq = buyQty[sym] ?? 0;
    const bc = buyCostUsd[sym] ?? 0;
    if (bq > 0) {
      avgCostBySymbol[sym] = bc / bq;
    } else if (typeof seededAvgCost[sym] === "number") {
      avgCostBySymbol[sym] = seededAvgCost[sym];
    }
  }

  const holdings: Holding[] = Object.keys(qtyBySymbol).map((sym) => {
    const h: Holding = {
      symbol: sym,
      qty: qtyBySymbol[sym],
      addedAt: addedAtBySymbol[sym] ?? nowMs(),
      updatedAt: updatedAtBySymbol[sym] ?? nowMs(),
    };
    if (typeof avgCostBySymbol[sym] === "number" && Number.isFinite(avgCostBySymbol[sym])) {
      h.costBasisUsd = avgCostBySymbol[sym];
    }
    return h;
  });

  return { holdings, avgCostBySymbol };
}

/**
 * Compute drift between current holdings and a saved baseline.
 *
 *  - Row symbols = union of current and baseline symbols.
 *  - `deltaWeightPp` is in percentage points (current_pct - baseline_pct).
 *  - `deltaValueUsd` is the USD difference at current price for current qty
 *    vs. baseline qty at the baseline price.
 *  - `deltaPricePct` is the relative price change since baseline (0..N).
 *  - `topDrifter` is the symbol with the largest absolute weight drift.
 */
export function computeDrift(
  current: ReadonlyArray<Holding>,
  baseline: BaselineSnapshot,
  prices: Readonly<Record<string, number>>,
): DriftReport {
  const safeBaseline: BaselineSnapshot =
    baseline ??
    ({
      id: "",
      label: "",
      takenAt: 0,
      quantities: {},
      pricesAtSnapshot: {},
      totalUsd: 0,
      weights: {},
    } as BaselineSnapshot);

  const currentQty: Record<string, number> = {};
  for (const h of current ?? []) {
    currentQty[h.symbol] = safeNum(h.qty);
  }
  const baselineQty = safeBaseline.quantities ?? {};
  const baselinePrices = safeBaseline.pricesAtSnapshot ?? {};
  const baselineWeights = safeBaseline.weights ?? {};

  const symbols = new Set<string>([
    ...Object.keys(currentQty),
    ...Object.keys(baselineQty),
  ]);

  // Recompute current totals/weights consistently with computeWeights.
  const { totalUsd: totalNow, perAsset } = computeTotals(current ?? [], prices);
  const weightsNow = totalNow > 0 ? computeWeights(current ?? [], prices) : {};
  const totalAtBaseline = safeNum(safeBaseline.totalUsd);

  const rows: DriftRow[] = [];
  let topDrifter: ExchangeSymbol | null = null;
  let topAbs = -1;

  for (const sym of symbols) {
    const qty = safeNum(currentQty[sym]);
    const qtyAtBaseline = safeNum(baselineQty[sym]);
    const priceNow = safeNum(prices?.[sym]);
    const priceAtBaseline = safeNum(baselinePrices[sym]);
    const valueNow = priceNow > 0 ? perAsset[sym] ?? qty * priceNow : 0;
    const valueAtBaseline = qtyAtBaseline * priceAtBaseline;
    const weightNow = weightsNow[sym] ?? 0;
    const weightAtBaseline = safeNum(baselineWeights[sym]);
    const deltaWeightPp = (weightNow - weightAtBaseline) * 100;
    const deltaValueUsd = valueNow - valueAtBaseline;
    const deltaPricePct =
      priceAtBaseline > 0 ? (priceNow - priceAtBaseline) / priceAtBaseline : 0;

    rows.push({
      symbol: sym,
      qty,
      qtyAtBaseline,
      priceNow,
      priceAtBaseline,
      valueNow,
      valueAtBaseline,
      weightNow,
      weightAtBaseline,
      deltaWeightPp,
      deltaValueUsd,
      deltaPricePct,
    });

    const absW = Math.abs(deltaWeightPp);
    if (absW > topAbs) {
      topAbs = absW;
      topDrifter = sym;
    }
  }

  const totalDeltaUsd = totalNow - totalAtBaseline;
  const totalDeltaPct =
    totalAtBaseline > 0 ? totalDeltaUsd / totalAtBaseline : 0;

  // Sort rows by absolute weight drift descending — most interesting first.
  rows.sort((a, b) => Math.abs(b.deltaWeightPp) - Math.abs(a.deltaWeightPp));

  return {
    rows,
    totalNow,
    totalAtBaseline,
    totalDeltaUsd,
    totalDeltaPct,
    topDrifter: topAbs > 0 ? topDrifter : null,
  };
}

/**
 * Project a set of weights onto a target basket: drop symbols not in the
 * basket and renormalize so the remaining weights sum to 1.0.
 * Returns {} if the masked sum is 0 (nothing in basket has weight).
 */
export function normalizeForRebalance(
  weights: Readonly<Record<string, number>>,
  basketSymbols: ReadonlyArray<string>,
): Record<string, number> {
  if (!weights || !basketSymbols || basketSymbols.length === 0) return {};
  const basket = new Set(basketSymbols);
  const filtered: Record<string, number> = {};
  let sum = 0;
  for (const sym of Object.keys(weights)) {
    if (!basket.has(sym)) continue;
    const w = safeNum(weights[sym]);
    if (w <= 0) continue;
    filtered[sym] = w;
    sum += w;
  }
  if (sum <= 0) return {};
  const out: Record<string, number> = {};
  for (const sym of Object.keys(filtered)) {
    out[sym] = filtered[sym] / sum;
  }
  return out;
}

/**
 * Capture the current portfolio state as a baseline snapshot.
 * `label` defaults to a Russian-localized date stamp.
 */
export function createBaselineSnapshot(
  holdings: ReadonlyArray<Holding>,
  prices: Readonly<Record<string, number>>,
  label?: string,
): BaselineSnapshot {
  const takenAt = nowMs();
  const quantities: Record<string, number> = {};
  const pricesAtSnapshot: Record<string, number> = {};
  for (const h of holdings ?? []) {
    quantities[h.symbol] = safeNum(h.qty);
    pricesAtSnapshot[h.symbol] = safeNum(prices?.[h.symbol]);
  }
  const { totalUsd } = computeTotals(holdings ?? [], prices);
  const weights = computeWeights(holdings ?? [], prices);
  return {
    id: makeId(),
    label: label && label.trim().length > 0 ? label : defaultBaselineLabel(takenAt),
    takenAt,
    quantities,
    pricesAtSnapshot,
    totalUsd,
    weights,
  };
}

/**
 * Add a new holding or update the qty of an existing one.
 * `addedAt` is preserved on update; `updatedAt` is refreshed.
 * Returns a NEW array.
 */
export function upsertHolding(
  holdings: ReadonlyArray<Holding>,
  symbol: ExchangeSymbol,
  qty: number,
): Holding[] {
  const safeQty = safeNum(qty);
  const ts = nowMs();
  const list = holdings ? [...holdings] : [];
  const idx = list.findIndex((h) => h.symbol === symbol);
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      qty: safeQty,
      updatedAt: ts,
    };
    return list;
  }
  list.push({
    symbol,
    qty: safeQty,
    addedAt: ts,
    updatedAt: ts,
  });
  return list;
}

/** Remove a holding by symbol. Returns a NEW array. */
export function removeHolding(
  holdings: ReadonlyArray<Holding>,
  symbol: ExchangeSymbol,
): Holding[] {
  if (!holdings || holdings.length === 0) return [];
  return holdings.filter((h) => h.symbol !== symbol);
}

/**
 * Append a transaction to the payload, regenerate derived holdings via
 * applyTransactions, and cap the log at 1000 entries (oldest trimmed first).
 * Returns a NEW payload.
 */
export function addTransaction(
  state: HoldingsPayload,
  txWithoutIdLogged: Omit<Transaction, "id" | "loggedAt">,
): HoldingsPayload {
  const base = state ?? emptyPayload();
  const newTx: Transaction = {
    ...txWithoutIdLogged,
    id: makeId(),
    loggedAt: nowMs(),
  };
  let transactions = [...(base.transactions ?? []), newTx];
  if (transactions.length > 1000) {
    transactions = transactions.slice(transactions.length - 1000);
  }
  // Replay from an empty seed so the derived holdings are reproducible
  // from the (capped) tx log alone.
  const { holdings } = applyTransactions([], transactions);
  return {
    ...base,
    version: 1,
    holdings,
    transactions,
  };
}

/**
 * Mark a transaction as voided (soft-delete) and recompute holdings.
 * No-op if the id is not found.
 */
export function voidTransaction(
  state: HoldingsPayload,
  txId: string,
): HoldingsPayload {
  const base = state ?? emptyPayload();
  const ts = nowMs();
  let touched = false;
  const transactions = (base.transactions ?? []).map((t) => {
    if (t.id === txId && t.voidedAt == null) {
      touched = true;
      return { ...t, voidedAt: ts };
    }
    return t;
  });
  if (!touched) return base;
  const { holdings } = applyTransactions([], transactions);
  return {
    ...base,
    version: 1,
    holdings,
    transactions,
  };
}

/**
 * Prepend a baseline snapshot to the history. Caps the list at 20 entries
 * (oldest dropped). Returns a NEW payload.
 */
export function addBaseline(
  state: HoldingsPayload,
  snapshot: BaselineSnapshot,
): HoldingsPayload {
  const base = state ?? emptyPayload();
  const existing = base.baselines ?? [];
  const baselines = [snapshot, ...existing].slice(0, 20);
  return {
    ...base,
    version: 1,
    baselines,
  };
}
