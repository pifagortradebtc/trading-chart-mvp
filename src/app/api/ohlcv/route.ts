import path from "path";
import { NextResponse } from "next/server";
import type { Candle } from "@/types/candle";
import {
  fetchBinanceKlinesForward,
  fetchBinanceKlinesServer,
} from "@/lib/server/binanceKlines";
import {
  binanceIntervalToMs,
  filterCandlesToRange,
  mergeCandlesSorted,
  trimCandlesOlderThan,
} from "@/lib/backtest/ohlcvUtils";
import {
  ohlcvDir,
  readJsonFile,
  safeOhlcvFileId,
  stableOhlcvFileName,
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

interface CachePayloadV1 {
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

interface CachePayloadV2 {
  version: 2;
  symbol: string;
  interval: string;
  yearsBack: number;
  candles: Candle[];
  oldestAvailableMs: number | null;
  warning?: string;
  cachedAt: string;
}

/** GET /api/ohlcv?symbol=ETHUSDT&interval=15m&startMs=&endMs=&yearsBack=8 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase() ?? "";
  const interval = url.searchParams.get("interval") ?? "";
  const startMs = Number(url.searchParams.get("startMs"));
  const endMs = Number(url.searchParams.get("endMs"));
  const yearsBackRaw = url.searchParams.get("yearsBack");
  const hasYearsBack = yearsBackRaw != null && yearsBackRaw !== "";
  const yearsBack = hasYearsBack ? Number(yearsBackRaw) : NaN;

  if (!validSymbol(symbol)) {
    return NextResponse.json({ error: "Некорректный symbol" }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Некорректный interval" }, { status: 400 });
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return NextResponse.json({ error: "Некорректный диапазон времени" }, { status: 400 });
  }

  if (hasYearsBack) {
    if (!Number.isInteger(yearsBack) || yearsBack < 1 || yearsBack > 12) {
      return NextResponse.json({ error: "yearsBack: целое число 1…12" }, { status: 400 });
    }
  }

  const maxSpanMs = 12 * 365.25 * 24 * 3600 * 1000;
  if (endMs - startMs > maxSpanMs) {
    return NextResponse.json({ error: "Слишком большой период (>12 лет)" }, { status: 400 });
  }

  /** Легаси: каждый запрос со своим хешем — только для вызовов без yearsBack (оверлей графика и т.п.). */
  if (!hasYearsBack) {
    return handleLegacyV1(symbol, interval, startMs, endMs);
  }

  return handleStableV2(symbol, interval, startMs, endMs, yearsBack);
}

async function handleLegacyV1(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<NextResponse> {
  const fileName = safeOhlcvFileId(symbol, interval, startMs, endMs);
  const cachePath = path.join(ohlcvDir(), fileName);

  const fromDisk = await readJsonFile<CachePayloadV1>(cachePath);
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

    const payload: CachePayloadV1 = {
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

async function handleStableV2(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
  yearsBack: number,
): Promise<NextResponse> {
  const iv = binanceIntervalToMs(interval);
  const fileName = stableOhlcvFileName(symbol, interval, yearsBack);
  const cachePath = path.join(ohlcvDir(), fileName);

  let merged: Candle[] = [];
  let touchedBinance = false;
  let oldestAvailableMs: number | null = null;
  let warning: string | undefined;

  const fromDisk = await readJsonFile<CachePayloadV2>(cachePath);
  if (fromDisk?.version === 2 && Array.isArray(fromDisk.candles)) {
    merged = trimCandlesOlderThan(fromDisk.candles, endMs, yearsBack, iv);
  }

  if (!merged.length) {
    touchedBinance = true;
    const r = await fetchBinanceKlinesServer({
      symbol,
      interval,
      startMs,
      endMs,
      onChunk: undefined,
    });
    merged = r.candles;
    oldestAvailableMs = r.oldestAvailableMs ?? null;
    warning = r.warning;
  } else {
    merged = mergeCandlesSorted([], merged);
    const firstMs = merged[0]!.time * 1000;

    if (firstMs > startMs + iv) {
      touchedBinance = true;
      const back = await fetchBinanceKlinesServer({
        symbol,
        interval,
        startMs,
        endMs: Math.min(endMs, firstMs - 1),
      });
      merged = mergeCandlesSorted(merged, back.candles);
      if (oldestAvailableMs == null && back.oldestAvailableMs != null) {
        oldestAvailableMs = back.oldestAvailableMs;
      }
    }

    merged = mergeCandlesSorted([], merged);
    const lastAfter = merged[merged.length - 1]!.time * 1000;

    if (lastAfter < endMs - iv) {
      touchedBinance = true;
      const fwd = await fetchBinanceKlinesForward({
        symbol,
        interval,
        startMs: Math.max(startMs, lastAfter + 1),
        endMs,
      });
      merged = mergeCandlesSorted(merged, fwd);
    }

    merged = trimCandlesOlderThan(merged, endMs, yearsBack, iv);
    merged = mergeCandlesSorted([], merged);

    if (!oldestAvailableMs && merged.length) {
      oldestAvailableMs = merged[0]!.time * 1000;
    }

    if (merged.length && merged[0]!.time * 1000 > startMs + 60_000) {
      warning = `Биржа отдала данные только с ${new Date(merged[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
    }
  }

  const trimmed = filterCandlesToRange(merged, startMs, endMs);

  const payload: CachePayloadV2 = {
    version: 2,
    symbol,
    interval,
    yearsBack,
    candles: merged,
    oldestAvailableMs,
    warning,
    cachedAt: new Date().toISOString(),
  };

  try {
    await writeJsonFile(cachePath, payload);
  } catch (e) {
    console.error("persistent ohlcv v2 write failed", e);
  }

  return NextResponse.json({
    source: touchedBinance ? "binance" : "disk",
    symbol,
    interval,
    startMs,
    endMs,
    candles: trimmed,
    oldestAvailableMs,
    warning,
    cachedAt: payload.cachedAt,
  });
}
