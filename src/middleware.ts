/**
 * Cookie-session middleware. Защищает все маршруты кроме publicly listed.
 *
 * Поведение:
 *   - `RESEARCH_PASSWORD` пустой:
 *       • в проде (NODE_ENV === "production") → 503 «Auth misconfigured»
 *         (FAIL-CLOSED — раньше был fail-OPEN, security finding)
 *       • в dev → пропускает всё (удобство локальной разработки)
 *   - Маршрут в PUBLIC_EXACT → пропускает
 *   - Non-GET non-public маршрут с cross-origin Origin → 403 (CSRF protection)
 *   - Иначе → проверяет HMAC-подписанную cookie с iat-embedded TTL
 *
 * Команда видит landing-страницу как «парадную», принимает решение зайти в
 * Кабинет → попадает на /login → вводит пароль → cookie живёт 7 дней.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth";

/**
 * Открытые маршруты — доступны без cookie.
 * SECURITY: используем PUBLIC_EXACT (whitelist) вместо PUBLIC_PREFIXES для
 * /api/auth/ — раньше любой роут под /api/auth/* был автоматически public
 * (footgun: будущий /api/auth/admin/reset был бы анонимно доступен).
 * Теперь только явно перечисленные login + logout publicly accessible —
 * но logout требует auth (см. ниже).
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/api/auth/login",
  // ВАЖНО: /api/auth/logout СОЗНАТЕЛЬНО НЕ в PUBLIC_EXACT — логаут требует
  // валидного cookie. Это закрывает forced-logout DoS атаку (раньше любая
  // вражеская страница могла POST'ить в /api/auth/logout с cookie жертвы
  // через CSRF и вылогинить её).
  "/favicon.ico",
]);
const PUBLIC_PREFIXES = ["/_next/", "/fonts/", "/images/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * SECURITY: санитизация next-параметра для защиты от open-redirect.
 * Раньше middleware писал в next просто `pathname + search` — но если
 * атакующий запрашивал /login с manipulated path, валидация `startsWith("/")`
 * в login-page.tsx пропускала protocol-relative URL `//evil.com/phish`.
 * Теперь dropping на сервере + дополнительная санитизация на клиенте.
 */
function sanitizeNext(raw: string): string {
  if (!raw.startsWith("/")) return "/portfolio";
  if (raw.startsWith("//")) return "/portfolio";
  if (raw.startsWith("/\\")) return "/portfolio";
  return raw;
}

/**
 * SECURITY: CSRF protection через Origin/Referer check на state-changing
 * запросах. Раньше cookie SameSite=None пускался cross-origin, поэтому
 * любая вражеская страница могла форжить POST'ы в /api/engine-runs,
 * /api/backtest/snapshot (запись на диск через operator-trusted endpoints).
 * Теперь: для non-GET запросов Origin (если присутствует) должен совпадать
 * с host. Браузеры всегда отправляют Origin на POST → защита надёжная.
 */
function checkOrigin(req: NextRequest): NextResponse | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return null;
  }
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) {
    // No Origin header — некоторые legitimate same-origin клиенты не
    // отправляют (curl, server-to-server). Опционально можно тут запретить
    // вообще, но для совместимости пускаем.
    return null;
  }
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return NextResponse.json(
        { error: "Origin mismatch (CSRF protection)" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }
  return null;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.RESEARCH_PASSWORD?.trim() ?? "";

  // SECURITY FIX: fail-closed в проде на пустой env.
  // Раньше пустой env → NextResponse.next() для всех маршрутов (fail-OPEN).
  // Теперь только в dev. В проде 503 с явной ошибкой — DevOps моментально
  // видит проблему в логах Render вместо silently открытого фонда.
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Auth misconfigured: RESEARCH_PASSWORD env-var is not set",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // CSRF check сначала — даже для public маршрутов (логин не должен
  // принимать cross-origin POST'ы). EXCEPT: /api/auth/login исключение,
  // т.к. это user-initiated POST с самого /login (same-origin).
  const csrfError = checkOrigin(req);
  if (csrfError) return csrfError;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ok = await verifySessionToken(token, expected);
  if (ok) {
    return NextResponse.next();
  }

  // Не залогинены
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  // HTML-запрос → redirect на /login с next-параметром
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", sanitizeNext(pathname + req.nextUrl.search));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/).*)",
  ],
};
