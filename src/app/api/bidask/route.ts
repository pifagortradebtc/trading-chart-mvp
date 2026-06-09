/**
 * `/api/bidask` — proxy + server-side cache к Pifagor depth-API на VPS klod.
 *
 * Используется backtest-стратегиями `buyforce_dca` / `sellforce_dca` для
 * вычисления RO (Relative Offset) индикаторов:
 *   BuyForce  RO = (bid_3 − ask_8) / ask_1.5
 *   SellForce RO = (ask_3 − bid_8) / bid_1.5
 *
 * Upstream: `https://pifagor.153.80.192.107.nip.io/api/v1/bidask`
 * (Caddy → FastAPI → SQLite difference_snapshots на VPS).
 *
 * Архитектура полностью аналогична `/api/ohlcv`: stable v1 файлы на диске
 * с ключом `v1_SYMBOL_INTERVAL_y${yearsBack}.json`, инкрементальный merge
 * при последующих запросах.
 *
 * GET-параметры:
 *   symbol     — e.g. BTCUSDT (uppercase, 4–32 alphanum)
 *   interval   — "1m" | "5m" | "15m" | "1h" | "1d"  (allowlist под BuyForce/SellForce)
 *   startMs    — unix ms, целое
 *   endMs      — unix ms, целое (endMs > startMs)
 *   yearsBack  — 1..12 для stable кеша
 *
 * Ответ:
 *   {
 *     source: "disk" | "vps",
 *     symbol, interval,
 *     bars: DepthBar[],                  // sorted by t ASC
 *     oldestAvailableMs: number | null,
 *     warning?: string,
 *     cachedAt: string                   // ISO
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";

import type { DepthBar } from "@/lib/backtest/depthTypes";
import {
  bidaskDir,
  ensureDir,
  readJsonFile,
  stableBidaskFileName,
  writeJsonFile,
} from "@/lib/server/persistentStore";
import { safeUrl } from "@/lib/server/safeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Типы ─────────────────────────────────────────────────────────────────────
// DepthBar определён в @/lib/backtest/depthTypes — этот route только маппит
// upstream VPS response в этот формат.

interface VpsBarRaw {
  t: number;
  bid_1_5?: number;
  bid_3?: number;
  bid_8?: number;
  ask_1_5?: number;
  ask_3?: number;
  ask_8?: number;
  // VPS также возвращает 5/15/30/60 + diff_*, но они нам не нужны
  [k: string]: unknown;
}

interface VpsResponse {
  exchange?: string;
  coin_type?: string;
  symbol?: string;
  resolution?: string;
  bucket_seconds?: number;
  depths?: number[];
  n_bars?: number;
  bars: VpsBarRaw[];
}

interface CachePayloadV1 {
  version: 1;
  symbol: string;
  interval: string;
  yearsBack: number;
  bars: DepthBar[]; // sorted ASC, deduped by t
  oldestAvailableMs: number | null;
  warning?: string;
  updatedAt: string; // ISO
}

// ─── Конфиг ──────────────────────────────────────────────────────────────────

// SECURITY: в проде требуем явный env-var. Раньше дефолтился на хардкоженный
// IP (`pifagor.153.80.192.107.nip.io`) — это: (a) раскрывало origin за CDN
// и (b) обходило бы CDN/WAF когда они появятся. Локалка может использовать
// IP-фоллбек для удобства.
const VPS_BASE_RAW =
  process.env.PIFAGOR_VPS_BASE?.trim() ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "https://pifagor.153.80.192.107.nip.io");

// SECURITY: SSRF guard — отсекает приватные/loopback URL из env. Защищает
// от misconfig (PIFAGOR_VPS_BASE = http://localhost:6379 или http://169.254.169.254).
const VPS_URL = VPS_BASE_RAW ? safeUrl(VPS_BASE_RAW) : null;
const VPS_BASE = VPS_URL ? VPS_URL.toString().replace(/\/+$/, "") : "";

const VPS_TIMEOUT_MS = 30_000;

/**
 * Мэппинг наших frontend-интервалов на Pifagor VPS `resolution` query-param.
 * VPS API ожидает значение в МИНУТАХ как число-строку (TV UDF convention),
 * либо специальные TV-метки «D» / «W» для дневных/недельных.
 *   1m  → "1"
 *   5m  → "5"
 *   15m → "15"
 *   1h  → "60"
 *   1d  → "D" (стандартная TV-нотация для daily bucket)
 */
const INTERVAL_TO_VPS_RESOLUTION: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "1d": "D",
};

/** Длительность одного бара в миллисекундах (для пробельного контроля). */
const INTERVAL_TO_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

// ─── Валидация ────────────────────────────────────────────────────────────────

const SYMBOL_RE = /^[A-Z0-9]{4,32}$/;

function parseSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

function parseInterval(raw: string | null): string | null {
  if (!raw) return null;
  return raw in INTERVAL_TO_VPS_RESOLUTION ? raw : null;
}

function parseIntMs(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseYearsBack(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 12)
    return null;
  return n;
}

// ─── Маппинг VPS bar → DepthBar ───────────────────────────────────────────────

function mapVpsBar(b: VpsBarRaw): DepthBar | null {
  // Все 6 полей обязательны: без любого RO не считается, бар бесполезен.
  const need: (keyof DepthBar)[] = [
    "bid_1_5",
    "bid_3",
    "bid_8",
    "ask_1_5",
    "ask_3",
    "ask_8",
  ];
  for (const k of need) {
    const v = b[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  }
  if (typeof b.t !== "number" || !Number.isFinite(b.t)) return null;
  return {
    t: Math.floor(b.t),
    bid_1_5: b.bid_1_5 as number,
    bid_3: b.bid_3 as number,
    bid_8: b.bid_8 as number,
    ask_1_5: b.ask_1_5 as number,
    ask_3: b.ask_3 as number,
    ask_8: b.ask_8 as number,
  };
}

// ─── Fetch к VPS ──────────────────────────────────────────────────────────────

async function fetchFromVps(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<{ bars: DepthBar[]; warning?: string }> {
  // SECURITY: fail-fast если VPS_BASE отсутствует/rejected SSRF guard'ом —
  // не хотим случайно вызвать relative `/api/v1/bidask` обратно на наш Next.js.
  if (!VPS_BASE) {
    throw new Error(
      "bidask: PIFAGOR_VPS_BASE env-var not set (или rejected SSRF guard'ом)",
    );
  }
  const resolution = INTERVAL_TO_VPS_RESOLUTION[interval];
  const fromSec = Math.floor(startMs / 1000);
  const toSec = Math.ceil(endMs / 1000);

  const url = new URL(`${VPS_BASE}/api/v1/bidask`);
  url.searchParams.set("coin_type", "COIN");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("exchange", "binance");
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(fromSec));
  url.searchParams.set("to", String(toSec));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VPS_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(
      `bidask: fetch to VPS failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    // SECURITY: не утекаем upstream body в response — может содержать internal
    // паттерны (path, log fragments). Логируем серверно, клиенту отдаём
    // sanitized version.
    const body = await resp.text().catch(() => "");
    if (typeof console !== "undefined") {
      console.warn(`[bidask] VPS ${resp.status} ${resp.statusText}: ${body.slice(0, 500)}`);
    }
    throw new Error(`bidask: VPS upstream unavailable (${resp.status})`);
  }

  let data: VpsResponse;
  try {
    data = (await resp.json()) as VpsResponse;
  } catch {
    throw new Error("bidask: VPS returned invalid JSON");
  }

  if (!Array.isArray(data.bars)) {
    throw new Error("bidask: VPS response missing 'bars' array");
  }

  const out: DepthBar[] = [];
  let dropped = 0;
  for (const raw of data.bars) {
    const mapped = mapVpsBar(raw);
    if (mapped) out.push(mapped);
    else dropped++;
  }

  // Сортируем по t ASC (VPS обычно сам сортирует, но не полагаемся).
  out.sort((a, b) => a.t - b.t);
  // Дедуп по t (могут быть дубли на границе бара).
  const deduped: DepthBar[] = [];
  let prevT = -1;
  for (const bar of out) {
    if (bar.t === prevT) continue;
    deduped.push(bar);
    prevT = bar.t;
  }

  const warning =
    dropped > 0
      ? `bidask: dropped ${dropped} bars with incomplete depth (need bid_1_5, bid_3, bid_8, ask_1_5, ask_3, ask_8)`
      : undefined;

  return { bars: deduped, warning };
}

// ─── Merge / trim helpers ─────────────────────────────────────────────────────

function mergeBarsSorted(prev: DepthBar[], next: DepthBar[]): DepthBar[] {
  if (!prev.length) return next;
  if (!next.length) return prev;
  const byT = new Map<number, DepthBar>();
  for (const b of prev) byT.set(b.t, b);
  for (const b of next) byT.set(b.t, b); // new overrides
  const arr = Array.from(byT.values());
  arr.sort((a, b) => a.t - b.t);
  return arr;
}

function trimOlderThan(bars: DepthBar[], cutoffSec: number): DepthBar[] {
  const idx = bars.findIndex((b) => b.t >= cutoffSec);
  return idx <= 0 ? bars : bars.slice(idx);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const symbol = parseSymbol(sp.get("symbol"));
  const interval = parseInterval(sp.get("interval"));
  const startMs = parseIntMs(sp.get("startMs"));
  const endMs = parseIntMs(sp.get("endMs"));
  const yearsBack = parseYearsBack(sp.get("yearsBack"));

  if (!symbol) {
    return NextResponse.json(
      { error: "Invalid or missing 'symbol' (4-32 alphanum chars)" },
      { status: 400 },
    );
  }
  if (!interval) {
    return NextResponse.json(
      {
        error: `Invalid or missing 'interval'. Supported: ${Object.keys(INTERVAL_TO_VPS_RESOLUTION).join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (!startMs || !endMs) {
    return NextResponse.json(
      { error: "Both 'startMs' and 'endMs' required (positive integers)" },
      { status: 400 },
    );
  }
  if (endMs <= startMs) {
    return NextResponse.json(
      { error: "'endMs' must be greater than 'startMs'" },
      { status: 400 },
    );
  }
  if (!yearsBack) {
    return NextResponse.json(
      { error: "Invalid or missing 'yearsBack' (1..12)" },
      { status: 400 },
    );
  }

  const cutoffSec = Math.floor(
    (Date.now() - yearsBack * 365 * 24 * 3600 * 1000) / 1000,
  );

  // ─── Кеш на диске ──
  await ensureDir(bidaskDir());
  const cachePath = path.join(
    bidaskDir(),
    stableBidaskFileName(symbol, interval, yearsBack),
  );

  let cached = await readJsonFile<CachePayloadV1>(cachePath);
  if (cached && cached.version !== 1) cached = null;

  let bars: DepthBar[] = cached?.bars ? [...cached.bars] : [];
  bars = trimOlderThan(bars, cutoffSec);

  // Решаем — нужно ли идти к VPS:
  //  - кеш пуст,
  //  - или запрошен endMs позже последнего бара в кеше + 1 интервал,
  //  - или запрошен startMs раньше первого бара (запрашиваем расширение влево).
  const intervalMs = INTERVAL_TO_MS[interval];
  const lastBarMs = bars.length ? bars[bars.length - 1].t * 1000 : 0;
  const firstBarMs = bars.length ? bars[0].t * 1000 : Number.POSITIVE_INFINITY;

  const needRight = endMs > lastBarMs + intervalMs;
  const needLeft = startMs < firstBarMs;
  const isEmpty = bars.length === 0;

  let warning: string | undefined = cached?.warning;
  let source: "disk" | "vps" = "disk";

  if (isEmpty || needRight || needLeft) {
    source = "vps";
    // Запрашиваем у VPS объединение всех нужных окон одним запросом
    // (VPS дешёвый — SQLite query, лучше один большой запрос чем два маленьких).
    const fetchFromMs = needLeft ? startMs : lastBarMs + 1;
    const fetchToMs = endMs;
    if (fetchToMs > fetchFromMs) {
      try {
        const res = await fetchFromVps(
          symbol,
          interval,
          isEmpty || needLeft ? startMs : fetchFromMs,
          fetchToMs,
        );
        bars = mergeBarsSorted(bars, res.bars);
        bars = trimOlderThan(bars, cutoffSec);
        if (res.warning) warning = res.warning;
      } catch (e) {
        // Если VPS недоступен но в кеше что-то есть — отдаём что есть с warning.
        if (bars.length === 0) {
          return NextResponse.json(
            {
              error: `bidask: VPS unreachable and no cached data: ${e instanceof Error ? e.message : String(e)}`,
            },
            { status: 502 },
          );
        }
        warning = `bidask: VPS unreachable, served stale cache: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  // ─── Сохраняем merged кеш ──
  const oldestAvailableMs = bars.length ? bars[0].t * 1000 : null;
  const payload: CachePayloadV1 = {
    version: 1,
    symbol,
    interval,
    yearsBack,
    bars,
    oldestAvailableMs,
    warning,
    updatedAt: new Date().toISOString(),
  };
  // Async fire-and-forget (не блокируем response).
  writeJsonFile(cachePath, payload).catch((e) => {
    console.warn("bidask: failed to write cache", e);
  });

  return NextResponse.json({
    source,
    symbol,
    interval,
    bars,
    oldestAvailableMs,
    warning,
    cachedAt: payload.updatedAt,
  });
}
