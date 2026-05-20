/**
 * POST /api/auth/logout — удаляет session-cookie. После redirect на /login.
 */

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
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
