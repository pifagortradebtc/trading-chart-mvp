import path from "path";
import { NextResponse } from "next/server";
import type { Candle } from "@/types/candle";
import {
  fetchBinanceKlinesForward,
  fetchBinanceKlinesServer,
} from "@/lib/server/binanceKlines";
import {
  fetchOkxKlinesServer,
  fetchOkxKlinesForward,
} from "@/lib/server/okxKlines";
import {
  fetchBybitKlinesServer,
  fetchBybitKlinesForward,
} from "@/lib/server/bybitKlines";
import { fetchCoinGeckoDailyServer } from "@/lib/server/coingeckoHistory";
import {
  pickOhlcvSource,
  sourceFilenamePrefix,
  type OhlcvSource,
} from "@/lib/server/ohlcvSource";
import {
  binanceIntervalToMs,
  filterCandlesToRange,
  mergeCandlesSorted,
  ohlcvCacheNeedsExtension,
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

/** GET /api/ohlcv?symbol=ETHUSDT&interval=15m&startMs=&endMs=&yearsBack=8&force=1 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.toUpperCase() ?? "";
  const interval = url.searchParams.get("interval") ?? "";
  const startMs = Number(url.searchParams.get("startMs"));
  const endMs = Number(url.searchParams.get("endMs"));
  const yearsBackRaw = url.searchParams.get("yearsBack");
  const hasYearsBack = yearsBackRaw != null && yearsBackRaw !== "";
  const yearsBack = hasYearsBack ? Number(yearsBackRaw) : NaN;
  /** `force=1` — игнорировать серверный disk-cache и перетянуть с биржи. */
  const force = url.searchParams.get("force") === "1";

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

  const { source, note } = pickOhlcvSource(symbol);
  return handleStableV2(symbol, interval, startMs, endMs, yearsBack, source, note, force);
}

/** Похоже на «нет такого тикера на бирже» — Binance/OKX/Bybit отдают похожие тексты ошибок. */
function looksLikeUnknownSymbolError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("invalid symbol") ||
    msg.includes("instrument") ||
    msg.includes("symbol does not exist") ||
    msg.includes("not found") ||
    msg.includes("400") ||
    msg.includes("404")
  );
}

async function fetchSingleSource(
  source: OhlcvSource,
  opts: { symbol: string; interval: string; startMs: number; endMs: number },
): Promise<{ candles: Candle[]; oldestAvailableMs: number | null; warning?: string }> {
  if (source === "okx") return fetchOkxKlinesServer(opts);
  if (source === "bybit") return fetchBybitKlinesServer(opts);
  if (source === "coingecko") {
    if (opts.interval !== "1d") {
      throw new Error("CoinGecko-источник поддерживает только daily (interval=1d).");
    }
    return fetchCoinGeckoDailyServer({
      symbol: opts.symbol,
      startMs: opts.startMs,
      endMs: opts.endMs,
    });
  }
  return fetchBinanceKlinesServer(opts);
}

/**
 * Адаптер «один интерфейс для всех источников» с auto-fallback.
 *
 * Если source === "binance" (дефолт для незарегистрированных тикеров) и Binance
 * вернул «invalid symbol» — пробуем по очереди bybit, okx, coingecko. Это
 * страховка для тикеров вроде HYPER, которые могут листоваться на альтернативных
 * биржах быстрее чем мы добавим их в OVERRIDES вручную.
 *
 * Для явных OVERRIDES (HYPE→bybit, OKB→okx и т.д.) fallback НЕ применяется —
 * если назначенная биржа не отдала данные, это реальная ошибка для логов.
 */
async function fetchFromSource(
  source: OhlcvSource,
  opts: { symbol: string; interval: string; startMs: number; endMs: number },
): Promise<{ candles: Candle[]; oldestAvailableMs: number | null; warning?: string }> {
  try {
    return await fetchSingleSource(source, opts);
  } catch (primaryErr) {
    /** Auto-fallback только для дефолтного binance — для явных overrides не делаем. */
    if (source !== "binance" || !looksLikeUnknownSymbolError(primaryErr)) throw primaryErr;
    const chain: OhlcvSource[] = ["bybit", "okx"];
    if (opts.interval === "1d") chain.push("coingecko");
    for (const alt of chain) {
      try {
        const res = await fetchSingleSource(alt, opts);
        if (res.candles.length > 0) {
          return {
            ...res,
            warning:
              (res.warning ? `${res.warning} ` : "") +
              `Binance не знает ${opts.symbol} — данные взяты с ${alt} (auto-fallback). ` +
              `Добавь в OVERRIDES в ohlcvSource.ts чтобы избежать round-trip.`,
          };
        }
      } catch {
        /** этот источник тоже не знает — пробуем следующий */
      }
    }
    throw primaryErr;
  }
}

async function fetchSingleForwardFromSource(
  source: OhlcvSource,
  opts: { symbol: string; interval: string; startMs: number; endMs: number },
): Promise<Candle[]> {
  if (source === "okx") return fetchOkxKlinesForward(opts);
  if (source === "bybit") return fetchBybitKlinesForward(opts);
  if (source === "coingecko") {
    // CoinGecko returns full daily history in one call — re-fetch and let
    // mergeCandlesSorted dedupe with existing cache.
    const r = await fetchCoinGeckoDailyServer({
      symbol: opts.symbol,
      startMs: opts.startMs,
      endMs: opts.endMs,
    });
    return r.candles;
  }
  return fetchBinanceKlinesForward(opts);
}

async function fetchForwardFromSource(
  source: OhlcvSource,
  opts: { symbol: string; interval: string; startMs: number; endMs: number },
): Promise<Candle[]> {
  try {
    return await fetchSingleForwardFromSource(source, opts);
  } catch (primaryErr) {
    if (source !== "binance" || !looksLikeUnknownSymbolError(primaryErr)) throw primaryErr;
    const chain: OhlcvSource[] = ["bybit", "okx"];
    if (opts.interval === "1d") chain.push("coingecko");
    for (const alt of chain) {
      try {
        const out = await fetchSingleForwardFromSource(alt, opts);
        if (out.length > 0) return out;
      } catch {
        /** этот источник не знает — пробуем следующий */
      }
    }
    throw primaryErr;
  }
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
    /** Используем общий dispatcher с auto-fallback (Binance → Bybit → OKX → CoinGecko). */
    const { source: routedSource } = pickOhlcvSource(symbol);
    const { candles, oldestAvailableMs, warning } = await fetchFromSource(routedSource, {
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
  source: OhlcvSource,
  sourceNote: string | undefined,
  /** force=1 → игнорируем disk-cache, тянем с биржи свежий ряд. */
  force: boolean = false,
): Promise<NextResponse> {
  const iv = binanceIntervalToMs(interval);
  const fileName = stableOhlcvFileName(
    symbol,
    interval,
    yearsBack,
    sourceFilenamePrefix(source),
  );
  const cachePath = path.join(ohlcvDir(), fileName);

  let merged: Candle[] = [];
  let touchedRemote = false;
  let oldestAvailableMs: number | null = null;
  let warning: string | undefined;

  /**
   * При force=true НЕ читаем disk-cache — это нужно когда юзер чувствует что
   * данные устарели (Полная перезагрузка в UI). Без force сервер мог отдать
   * cached ответ если gap до endMs меньше fwd-tolerance, и фронт получит
   * старые свечи даже после очистки своего IndexedDB.
   */
  if (!force) {
    const fromDisk = await readJsonFile<CachePayloadV2>(cachePath);
    if (fromDisk?.version === 2 && Array.isArray(fromDisk.candles)) {
      merged = trimCandlesOlderThan(fromDisk.candles, endMs, yearsBack, iv);
    }
  }

  if (!merged.length) {
    touchedRemote = true;
    const r = await fetchFromSource(source, { symbol, interval, startMs, endMs });
    merged = r.candles;
    oldestAvailableMs = r.oldestAvailableMs ?? null;
    warning = r.warning;
  } else {
    merged = mergeCandlesSorted([], merged);
    const { needBack, needFwd } = ohlcvCacheNeedsExtension(merged, startMs, endMs, iv);

    if (needBack) {
      touchedRemote = true;
      const firstMs = merged[0]!.time * 1000;
      const back = await fetchFromSource(source, {
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

    if (needFwd) {
      touchedRemote = true;
      const lastAfter = merged[merged.length - 1]!.time * 1000;
      const fwd = await fetchForwardFromSource(source, {
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
      warning = `${sourceLabel(source)} отдал данные только с ${new Date(merged[0]!.time * 1000).toISOString().slice(0, 10)}; запрошенный период начинался раньше.`;
    }
  }

  // Surface the routing reason to the operator (e.g. "OKB живёт на OKX").
  if (sourceNote && !warning) warning = sourceNote;

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
    source: touchedRemote ? source : "disk",
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

function sourceLabel(s: OhlcvSource): string {
  if (s === "okx") return "OKX";
  if (s === "bybit") return "Bybit";
  if (s === "coingecko") return "CoinGecko";
  return "Биржа";
}
