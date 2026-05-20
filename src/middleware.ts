/**
 * HTTP Basic Auth middleware для всей платформы.
 *
 * Защищает все маршруты (страницы + API) одним паролем из env-var
 * `RESEARCH_PASSWORD`. Браузер показывает нативный диалог «введите имя
 * и пароль» — кешируется до закрытия вкладки.
 *
 * Поведение:
 *   - Если `RESEARCH_PASSWORD` не задана → middleware пропускает всё
 *     (полезно для локальной разработки и E2E тестов).
 *   - Если задана → требует Basic Auth credentials, проверяет пароль
 *     (имя пользователя игнорируется — single-shared-password setup).
 *
 * Безопасность:
 *   - Constant-time compare (XOR через timingSafeEqual-эквивалент на edge)
 *     для защиты от timing attacks.
 *   - Skip `_next/*`, `favicon`, `public/*` — статика всегда public,
 *     иначе браузер не сможет загрузить ассеты для login-страницы.
 *
 * Зачем НЕ session-based (JWT cookie + login form):
 *   - Команда фонда — 3-5 человек, не нужен per-user account
 *   - Native browser dialog работает без кода
 *   - Меньше surface для багов аутентификации
 *
 * Если нужна более сложная схема (per-user accounts, RBAC, audit) —
 * можно мигрировать на NextAuth.js или интегрировать с Telegram OIDC
 * Криптофонда. Сейчас это overkill.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = "Pifagor Fund · Portfolio Research";

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time string compare. Длины могут отличаться — но даже это
  // утечка (timing), поэтому XOR'им до длины max(a,b) и проверяем еще
  // равенство длин в конце.
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

export function middleware(req: NextRequest): NextResponse {
  const expected = process.env.RESEARCH_PASSWORD?.trim() ?? "";

  // Auth disabled — пропускаем (локальная разработка без пароля)
  if (!expected) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = atob(auth.slice("Basic ".length).trim());
  } catch {
    return unauthorized();
  }

  // formats: "user:password" — игнорируем user, проверяем только password
  const colonIdx = decoded.indexOf(":");
  const provided = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;

  if (!timingSafeEqual(provided, expected)) {
    return unauthorized();
  }

  return NextResponse.next();
}

/**
 * Какие маршруты middleware видит. Исключаем статику и Next.js internals,
 * иначе браузер не сможет загрузить ассеты страницы 401.
 */
export const config = {
  matcher: [
    // Всё кроме статики, _next, и favicon. Включает все страницы и /api/*
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/|public/).*)",
  ],
};
