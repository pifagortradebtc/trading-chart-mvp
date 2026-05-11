/**
 * Загрузка OHLCV с Binance / из CSV / локальный кеш (IndexedDB).
 */

import type { Candle } from "@/types/candle";
import type { FetchProgress } from "./types";
import { binanceRowToCandle, mergeCandlesSorted } from "./ohlcvUtils";

export { binanceRowToCandle, mergeCandlesSorted } from "./ohlcvUtils";

const DB_NAME = "pifagor-backtest-cache";
const STORE = "ohlcv";
const DB_VERSION = 1;

export type DataSource = "binance" | "csv";

export interface LoadOptions {
  symbol: string;
  /** Например ETHUSDT */
  interval: string;
  startMs: number;
  endMs: number;
  /** Стабильный ключ IndexedDB: пара + TF + глубина лет (не зависит от «сегодня» как endMs). */
  yearsBack?: number;
  /** Пропустить чтение локального кеша и заново запросить сервер/Binance. */
  forceRefresh?: boolean;
  onProgress?: (p: FetchProgress) => void;
  useCache?: boolean;
}

interface StableCacheRow {
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
  savedAt: number;
}

/** Ключ кеша в IndexedDB: один раз скачали ETH 15m × 8 лет — тот же ключ после перезагрузки и деплоя. */
export function stableBrowserCacheKey(
  symbol: string,
  interval: string,
  yearsBack: number,
): string {
  const sym = symbol.replace("/", "").toUpperCase();
  return `v2_${sym}_${interval}_y${yearsBack}`;
}

export async function saveOhlcvBrowserCache(
  symbol: string,
  interval: string,
  yearsBack: number,
  payload: {
    candles: Candle[];
    oldestAvailableMs: number | null;
    warning?: string;
  },
): Promise<void> {
  const key = stableBrowserCacheKey(symbol, interval, yearsBack);
  const row: StableCacheRow = {
    ...payload,
    savedAt: Date.now(),
  };
  await idbSet(key, row);
}

/** Прочитать сохранённые свечи и подрезать под текущее окно [startMs, endMs]. */
export async function tryLoadOhlcvBrowserCache(
  symbol: string,
  interval: string,
  yearsBack: number,
  startMs: number,
  endMs: number,
): Promise<{ candles: Candle[]; oldestAvailableMs: number | null; warning?: string } | null> {
  const key = stableBrowserCacheKey(symbol, interval, yearsBack);
  const row = await idbGet<StableCacheRow>(key);
  if (!row?.candles?.length) return null;
  const trimmed = row.candles.filter((c) => {
    const t = c.time * 1000;
    return t >= startMs && t <= endMs;
  });
  const candles = trimmed.length > 0 ? trimmed : row.candles;
  return {
    candles,
    oldestAvailableMs: row.oldestAvailableMs ?? null,
    warning: row.warning,
  };
}

function cacheKey(symbol: string, interval: string): string {
  return `${symbol}_${interval}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const r = st.get(key);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result as T | undefined);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /** игнор если IndexedDB недоступен */
  }
}

/**
 * Загрузка с Binance Spot REST (публичный API).
 * Постранично назад во времени до достижения startMs или исчерпания данных.
 */
export async function fetchBinanceSpotKlines(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  const { symbol, interval, startMs, endMs, onProgress, useCache = true, forceRefresh = false } =
    opts;
  /** Легаси-ключ зависел от endMs=«сейчас» — при новом заходе не совпадал; оставляем для старых записей. */
  const key = `${cacheKey(symbol, interval)}_${startMs}_${endMs}`;
  if (useCache && !forceRefresh) {
    const cached = await idbGet<{ candles: Candle[]; oldestMs: number | null }>(key);
    if (cached?.candles?.length) {
      onProgress?.({
        loadedBars: cached.candles.length,
        phase: "cache",
        message: "Загружено из кеша IndexedDB",
      });
      return {
        candles: cached.candles,
        oldestAvailableMs: cached.oldestMs ?? null,
      };
    }
  }

  const out: Candle[] = [];
  let end = endMs;
  let oldestInBatch: number | null = null;
  let guard = 500;

  onProgress?.({ loadedBars: 0, phase: "network", message: "Binance: загрузка..." });

  while (guard-- > 0) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", symbol.replace("/", ""));
    url.searchParams.set("interval", interval);
    url.searchParams.set("endTime", String(end));
    url.searchParams.set("limit", "1000");

    const res = await fetch(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Binance ${res.status}: ${txt}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;

    const batch = raw.map(binanceRowToCandle);
    oldestInBatch = batch[0]!.time * 1000;
    for (const c of batch) {
      if (c.time * 1000 >= startMs && c.time * 1000 <= endMs) out.push(c);
    }

    onProgress?.({
      loadedBars: out.length,
      phase: "network",
      message: `Binance: загружено ${out.length} баров…`,
    });

    const firstOpen = raw[0][0] as number;
    if (firstOpen <= startMs) break;
    end = firstOpen - 1;

    if (batch.length < 1000) break;
  }

  const candles = mergeCandlesSorted([], out).filter(
    (c) => c.time * 1000 >= startMs && c.time * 1000 <= endMs,
  );

  let warning: string | undefined;
  if (candles.length && candles[0]!.time * 1000 > startMs + 60_000) {
    warning = `Биржа отдала данные только с ${new Date(candles[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
  }

  await idbSet(key, {
    candles,
    oldestMs: oldestInBatch,
  });

  onProgress?.({ loadedBars: candles.length, phase: "done", message: "Готово" });

  return {
    candles,
    oldestAvailableMs: oldestInBatch,
    warning,
  };
}

/** Парсинг CSV: timestamp,open,high,low,close,volume — timestamp в ms или секундах. */
export function parseOhlcvCsv(text: string): Candle[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const out: Candle[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^timestamp/i.test(line)) continue;
    const parts = line.split(/[,;\t]/).map((s) => s.trim());
    if (parts.length < 6) continue;
    let ts = Number(parts[0]);
    if (!Number.isFinite(ts)) continue;
    /** ms → сек Unix для lightweight-charts */
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    else ts = Math.floor(ts);

    out.push({
      time: ts,
      open: Number(parts[1]),
      high: Number(parts[2]),
      low: Number(parts[3]),
      close: Number(parts[4]),
      volume: Number(parts[5]),
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Пытается загрузить через `/api/ohlcv` (кеш на persistent disk на Render).
 * Если API недоступен или отключён (`NEXT_PUBLIC_SERVER_DISK_CACHE=0`) — прямой Binance + IndexedDB.
 */
async function loadOhlcvViaServerApi(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
} | null> {
  if (typeof window === "undefined") return null;
  if (process.env.NEXT_PUBLIC_SERVER_DISK_CACHE === "0") return null;

  const params = new URLSearchParams({
    symbol: opts.symbol.replace("/", ""),
    interval: opts.interval,
    startMs: String(opts.startMs),
    endMs: String(opts.endMs),
  });

  const res = await fetch(`/api/ohlcv?${params}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    error?: string;
    candles?: Candle[];
    oldestAvailableMs?: number | null;
    warning?: string;
    source?: string;
  };
  if (data.error || !data.candles) return null;

  opts.onProgress?.({
    loadedBars: data.candles.length,
    phase: data.source === "disk" ? "cache" : "network",
    message:
      data.source === "disk"
        ? "Сервер: данные с диска (persistent)"
        : "Сервер: загружено с Binance и записано на диск",
  });

  return {
    candles: data.candles,
    oldestAvailableMs: data.oldestAvailableMs ?? null,
    warning: data.warning,
  };
}

/** Унифицированная загрузка: стабильный IndexedDB → серверный диск → Binance REST; после успеха — сохранение v2-кеша. */
export async function loadOhlcvBinance(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  const sym = opts.symbol.replace("/", "").toUpperCase();
  const {
    startMs,
    endMs,
    yearsBack,
    useCache = true,
    forceRefresh = false,
    onProgress,
  } = opts;

  if (!forceRefresh && useCache && yearsBack != null) {
    const hit = await tryLoadOhlcvBrowserCache(sym, opts.interval, yearsBack, startMs, endMs);
    if (hit?.candles?.length) {
      onProgress?.({
        loadedBars: hit.candles.length,
        phase: "cache",
        message: "Из локального кеша браузера (IndexedDB)",
      });
      onProgress?.({ loadedBars: hit.candles.length, phase: "done", message: "Готово" });
      return {
        candles: hit.candles,
        oldestAvailableMs: hit.oldestAvailableMs,
        warning: hit.warning,
      };
    }
  }

  try {
    const fromServer = await loadOhlcvViaServerApi(opts);
    if (fromServer?.candles?.length) {
      if (yearsBack != null) {
        await saveOhlcvBrowserCache(sym, opts.interval, yearsBack, {
          candles: fromServer.candles,
          oldestAvailableMs: fromServer.oldestAvailableMs ?? null,
          warning: fromServer.warning,
        });
      }
      onProgress?.({
        loadedBars: fromServer.candles.length,
        phase: "done",
        message: "Готово",
      });
      return fromServer;
    }
  } catch {
    /** fallback ниже */
  }

  const direct = await fetchBinanceSpotKlines(opts);
  if (yearsBack != null && direct.candles.length) {
    await saveOhlcvBrowserCache(sym, opts.interval, yearsBack, {
      candles: direct.candles,
      oldestAvailableMs: direct.oldestAvailableMs ?? null,
      warning: direct.warning,
    });
  }
  return direct;
}
