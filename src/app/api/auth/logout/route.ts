/**
 * POST /api/auth/logout — удаляет session-cookie.
 *
 * SECURITY:
 *   - Требует валидную auth-cookie (middleware пропускает только
 *     authenticated; /api/auth/logout НЕ в PUBLIC_EXACT). Это закрывает
 *     forced-logout DoS — раньше любая вражеская страница могла POST'ить
 *     сюда с cookie жертвы через CSRF и вылогинить.
 *   - Дополнительный Origin check в middleware (см. checkOrigin) уже
 *     отбивает cross-origin POST. Здесь второй layer защиты.
 */

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  // SECURITY: defense-in-depth Origin check, даже если middleware
  // его уже сделал. На случай если middleware пробьют (Next.js CVE)
  // или конфиг изменится.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json(
          { error: "Origin mismatch" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
