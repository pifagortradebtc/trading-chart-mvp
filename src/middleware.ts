/**
 * Cookie-session middleware. Защищает все маршруты кроме publicly listed
 * (главная, login-форма, API-логина, статика).
 *
 * Поведение:
 *   - `RESEARCH_PASSWORD` не задан → пропускает всё (локальная разработка)
 *   - Маршрут в PUBLIC_PATHS → пропускает
 *   - Иначе → проверяет HMAC-подписанную cookie. Если нет/невалидна:
 *       • HTML-запрос → 307 redirect на `/login?next=<path>`
 *       • API-запрос → 401 JSON
 *
 * Зачем именно так: команда видит landing-страницу как «парадную»,
 * принимает решение зайти в Кабинет → попадает на /login → вводит пароль
 * → cookie живёт 30 дней. Дальше переходы между разделами без повторных
 * запросов пароля.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth";

/**
 * Открытые маршруты — доступны без cookie.
 * - `/`           — landing (визитка фонда, без чувствительной информации)
 * - `/login`      — форма ввода пароля
 * - `/api/auth/*` — login/logout endpoints
 */
const PUBLIC_EXACT = new Set(["/", "/login"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/", "/fonts/", "/images/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname === "/favicon.ico") return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.RESEARCH_PASSWORD?.trim() ?? "";
  if (!expected) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
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

  // HTML-запрос → redirect на /login с next-параметром, чтобы после
  // успеха вернуть пользователя туда, куда он шёл
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/).*)",
  ],
};
