import type { MPTResult, PinnedPortfolio, Preset, PriceSeries } from "./types";
import type { AggregateRules, StrategyResult, ViewInput } from "./strategyTypes";
import type { RecommendationMode } from "./recommendationModes";
import type { AssetDataQuality } from "./dataQuality";

const PRESETS_KEY = "mpt-simulator:presets/v1";
const PINNED_KEY = "mpt-simulator:pinned/v1";
const POLICY_KEY = "mpt-simulator:policy/v1";
const LAST_RESULT_KEY = "mpt-simulator:last-result/v1";

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
// Last computed result persistence
//
// Раньше Recommended Tab пересчитывался заново при каждой загрузке страницы
// (mount → recalculate с live market caps), поэтому веса «уплывали» со временем.
// Теперь результат последнего пересчёта замораживается здесь и восстанавливается
// при перезагрузке — до следующего ручного «Пересчитать».
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistedEngineResult {
  /** Версия схемы снимка — для безопасной миграции/инвалидации. */
  v: 1;
  /** Когда сохранён, ms epoch. */
  savedAt: number;
  /** Входные параметры на момент расчёта — восстанавливаются вместе с результатом. */
  assets: string[];
  historyDays: number;
  simulations: number;
  riskFreeRate: number;
  recommendationMode?: RecommendationMode;
  /** Сам результат расчёта. */
  result: MPTResult;
  strategies: StrategyResult[];
  dataQuality: AssetDataQuality[] | null;
  /**
   * Выровненные ценовые ряды. Могут быть тяжёлыми (8 активов × ~1095 дней) —
   * при переполнении квоты сохраняются как null (веса в donut'е всё равно
   * восстановятся из strategies; графики equity/liquidity просто скроются).
   */
  priceSeries: PriceSeries[] | null;
  warningSymbols: string[];
  pendingSymbols: { symbol: string; length: number; maxLength: number }[];
  durationMs: number | null;
}

export function loadLastResult(): PersistedEngineResult | null {
  const r = readJSON<PersistedEngineResult | null>(LAST_RESULT_KEY, null);
  if (!r || r.v !== 1 || !r.result || !Array.isArray(r.strategies)) return null;
  return r;
}

/**
 * Сохраняет снимок последнего расчёта. При QuotaExceededError повторяет попытку
 * без priceSeries (это самая тяжёлая часть), чтобы хотя бы веса пережили
 * перезагрузку.
 */
export function saveLastResult(snapshot: PersistedEngineResult): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(snapshot));
  } catch {
    try {
      window.localStorage.setItem(
        LAST_RESULT_KEY,
        JSON.stringify({ ...snapshot, priceSeries: null }),
      );
    } catch {
      // storage недоступна — молча сдаёмся, на UX не влияет
    }
  }
}

export function clearLastResult(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_RESULT_KEY);
  } catch {
    // ignore
  }
}

