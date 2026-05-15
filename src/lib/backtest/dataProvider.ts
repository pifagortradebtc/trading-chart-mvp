/**
 * Загрузка OHLCV с Binance / из CSV / локальный кеш (IndexedDB).
 */

import type { Candle } from "@/types/candle";
import type { FetchProgress } from "./types";
import {
  binanceIntervalToMs,
  binanceRowToCandle,
  filterCandlesToRange,
  mergeCandlesSorted,
  ohlcvCacheNeedsExtension,
  trimCandlesOlderThan,
} from "./ohlcvUtils";

export type OhlcvLoadSource = "idb" | "server-disk" | "server-binance" | "binance";

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
/** Полная серия из IndexedDB (без подрезки окна) — для инкрементальной докачки. */
export async function readStableBrowserCacheRow(
  symbol: string,
  interval: string,
  yearsBack: number,
): Promise<StableCacheRow | null> {
  const key = stableBrowserCacheKey(symbol, interval, yearsBack);
  const row = await idbGet<StableCacheRow>(key);
  if (!row?.candles?.length) return null;
  return row;
}

export async function tryLoadOhlcvBrowserCache(
  symbol: string,
  interval: string,
  yearsBack: number,
  startMs: number,
  endMs: number,
): Promise<{ candles: Candle[]; oldestAvailableMs: number | null; warning?: string } | null> {
  const row = await readStableBrowserCacheRow(symbol, interval, yearsBack);
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
 * Скачать окно [startMs, endMs] с Binance (назад по страницам), без IndexedDB.
 */
async function downloadBinanceWindow(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  const { symbol, interval, startMs, endMs, onProgress } = opts;
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

  return {
    candles,
    oldestAvailableMs: oldestInBatch,
    warning,
  };
}

/** Докачка «вперёд» от startMs до endMs (браузер). */
async function downloadBinanceForward(opts: LoadOptions): Promise<Candle[]> {
  const { symbol, interval, startMs, endMs, onProgress } = opts;
  const sym = symbol.replace("/", "");
  const out: Candle[] = [];
  let cursor = startMs;
  let guard = 500;

  while (guard-- > 0 && cursor <= endMs) {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", sym);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", String(cursor));
    url.searchParams.set("endTime", String(endMs));
    url.searchParams.set("limit", "1000");

    const res = await fetch(url.toString());
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Binance ${res.status}: ${txt}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;

    for (const row of raw) {
      const c = binanceRowToCandle(row);
      if (c.time * 1000 <= endMs) out.push(c);
    }

    onProgress?.({
      loadedBars: out.length,
      phase: "network",
      message: `Binance: догрузка ${out.length}…`,
    });

    const lastOpen = raw[raw.length - 1]![0] as number;
    if (lastOpen >= endMs || raw.length < 1000) break;
    cursor = lastOpen + 1;
  }

  return mergeCandlesSorted([], out);
}

/**
 * Дополнить кеш из Binance в браузере (пробелы назад / вперёд относительно уже имеющихся свечей).
 */
async function extendCachedFromBinanceClient(
  mergedIn: Candle[],
  opts: LoadOptions & { yearsBack: number },
): Promise<{ candles: Candle[]; oldestAvailableMs: number | null; warning?: string }> {
  const { startMs, endMs, interval, yearsBack, onProgress } = opts;
  const iv = binanceIntervalToMs(interval);
  let merged = trimCandlesOlderThan(mergedIn, endMs, yearsBack, iv);
  merged = mergeCandlesSorted([], merged);

  if (!merged.length) {
    return downloadBinanceWindow(opts);
  }

  const firstMs = merged[0]!.time * 1000;

  if (firstMs > startMs + iv) {
    onProgress?.({
      loadedBars: merged.length,
      phase: "network",
      message: "Binance: догрузка истории…",
    });
    const back = await downloadBinanceWindow({
      ...opts,
      startMs,
      endMs: Math.min(endMs, firstMs - 1),
    });
    merged = mergeCandlesSorted(merged, back.candles);
  }

  merged = mergeCandlesSorted([], merged);
  const lastAfter = merged[merged.length - 1]!.time * 1000;

  if (lastAfter < endMs - iv) {
    const fwd = await downloadBinanceForward({
      ...opts,
      startMs: Math.max(startMs, lastAfter + 1),
      endMs,
    });
    merged = mergeCandlesSorted(merged, fwd);
  }

  merged = trimCandlesOlderThan(merged, endMs, yearsBack, iv);
  merged = mergeCandlesSorted([], merged);

  let warning: string | undefined;
  if (merged.length && merged[0]!.time * 1000 > startMs + 60_000) {
    warning = `Биржа отдала данные только с ${new Date(merged[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
  }

  return {
    candles: merged,
    oldestAvailableMs: merged.length ? merged[0]!.time * 1000 : null,
    warning,
  };
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

  const { candles, oldestAvailableMs, warning } = await downloadBinanceWindow(opts);

  await idbSet(key, {
    candles,
    oldestMs: oldestAvailableMs,
  });

  onProgress?.({ loadedBars: candles.length, phase: "done", message: "Готово" });

  return {
    candles,
    oldestAvailableMs,
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
  source: "server-disk" | "server-binance";
} | null> {
  if (typeof window === "undefined") return null;
  if (process.env.NEXT_PUBLIC_SERVER_DISK_CACHE === "0") return null;

  const params = new URLSearchParams({
    symbol: opts.symbol.replace("/", ""),
    interval: opts.interval,
    startMs: String(opts.startMs),
    endMs: String(opts.endMs),
  });
  if (opts.yearsBack != null) {
    params.set("yearsBack", String(opts.yearsBack));
  }

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
    source: data.source === "disk" ? "server-disk" : "server-binance",
  };
}

/** Унифицированная загрузка: стабильный IndexedDB → серверный диск (v2, инкремент) → Binance REST; после успеха — слияние в v2-кеш. */
export async function loadOhlcvBinance(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
  source: OhlcvLoadSource;
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
  const iv = binanceIntervalToMs(opts.interval);

  if (!forceRefresh && useCache && yearsBack != null) {
    const row = await readStableBrowserCacheRow(sym, opts.interval, yearsBack);
    if (row?.candles?.length) {
      let merged = trimCandlesOlderThan(row.candles, endMs, yearsBack, iv);
      merged = mergeCandlesSorted([], merged);
      if (merged.length) {
        const { needBack, needFwd } = ohlcvCacheNeedsExtension(merged, startMs, endMs, iv);
        if (!needBack && !needFwd) {
          let out = filterCandlesToRange(merged, startMs, endMs);
          if (!out.length) out = merged;
          onProgress?.({
            loadedBars: out.length,
            phase: "cache",
            message: "Из кеша браузера (IndexedDB)",
          });
          onProgress?.({ loadedBars: out.length, phase: "done", message: "Готово" });
          return {
            candles: out,
            oldestAvailableMs: row.oldestAvailableMs ?? null,
            warning: row.warning,
            source: "idb",
          };
        }
      }
    }
  }

  try {
    const fromServer = await loadOhlcvViaServerApi(opts);
    if (fromServer?.candles?.length) {
      if (yearsBack != null) {
        const prevRow = forceRefresh
          ? null
          : await readStableBrowserCacheRow(sym, opts.interval, yearsBack);
        const combined = trimCandlesOlderThan(
          mergeCandlesSorted(prevRow?.candles ?? [], fromServer.candles),
          endMs,
          yearsBack,
          iv,
        );
        await saveOhlcvBrowserCache(sym, opts.interval, yearsBack, {
          candles: combined,
          oldestAvailableMs: fromServer.oldestAvailableMs ?? null,
          warning: fromServer.warning,
        });
      }
      onProgress?.({
        loadedBars: fromServer.candles.length,
        phase: "done",
        message: "Готово",
      });
      return { ...fromServer, source: fromServer.source };
    }
  } catch {
    /** fallback ниже */
  }

  if (!forceRefresh && useCache && yearsBack != null) {
    const row = await readStableBrowserCacheRow(sym, opts.interval, yearsBack);
    if (row?.candles?.length) {
      const extended = await extendCachedFromBinanceClient(row.candles, {
        ...opts,
        yearsBack,
      });
      await saveOhlcvBrowserCache(sym, opts.interval, yearsBack, {
        candles: extended.candles,
        oldestAvailableMs: extended.oldestAvailableMs ?? null,
        warning: extended.warning,
      });
      const trimmed = filterCandlesToRange(extended.candles, startMs, endMs);
      onProgress?.({
        loadedBars: trimmed.length,
        phase: "done",
        message: "Готово",
      });
      return {
        candles: trimmed.length ? trimmed : extended.candles,
        oldestAvailableMs: extended.oldestAvailableMs ?? null,
        warning: extended.warning,
        source: "binance",
      };
    }
  }

  const direct = await fetchBinanceSpotKlines(opts);
  if (yearsBack != null && direct.candles.length) {
    const prevRow = forceRefresh ? null : await readStableBrowserCacheRow(sym, opts.interval, yearsBack);
    const combined = trimCandlesOlderThan(
      mergeCandlesSorted(prevRow?.candles ?? [], direct.candles),
      endMs,
      yearsBack,
      iv,
    );
    await saveOhlcvBrowserCache(sym, opts.interval, yearsBack, {
      candles: combined,
      oldestAvailableMs: direct.oldestAvailableMs ?? null,
      warning: direct.warning,
    });
  }
  return { ...direct, source: "binance" as const };
}
