/**
 * Простая cookie-session аутентификация для команды фонда.
 *
 * Single-shared-password: один пароль на всех (RESEARCH_PASSWORD env-var).
 * После ввода пароля выдаётся HMAC-подписанная HttpOnly cookie. Cookie
 * value = HMAC-SHA256(password, "v1:valid") — если пароль в env меняется,
 * все старые cookies автоматически инвалидируются (HMAC не сойдётся).
 *
 * Используется в Next.js middleware (Edge runtime, Web Crypto API) и
 * route handlers (Node runtime). Обе платформы поддерживают crypto.subtle.
 */

export const SESSION_COOKIE_NAME = "pifagor_research_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 дней
const COOKIE_PAYLOAD = "v1:valid";

async function hmacSign(password: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  // Hex-encode для cookie-safe формата
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Возвращает hex-кодированный HMAC, который нужно записать в cookie.
 * Если password пустой — возвращает пустую строку (auth disabled mode).
 */
export async function makeSessionToken(password: string): Promise<string> {
  if (!password) return "";
  return hmacSign(password, COOKIE_PAYLOAD);
}

/**
 * Constant-time compare двух hex-строк одинаковой длины. Защита от timing
 * attacks при проверке cookie.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

/**
 * Проверяет, что cookie-значение валидно для текущего пароля. Если
 * env-var `RESEARCH_PASSWORD` пустая — возвращает true (auth disabled).
 */
export async function verifySessionToken(
  token: string | undefined,
  expectedPassword: string,
): Promise<boolean> {
  if (!expectedPassword) return true; // auth disabled
  if (!token) return false;
  const expected = await makeSessionToken(expectedPassword);
  return timingSafeEqual(token, expected);
}

/**
 * Constant-time compare пароля — для login-route. Универсальная функция,
 * чтобы тот же compare использовался в middleware и в /api/auth/login.
 */
export function passwordEquals(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}
