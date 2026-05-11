/**
 * Загрузка OHLCV с Binance / из CSV / локальный кеш (IndexedDB).
 */

import type { Candle } from "@/types/candle";
import type { FetchProgress } from "./types";

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
  onProgress?: (p: FetchProgress) => void;
  useCache?: boolean;
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

/** Нормализация Binance kline → Candle (time в секундах). */
export function binanceRowToCandle(row: unknown[]): Candle {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

export function mergeCandlesSorted(a: Candle[], b: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of a) map.set(c.time, c);
  for (const c of b) map.set(c.time, c);
  return Array.from(map.values()).sort((x, y) => x.time - y.time);
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
  const { symbol, interval, startMs, endMs, onProgress, useCache = true } = opts;
  const key = `${cacheKey(symbol, interval)}_${startMs}_${endMs}`;
  if (useCache) {
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

/** Унифицированная загрузка (пока Binance + CSV через вызывающий код). */
export async function loadOhlcvBinance(opts: LoadOptions): Promise<{
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
}> {
  return fetchBinanceSpotKlines(opts);
}
