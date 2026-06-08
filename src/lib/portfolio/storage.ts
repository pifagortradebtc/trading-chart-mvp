import type { PinnedPortfolio, Preset } from "./types";
import type { AggregateRules, ViewInput } from "./strategyTypes";
import type { RecommendationMode } from "./recommendationModes";
import {
  emptyPayload,
  type BaselineSnapshot,
  type Holding,
  type HoldingsPayload,
  type Transaction,
} from "./holdings";

const PRESETS_KEY = "mpt-simulator:presets/v1";
const PINNED_KEY = "mpt-simulator:pinned/v1";
const POLICY_KEY = "mpt-simulator:policy/v1";
export const HOLDINGS_KEY = "mpt-simulator:holdings/v1";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable — best-effort, ignore.
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadPresets(): Preset[] {
  return readJSON<Preset[]>(PRESETS_KEY, []);
}

export function savePreset(input: Omit<Preset, "id" | "createdAt">): Preset {
  const preset: Preset = { ...input, id: uuid(), createdAt: Date.now() };
  const current = loadPresets();
  writeJSON(PRESETS_KEY, [preset, ...current]);
  return preset;
}

export function deletePreset(id: string): Preset[] {
  const filtered = loadPresets().filter((p) => p.id !== id);
  writeJSON(PRESETS_KEY, filtered);
  return filtered;
}

export function loadPinned(): PinnedPortfolio[] {
  return readJSON<PinnedPortfolio[]>(PINNED_KEY, []);
}

export function savePinned(pinned: PinnedPortfolio[]): void {
  writeJSON(PINNED_KEY, pinned);
}

export function addPinned(
  pinned: PinnedPortfolio[],
  next: Omit<PinnedPortfolio, "id" | "pinnedAt">
): PinnedPortfolio[] {
  const entry: PinnedPortfolio = { ...next, id: uuid(), pinnedAt: Date.now() };
  const updated = [...pinned, entry];
  savePinned(updated);
  return updated;
}

export function removePinned(
  pinned: PinnedPortfolio[],
  id: string
): PinnedPortfolio[] {
  const updated = pinned.filter((p) => p.id !== id);
  savePinned(updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy persistence (risk caps + BL views + CVaR threshold)
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyState {
  riskCaps: Record<string, { min?: number; max?: number }>;
  aggregateRules: AggregateRules;
  views: ViewInput[];
  /** Daily CVaR threshold for the defensive bump, e.g. -0.08. */
  cvarDefenseThreshold: number;
  /** Bot strategies sleeve as a fraction of total AUM. */
  botSleeve: number;
  /** Manual book sleeve as a fraction of total AUM. */
  manualSleeve: number;
  /** Which Portfolio sub-tab was open last — restored on next visit. */
  activeTab: string;
  /** Last-applied recommendation preset (Conservative / Balanced / Aggressive). */
  recommendationMode?: RecommendationMode;
  /** User-entered current portfolio weights (0..1, keyed by symbol) for Rebalance Plan. */
  currentWeights?: Record<string, number>;
}

/**
 * Returns whatever policy fields are present in localStorage, or an empty
 * object on a fresh install / quota-exceeded / parse error. Callers should
 * merge defensively (existing state ← stored partial).
 */
export function loadPolicy(): Partial<PolicyState> {
  return readJSON<Partial<PolicyState>>(POLICY_KEY, {});
}

export function savePolicy(policy: PolicyState): void {
  writeJSON(POLICY_KEY, policy);
}

export function resetPolicy(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(POLICY_KEY);
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings persistence ("Мои активы")
// ─────────────────────────────────────────────────────────────────────────────

const HOLDINGS_MAX_SERIALIZED_CHARS = 256_000;

// TxKind is a string-union type (compile-time only), so its values must be
// listed explicitly. Keep this in sync with the union in holdings.ts.
const TX_KIND_VALUES = new Set<string>(["BUY", "SELL", "DEPOSIT", "WITHDRAW"]);

function isValidSymbol(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidHolding(value: unknown): value is Holding {
  if (!value || typeof value !== "object") return false;
  const h = value as Partial<Holding>;
  return (
    isValidSymbol(h.symbol) &&
    Number.isFinite(h.qty) &&
    // costBasisUsd is optional — must be either undefined or a finite number.
    (h.costBasisUsd === undefined || Number.isFinite(h.costBasisUsd))
  );
}

function isValidTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<Transaction> & { kind?: unknown };
  return (
    isValidSymbol(t.symbol) &&
    Number.isFinite(t.qty) &&
    Number.isFinite(t.priceUsd) &&
    typeof t.kind === "string" &&
    TX_KIND_VALUES.has(t.kind)
  );
}

function isValidBaseline(value: unknown): value is BaselineSnapshot {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<BaselineSnapshot>;
  return Number.isFinite(b.totalUsd) && Number.isFinite(b.takenAt);
}

/**
 * Loads the holdings payload from localStorage. Returns an empty payload on
 * miss, version mismatch, parse error, or any structural issue. Never throws.
 */
export function loadHoldings(): HoldingsPayload {
  const raw = readJSON<unknown>(HOLDINGS_KEY, null);
  if (!raw || typeof raw !== "object") return emptyPayload();
  try {
    const parsed = raw as Partial<HoldingsPayload>;
    if (parsed.version !== 1) return emptyPayload();
    const holdings = Array.isArray(parsed.holdings)
      ? parsed.holdings.filter(isValidHolding)
      : [];
    const transactions = Array.isArray(parsed.transactions)
      ? parsed.transactions.filter(isValidTransaction)
      : [];
    const baselines = Array.isArray(parsed.baselines)
      ? parsed.baselines.filter(isValidBaseline)
      : [];
    return {
      ...emptyPayload(),
      ...parsed,
      version: 1,
      holdings,
      transactions,
      baselines,
    };
  } catch {
    return emptyPayload();
  }
}

/**
 * Persists the holdings payload. If serialized size exceeds the cap, trims
 * oldest voided transactions first, then oldest baselines. If still too large,
 * logs a warning and skips the save (never throws).
 */
export function saveHoldings(payload: HoldingsPayload): void {
  let next: HoldingsPayload = payload;
  let serialized = JSON.stringify(next);
  if (serialized.length > HOLDINGS_MAX_SERIALIZED_CHARS) {
    const voided = next.transactions
      .filter((t) => (t as Transaction & { voidedAt?: number }).voidedAt)
      .sort(
        (a, b) =>
          ((a as Transaction & { voidedAt?: number }).voidedAt ?? 0) -
          ((b as Transaction & { voidedAt?: number }).voidedAt ?? 0)
      );
    const live = next.transactions.filter(
      (t) => !(t as Transaction & { voidedAt?: number }).voidedAt
    );
    const trimmedTx: Transaction[] = [...voided, ...live];
    while (
      trimmedTx.length > 0 &&
      JSON.stringify({ ...next, transactions: trimmedTx }).length >
        HOLDINGS_MAX_SERIALIZED_CHARS
    ) {
      const dropped = trimmedTx.shift();
      if (!dropped) break;
      if (!(dropped as Transaction & { voidedAt?: number }).voidedAt) break;
    }
    next = { ...next, transactions: trimmedTx };
    serialized = JSON.stringify(next);
  }
  if (serialized.length > HOLDINGS_MAX_SERIALIZED_CHARS) {
    const sortedBaselines = [...next.baselines].sort(
      (a, b) => a.takenAt - b.takenAt
    );
    while (
      sortedBaselines.length > 0 &&
      JSON.stringify({ ...next, baselines: sortedBaselines }).length >
        HOLDINGS_MAX_SERIALIZED_CHARS
    ) {
      sortedBaselines.shift();
    }
    next = { ...next, baselines: sortedBaselines };
    serialized = JSON.stringify(next);
  }
  if (serialized.length > HOLDINGS_MAX_SERIALIZED_CHARS) {
    if (typeof console !== "undefined") {
      console.warn(
        `[holdings] payload too large (${serialized.length} chars > ${HOLDINGS_MAX_SERIALIZED_CHARS}); skipping save`
      );
    }
    return;
  }
  writeJSON(HOLDINGS_KEY, next);
}

export function clearHoldings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HOLDINGS_KEY);
  } catch {
    // ignore
  }
}
