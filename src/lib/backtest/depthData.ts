/**
 * Клиентский загрузчик order-book depth серий для backtest BuyForce / SellForce.
 *
 * Архитектура:
 *   browser cache (IndexedDB)   ← быстрый горячий путь
 *        ↓ miss / forceRefresh
 *   /api/bidask (Next.js)        ← server-side disk cache + proxy к VPS
 *        ↓
 *   pifagor.153.80.192.107.nip.io/api/v1/bidask
 *
 * IndexedDB лежит в той же БД что и OHLCV (`pifagor-backtest-cache`) — отдельный
 * object store `"depth"`. БД мигрирует с version 1 → 2 при первой попытке открыть.
 */

import type { DepthBar, DepthInterval } from "./depthTypes";

// Re-export для удобства потребителей (signal-файлы, engine).
export type { DepthBar, DepthInterval };

export interface LoadDepthOptions {
  symbol: string;
  interval: DepthInterval;
  startMs: number;
  endMs: number;
  yearsBack: number;
  /** Если true — IndexedDB читается, но игнорируется (всё равно идём в /api/bidask). */
  forceRefresh?: boolean;
  /** Default true. Если false — IDB не читаем и не пишем. */
  useCache?: boolean;
  onProgress?: (p: { phase: "idb" | "server"; message: string }) => void;
}

export type DepthLoadSource = "idb" | "server-disk" | "server-vps";

export interface DepthLoadResult {
  bars: DepthBar[];
  oldestAvailableMs: number | null;
  warning?: string;
  source: DepthLoadSource;
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────

const DB_NAME = "pifagor-backtest-cache";
const DB_VERSION = 2; // bumped from 1 (ohlcv-only) to 2 (added depth store)
const STORE_OHLCV = "ohlcv";
const STORE_DEPTH = "depth";

interface DepthCacheRow {
  bars: DepthBar[];
  oldestAvailableMs: number | null;
  warning?: string;
  savedAt: number;
}

function stableKey(symbol: string, interval: DepthInterval, yearsBack: number): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `v1_${sym}_${interval}_y${yearsBack}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OHLCV)) {
        db.createObjectStore(STORE_OHLCV);
      }
      if (!db.objectStoreNames.contains(STORE_DEPTH)) {
        db.createObjectStore(STORE_DEPTH);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGet(key: string): Promise<DepthCacheRow | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return await new Promise<DepthCacheRow | null>((resolve) => {
    const tx = db.transaction(STORE_DEPTH, "readonly");
    const store = tx.objectStore(STORE_DEPTH);
    const req = store.get(key);
    req.onsuccess = () => {
      const v = req.result;
      if (v && typeof v === "object" && Array.isArray((v as DepthCacheRow).bars)) {
        resolve(v as DepthCacheRow);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function idbPut(key: string, row: DepthCacheRow): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_DEPTH, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
    tx.objectStore(STORE_DEPTH).put(row, key);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampBarsToWindow(bars: DepthBar[], startMs: number, endMs: number): DepthBar[] {
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.ceil(endMs / 1000);
  return bars.filter((b) => b.t >= startSec && b.t <= endSec);
}

function isCacheWindowSufficient(
  row: DepthCacheRow,
  startMs: number,
  endMs: number,
  intervalMs: number,
): boolean {
  if (!row.bars.length) return false;
  const firstMs = row.bars[0].t * 1000;
  const lastMs = row.bars[row.bars.length - 1].t * 1000;
  // Кеш покрывает запрошенное окно если:
  //  - первый бар <= запрошенному startMs (или close to it, в пределах одного интервала)
  //  - последний бар >= endMs - intervalMs (есть данные близко к концу окна)
  return firstMs <= startMs + intervalMs && lastMs >= endMs - intervalMs;
}

const INTERVAL_MS: Record<DepthInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

// ─── Server fetch ─────────────────────────────────────────────────────────────

interface ServerResponse {
  source: "disk" | "vps";
  symbol: string;
  interval: string;
  bars: DepthBar[];
  oldestAvailableMs: number | null;
  warning?: string;
  cachedAt: string;
}

async function fetchFromServer(opts: LoadDepthOptions): Promise<ServerResponse> {
  const params = new URLSearchParams({
    symbol: opts.symbol.toUpperCase(),
    interval: opts.interval,
    startMs: String(opts.startMs),
    endMs: String(opts.endMs),
    yearsBack: String(opts.yearsBack),
  });
  const url = `/api/bidask?${params.toString()}`;
  const resp = await fetch(url, { method: "GET", cache: "no-store" });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`/api/bidask responded ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as ServerResponse;
  if (!Array.isArray(data.bars)) {
    throw new Error("/api/bidask returned invalid payload (no 'bars' array)");
  }
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Загружает depth-серию для backtest.
 *
 * Поток:
 *  1. Если useCache !== false и !forceRefresh — пробуем IndexedDB.
 *     Если кеш достаточен для окна [startMs, endMs] — отдаём.
 *  2. Иначе/в дополнение — идём в `/api/bidask` (он сам обновляет server-side
 *     disk cache и кэширует ответ на Render disk).
 *  3. Сохраняем результат в IndexedDB.
 *  4. Подрезаем результат к запрошенному окну и отдаём.
 */
export async function loadDepthData(opts: LoadDepthOptions): Promise<DepthLoadResult> {
  if (opts.endMs <= opts.startMs) {
    throw new Error("loadDepthData: endMs must be > startMs");
  }
  const useCache = opts.useCache !== false;
  const intervalMs = INTERVAL_MS[opts.interval];
  const key = stableKey(opts.symbol, opts.interval, opts.yearsBack);

  // 1. Browser cache
  if (useCache && !opts.forceRefresh) {
    opts.onProgress?.({ phase: "idb", message: "Проверка локального кеша…" });
    const cached = await idbGet(key);
    if (cached && isCacheWindowSufficient(cached, opts.startMs, opts.endMs, intervalMs)) {
      return {
        bars: clampBarsToWindow(cached.bars, opts.startMs, opts.endMs),
        oldestAvailableMs: cached.oldestAvailableMs,
        warning: cached.warning,
        source: "idb",
      };
    }
  }

  // 2. Сервер (с disk cache на Render side)
  opts.onProgress?.({ phase: "server", message: "Загрузка depth-данных…" });
  const server = await fetchFromServer(opts);

  // 3. Save в IndexedDB
  if (useCache) {
    await idbPut(key, {
      bars: server.bars,
      oldestAvailableMs: server.oldestAvailableMs,
      warning: server.warning,
      savedAt: Date.now(),
    });
  }

  // 4. Clamp + return
  return {
    bars: clampBarsToWindow(server.bars, opts.startMs, opts.endMs),
    oldestAvailableMs: server.oldestAvailableMs,
    warning: server.warning,
    source: server.source === "disk" ? "server-disk" : "server-vps",
  };
}

/**
 * Быстрая попытка восстановить depth-серию из IndexedDB без выходов в сеть.
 * Полезно для авто-восстановления при смене символа/ТФ — не блокирует UI.
 * Возвращает null если кеша нет или он не пересекается с окном.
 */
export async function tryLoadDepthFromCache(
  symbol: string,
  interval: DepthInterval,
  yearsBack: number,
  startMs: number,
  endMs: number,
): Promise<DepthLoadResult | null> {
  const key = stableKey(symbol, interval, yearsBack);
  const cached = await idbGet(key);
  if (!cached || !cached.bars.length) return null;
  const trimmed = clampBarsToWindow(cached.bars, startMs, endMs);
  if (trimmed.length === 0) return null;
  return {
    bars: trimmed,
    oldestAvailableMs: cached.oldestAvailableMs,
    warning: cached.warning,
    source: "idb",
  };
}
