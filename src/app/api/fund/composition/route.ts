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
import { safeUrl } from "@/lib/server/safeFetch";

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
  /** Новое поле фонда (после миграции на transactions-ledger):
   *  "ledger" — веса вычислены из qty × current price (live AUM-weighted),
   *  "operator" — старая статичная операторская раскладка.
   */
  source?: string | null;
  /** Символы из ledger'а, для которых price-feed не смог получить цену. */
  missingPriceSymbols?: string[];
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
    source: string | null;
    missingPriceSymbols: string[];
  };
  expiresAt: number;
}

// TTL уменьшен 60s → 30s после того как фонд начал отдавать ledger-derived
// composition: composition фонда теперь меняется при каждом trade'е оператора
// (а не только при ручном save), и хочется чтобы research-tool видел свежие
// веса в течение полминуты после сделки.
const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: CachedPayload | null = null;

export async function GET(): Promise<NextResponse> {
  const fundUrlRaw = process.env.PIFAGOR_FUND_API_URL?.trim() ?? "";
  if (!fundUrlRaw) {
    return NextResponse.json(
      {
        error:
          "PIFAGOR_FUND_API_URL не задан. Установите env var с base URL фонда (например, https://pifagor.fund).",
      },
      { status: 503 },
    );
  }

  // SECURITY: SSRF guard. Если env-var указывает на private/loopback/link-local
  // (типа http://169.254.169.254 — AWS metadata, http://127.0.0.1:6379 — Redis,
  // http://10.0.0.5/admin — internal LAN service) — откажемся стучаться. Это
  // защищает от misconfig + от инсайдера который может set env.
  const validated = safeUrl(fundUrlRaw);
  if (!validated) {
    if (typeof console !== "undefined") {
      console.warn(
        `[fund/composition] PIFAGOR_FUND_API_URL rejected by SSRF guard: ${fundUrlRaw}`,
      );
    }
    return NextResponse.json(
      { error: "PIFAGOR_FUND_API_URL invalid (must be https URL to non-private host)" },
      { status: 503 },
    );
  }
  const fundUrl = validated.toString().replace(/\/+$/, "");

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
    // SECURITY: не утекаем status text — может содержать internal trace ID.
    if (typeof console !== "undefined") {
      console.warn(`[fund/composition] upstream ${res.status} ${res.statusText}`);
    }
    return NextResponse.json(
      { error: `Fund upstream unavailable (${res.status})` },
      { status: 502 },
    );
  }

  let json: FundPublicResponse;
  try {
    json = (await res.json()) as FundPublicResponse;
  } catch {
    return NextResponse.json(
      { error: "Fund upstream returned invalid JSON" },
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
    // Прокидываем новые поля фонда. Если фонд старой версии (без них) — null/[].
    source: typeof json?.source === "string" ? json.source : null,
    missingPriceSymbols: Array.isArray(json?.missingPriceSymbols)
      ? json.missingPriceSymbols.filter((s): s is string => typeof s === "string")
      : [],
  };
  cache = { body, expiresAt: Date.now() + TTL_MS };
  return NextResponse.json(body);
}

function joinUrl(base: string, rel: string): string {
  return base.replace(/\/+$/, "") + (rel.startsWith("/") ? rel : `/${rel}`);
}
