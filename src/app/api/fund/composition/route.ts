/**
 * Server-side proxy к Pifagor Fund публичному endpoint'у:
 *   GET ${PIFAGOR_FUND_API_URL}/api/portfolio/public
 *
 * Цель — обойти CORS (research-tool и фонд деплоятся раздельно) и
 * нормализовать shape ответа (фонд может в будущем менять формат —
 * нормализация здесь, а не размазана по UI-блокам).
 *
 * Если env-var `PIFAGOR_FUND_API_URL` не задан — отдаём 503 с message,
 * клиент trackает как «недоступно» и просто скрывает UI-блок. Это
 * корректный back-compat: в локальной разработке фонд может быть не запущен.
 *
 * Кеширование: 60 секунд in-memory. Фонд не меняет composition часто
 * (раз в неделю/месяц), но research дёргается каждый раз когда оператор
 * открывает Recommended Tab — без кеша это ненужная нагрузка на фонд.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface FundPublicItem {
  symbol: string;
  name?: string;
  weight: number;
  category?: string;
}

interface FundPublicResponse {
  items: FundPublicItem[];
  lastChangedAt?: string | null;
}

/**
 * Backend фонда отдаёт `weight` как string ("100", "12.5"), не number —
 * Prisma Decimal обычно сериализуется в JSON именно так. Принудительно
 * приводим к number; non-numeric или отрицательные отфильтровываем.
 */
function coerceWeight(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

interface CachedPayload {
  body: {
    items: FundPublicItem[];
    lastChangedAt: string | null;
    fundUrl: string;
  };
  expiresAt: number;
}

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: CachedPayload | null = null;

export async function GET(): Promise<NextResponse> {
  const fundUrl = process.env.PIFAGOR_FUND_API_URL?.trim() ?? "";
  if (!fundUrl) {
    return NextResponse.json(
      {
        error:
          "PIFAGOR_FUND_API_URL не задан. Установите env var с base URL фонда (например, https://pifagor.fund).",
      },
      { status: 503 },
    );
  }

  // Cache hit
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.body);
  }

  const target = joinUrl(fundUrl, "/api/portfolio/public");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Fund запрос timed out (${FETCH_TIMEOUT_MS}ms)`
          : e.message
        : "Fund fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Fund ${res.status} ${res.statusText}` },
      { status: 502 },
    );
  }

  let json: FundPublicResponse;
  try {
    json = (await res.json()) as FundPublicResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `Fund отдал невалидный JSON: ${e instanceof Error ? e.message : "parse error"}` },
      { status: 502 },
    );
  }

  const items: FundPublicItem[] = Array.isArray(json?.items)
    ? json.items.flatMap((it) => {
        if (!it || typeof it.symbol !== "string") return [];
        const w = coerceWeight(it.weight);
        if (w === null) return [];
        return [
          {
            symbol: it.symbol,
            name: it.name,
            weight: w,
            category: it.category,
          },
        ];
      })
    : [];

  const body = {
    items,
    lastChangedAt: json?.lastChangedAt ?? null,
    fundUrl,
  };
  cache = { body, expiresAt: Date.now() + TTL_MS };
  return NextResponse.json(body);
}

function joinUrl(base: string, rel: string): string {
  return base.replace(/\/+$/, "") + (rel.startsWith("/") ? rel : `/${rel}`);
}
