import path from "path";
import { NextResponse } from "next/server";
import type { Candle } from "@/types/candle";
import { fetchBinanceKlinesServer } from "@/lib/server/binanceKlines";
import {
  ohlcvDir,
  readJsonFile,
  safeOhlcvFileId,
  writeJsonFile,
} from "@/lib/server/persistentStore";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

function validSymbol(s: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(s);
}

interface CachePayload {
  version: 1;
  symbol: string;
  interval: string;
  startMs: number;
  endMs: number;
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
  cachedAt: string;
}

/** GET /api/ohlcv?symbol=ETHUSDT&interval=15m&startMs=&endMs= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase() ?? "";
  const interval = url.searchParams.get("interval") ?? "";
  const startMs = Number(url.searchParams.get("startMs"));
  const endMs = Number(url.searchParams.get("endMs"));

  if (!validSymbol(symbol)) {
    return NextResponse.json({ error: "Некорректный symbol" }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Некорректный interval" }, { status: 400 });
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return NextResponse.json({ error: "Некорректный диапазон времени" }, { status: 400 });
  }

  const maxSpanMs = 12 * 365.25 * 24 * 3600 * 1000;
  if (endMs - startMs > maxSpanMs) {
    return NextResponse.json({ error: "Слишком большой период (>12 лет)" }, { status: 400 });
  }

  const fileName = safeOhlcvFileId(symbol, interval, startMs, endMs);
  const cachePath = path.join(ohlcvDir(), fileName);

  const fromDisk = await readJsonFile<CachePayload>(cachePath);
  if (fromDisk?.version === 1 && fromDisk.candles?.length) {
    return NextResponse.json({
      source: "disk",
      symbol,
      interval,
      startMs,
      endMs,
      candles: fromDisk.candles,
      oldestAvailableMs: fromDisk.oldestAvailableMs ?? null,
      warning: fromDisk.warning,
      cachedAt: fromDisk.cachedAt,
    });
  }

  try {
    const { candles, oldestAvailableMs, warning } = await fetchBinanceKlinesServer({
      symbol,
      interval,
      startMs,
      endMs,
    });

    const payload: CachePayload = {
      version: 1,
      symbol,
      interval,
      startMs,
      endMs,
      candles,
      oldestAvailableMs,
      warning,
      cachedAt: new Date().toISOString(),
    };

    try {
      await writeJsonFile(cachePath, payload);
    } catch (e) {
      console.error("persistent ohlcv write failed", e);
    }

    return NextResponse.json({
      source: "binance",
      symbol,
      interval,
      startMs,
      endMs,
      candles,
      oldestAvailableMs,
      warning,
      cachedAt: payload.cachedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
