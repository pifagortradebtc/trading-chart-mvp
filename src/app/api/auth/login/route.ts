/**
 * POST /api/auth/login
 *   body: { password: string }
 *   response: 200 если пароль верный, 401 иначе.
 *   При успехе ставит HttpOnly cookie с HMAC-сессией на 30 дней.
 *
 * Используется со страницы /login через client-side fetch.
 */

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  makeSessionToken,
  passwordEquals,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env.RESEARCH_PASSWORD?.trim() ?? "";
  if (!expected) {
    // Auth disabled — успех сразу, кука не нужна
    return NextResponse.json({ ok: true, authDisabled: true });
  }

  let body: { password?: unknown } = {};
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provided = typeof body.password === "string" ? body.password : "";
  if (!passwordEquals(provided, expected)) {
    // Небольшая задержка против brute-force (200ms — не блокирует UX,
    // но усложняет автоматизированный перебор без rate-limit)
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const token = await makeSessionToken(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
