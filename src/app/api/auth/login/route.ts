/**
 * POST /api/auth/login
 *   body: { password: string }
 *   response: 200 если пароль верный (+ Set-Cookie), 401 иначе,
 *             429 при rate-limit, 503 при misconfig.
 *
 * SECURITY:
 *   - In-memory rate-limit: 5 попыток за 15 минут per-IP. Поверх — пер-запрос
 *     timing-constant (250ms) — атакующий не может различить success/fail
 *     по latency.
 *   - SameSite=Lax (раньше None в проде — CSRF vector). Iframe-embed
 *     обрабатывается в /login/page.tsx через top-level breakout.
 *   - Fail-CLOSED на пустой env в проде (раньше отдавался `{authDisabled: true}`
 *     — config oracle для атакующего).
 */

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  makeSessionToken,
  passwordEquals,
} from "@/lib/server/auth";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (in-memory sliding window, single-instance friendly)
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_ATTEMPTS = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Записывает попытку логина и возвращает true если можно продолжать,
 * false — если IP превысил лимит. GC старых записей при превышении 1000
 * уникальных IP (защита от unbounded growth).
 */
function checkAndRecord(ip: string): boolean {
  const now = Date.now();
  const attempts = LOGIN_ATTEMPTS.get(ip) ?? [];
  const recent = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    LOGIN_ATTEMPTS.set(ip, recent);
    return false;
  }
  recent.push(now);
  LOGIN_ATTEMPTS.set(ip, recent);
  if (LOGIN_ATTEMPTS.size > 1000) {
    for (const [k, v] of LOGIN_ATTEMPTS.entries()) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) {
        LOGIN_ATTEMPTS.delete(k);
      }
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing-constant response
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSE_BUDGET_MS = 250;

async function padToConstantTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = RESPONSE_BUDGET_MS - elapsed;
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const start = Date.now();
  const expected = process.env.RESEARCH_PASSWORD?.trim() ?? "";

  // SECURITY: fail-CLOSED в проде на пустой env. Раньше отдавался
  // `{authDisabled: true}` — оракул для атакующего что auth выключен.
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      await padToConstantTime(start);
      return NextResponse.json(
        { error: "Auth misconfigured" },
        { status: 503 },
      );
    }
    // Dev-режим: explicit message, но НИКАКОЙ cookie не выдаём (раньше
    // выдавали пустую). Локальная разработка идёт без авторизации через
    // middleware, login-форма в dev не нужна.
    return NextResponse.json({ ok: true, dev: true });
  }

  const ip = getClientIp(req);
  if (!checkAndRecord(ip)) {
    await padToConstantTime(start);
    return NextResponse.json(
      {
        error:
          "Слишком много попыток. Попробуйте через 15 минут.",
      },
      {
        status: 429,
        headers: { "Retry-After": "900" },
      },
    );
  }

  let body: { password?: unknown } = {};
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    await padToConstantTime(start);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provided = typeof body.password === "string" ? body.password : "";
  if (!passwordEquals(provided, expected)) {
    // SECURITY: timing-constant. Раньше success возвращался за 5-30ms,
    // failure за 200ms — атакующий мог различать по latency. Теперь
    // оба пути занимают ≥250ms.
    await padToConstantTime(start);
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const token = await makeSessionToken(expected);
  const res = NextResponse.json({ ok: true });
  // SECURITY: SameSite=Lax (раньше None в проде, CSRF vector).
  // Iframe-embed handled в /login/page.tsx через top-level breakout —
  // SameSite=Lax не блокирует auth когда юзер открыл в новой вкладке.
  // Plus middleware теперь делает Origin check на non-GET для belt-and-
  // suspenders CSRF protection.
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  await padToConstantTime(start);
  return res;
}
