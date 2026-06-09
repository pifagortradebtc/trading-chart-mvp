/**
 * Engine Run Journal — локальный audit-trail для рекомендованных
 * композиций. Каждый run = снимок параметров расчёта + выданных весов
 * на момент времени.
 *
 * Зачем:
 *  - Воспроизводимость: «какие веса выдал engine 30 дней назад с такими
 *    параметрами» → можно ретроспективно оценить решения.
 *  - Audit: история всех Copy NAV, кто/когда/почему.
 *  - Сравнение: diff между двумя runs (что изменилось в портфеле).
 *
 * Архитектура: local-first. LocalStorage — быстрый и работает офлайн.
 * Сервер (.cache-disk/engine-runs/*.json) — durable, чтобы пережил
 * очистку браузера. Server write fire-and-forget — не блокирует UI.
 *
 * `paramsHash` — детерминированный SHA-256 от sorted JSON параметров.
 * Два запуска с теми же caps/views/mode дадут один paramsHash, но
 * `weights` будут разные (потому что обновились live market caps,
 * новые OHLCV — это и есть смысл повторного расчёта).
 */

import type { RecommendationMode } from "./recommendationModes";
import type { AggregateRules, ViewInput } from "./strategyTypes";

type RiskCapMap = Record<string, { min?: number; max?: number }>;

export interface EngineRunSnapshot {
  /** UUID конкретного snapshot. */
  id: string;
  /** Hash параметров расчёта. */
  paramsHash: string;
  /** Когда snapshot был создан, ms epoch. */
  createdAt: number;
  /** Когда оператор нажал Copy NAV (если жал). */
  publishedAt?: number;
  /** Рекомендационный режим на момент расчёта. */
  mode: RecommendationMode;
  /** Универс в порядке выбора. */
  assets: string[];
  /** Final fund weights (symbol → weight 0..1). Сумма ≈ 1. */
  weights: Record<string, number>;
  /** Confidence score 0..100 (как в ConfidenceBreakdown.score). */
  confidence: number;
  /** Использован ли live market caps или fallback на snapshot. */
  liveMarketCapsUsed: boolean;
  /** Свободный комментарий оператора (опц.). */
  note?: string;
}

export interface EngineRunParams {
  assets: string[];
  riskCaps: RiskCapMap;
  aggregateRules: AggregateRules;
  views: ViewInput[];
  cvarDefenseThreshold: number;
  mode: RecommendationMode;
  riskFreeRate: number;
  simulations: number;
  historyDays: number;
}

/**
 * Канонизирует JSON: ключи объектов рекурсивно отсортированы. Это даёт
 * стабильный байтовый образ для hashing — JSON.stringify по-разному
 * порядок ключей не гарантирует.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}

/**
 * SHA-256 от canonicalized params, обрезанный до 16 hex-символов.
 * 16 hex = 64 bits collision space — для нашего use-case (≤200 runs)
 * этого с большим запасом достаточно (birthday-collision ≈ 2^32).
 */
export async function computeParamsHash(params: EngineRunParams): Promise<string> {
  const canon = canonicalize(params);
  const buf = new TextEncoder().encode(canon);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(hashBuf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function genRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Local persistence (browser)
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "mpt-simulator:engine-runs/v1";
const MAX_LOCAL_RUNS = 50;

export function loadLocalRuns(): EngineRunSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EngineRunSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveLocalRuns(runs: EngineRunSnapshot[]): void {
  if (typeof window === "undefined") return;
  // CORRECTNESS FIX: раньше silently глотался ЛЮБОЙ throw, включая
  // QuotaExceededError — новый run просто терялся без feedback. Теперь
  // явно ловим quota и пытаемся fallback на меньший срез (последние 5
  // вместо MAX_LOCAL_RUNS=20). Если и это не помогло — logging.
  const truncated = runs.slice(0, MAX_LOCAL_RUNS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(truncated));
    return;
  } catch (e) {
    const isQuota =
      e instanceof Error &&
      (e.name === "QuotaExceededError" || e.message.includes("quota"));
    if (!isQuota) {
      // Non-quota error — log и пропускаем (durable copy на сервере)
      if (typeof console !== "undefined") {
        console.warn("[engineRuns] saveLocalRuns failed (non-quota):", e);
      }
      return;
    }
  }
  // Quota — пробуем компактнее (5 свежих вместо 20)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, 5)));
    if (typeof console !== "undefined") {
      console.warn(
        "[engineRuns] localStorage quota — сохранили 5 свежих runs вместо 20. Серверная durable copy не задета.",
      );
    }
  } catch {
    // Если даже 5 не лезут — что-то совсем не так с localStorage
    if (typeof console !== "undefined") {
      console.warn(
        "[engineRuns] localStorage полностью забит — runs не сохранены. Server copy используется.",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// High-level operations (local + best-effort server sync)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Записывает snapshot локально (мгновенно) и в фоне отправляет на сервер.
 * Server failure не блокирует — local persistence остаётся source of truth.
 */
export async function recordRun(
  input: Omit<EngineRunSnapshot, "id" | "createdAt">,
): Promise<EngineRunSnapshot> {
  const snapshot: EngineRunSnapshot = {
    ...input,
    id: genRunId(),
    createdAt: Date.now(),
  };
  const existing = loadLocalRuns();
  saveLocalRuns([snapshot, ...existing]);

  if (typeof window !== "undefined") {
    fetch("/api/engine-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      cache: "no-store",
    }).catch(() => {
      // server miss — local is canonical
    });
  }
  return snapshot;
}

export async function updateRunNote(id: string, note: string): Promise<void> {
  const runs = loadLocalRuns();
  saveLocalRuns(runs.map((r) => (r.id === id ? { ...r, note } : r)));
  if (typeof window !== "undefined") {
    fetch(`/api/engine-runs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
      cache: "no-store",
    }).catch(() => {});
  }
}

export async function markPublished(id: string): Promise<void> {
  const at = Date.now();
  const runs = loadLocalRuns();
  saveLocalRuns(
    runs.map((r) => (r.id === id ? { ...r, publishedAt: at } : r)),
  );
  if (typeof window !== "undefined") {
    fetch(`/api/engine-runs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishedAt: at }),
      cache: "no-store",
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Comparison helpers (UI consumes for diff display)
// ─────────────────────────────────────────────────────────────────────────

export interface WeightDelta {
  symbol: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * Возвращает per-symbol delta между двумя snapshot'ами.
 * Включает символы из любого из run'ов (union). Отсортировано по |delta| desc.
 */
export function diffWeights(
  before: EngineRunSnapshot | { weights: Record<string, number> },
  after: EngineRunSnapshot | { weights: Record<string, number> },
): WeightDelta[] {
  const symbols = new Set([
    ...Object.keys(before.weights),
    ...Object.keys(after.weights),
  ]);
  const rows: WeightDelta[] = [];
  for (const symbol of symbols) {
    const b = before.weights[symbol] ?? 0;
    const a = after.weights[symbol] ?? 0;
    rows.push({ symbol, before: b, after: a, delta: a - b });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return rows;
}
