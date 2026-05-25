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
  // SameSite=None + Secure — необходимо чтобы cookie работала когда
  // платформу открывают в iframe (например, через admin-hub фонда).
  // Без SameSite=None браузер обращается с cookie как third-party и
  // блокирует. Secure обязателен с SameSite=None на проде (https).
  // На локалке (NODE_ENV !== production) HTTP, Secure нельзя — fall back
  // на SameSite=Lax (iframe-embed в dev обычно не нужен).
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd ? "None" : "Lax";
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isProd) cookieParts.push("Secure");
  // Ставим cookie двумя способами для надёжности (Next.js API + прямой
  // Set-Cookie header — на Render с Cloudflare-edge один способ может
  // молча игнорироваться).
  res.headers.append("Set-Cookie", cookieParts.join("; "));
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
