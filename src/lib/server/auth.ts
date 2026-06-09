/**
 * Cookie-session аутентификация для команды фонда.
 *
 * SHARED-PASSWORD design: один пароль на всех (RESEARCH_PASSWORD env-var).
 *
 * Token format: `${iatMs}.${hmacHex}` где:
 *   - iatMs = Unix timestamp в ms когда токен выписан
 *   - hmacHex = HMAC-SHA256(password, "v2:" + iatMs)
 *
 * Зачем iat в payload:
 *   - server-side TTL: токен старше SESSION_MAX_AGE_SECONDS rejected
 *     независимо от cookie Max-Age (защита от replay скопированного cookie)
 *   - каждый логин выдаёт УНИКАЛЬНЫЙ token (защита от session fixation,
 *     раньше был детерминированный HMAC и все cookies были идентичны)
 *
 * При смене RESEARCH_PASSWORD все старые токены инвалидируются (HMAC не сойдётся).
 */

export const SESSION_COOKIE_NAME = "pifagor_research_session";
// SECURITY: cookie TTL уменьшен 30d → 7d. Уменьшает окно для replay атаки
// если cookie утёк через логи/screen-share/shared device.
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = "v2";

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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare двух hex-строк. Защита от timing attacks при
 * проверке cookie. Также используется в passwordEquals.
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
 * Создаёт новый session token с текущим timestamp. Каждый вызов выдаёт
 * УНИКАЛЬНЫЙ токен (разный iat → разный HMAC).
 *
 * SECURITY: бросает ошибку при пустом пароле — fail-CLOSED. Раньше
 * возвращал пустую строку «auth disabled» что могло привести к выдаче
 * пустых cookies в проде при misconfig env-var.
 */
export async function makeSessionToken(password: string): Promise<string> {
  if (!password) {
    throw new Error("makeSessionToken: password required (fail-closed)");
  }
  const iatMs = Date.now();
  const hmac = await hmacSign(password, `${TOKEN_VERSION}:${iatMs}`);
  return `${iatMs}.${hmac}`;
}

/**
 * Проверяет cookie. Возвращает true ТОЛЬКО если:
 *   - expectedPassword задан (fail-closed на пустой env)
 *   - token имеет валидный формат `iat.hmac`
 *   - iat в пределах [now - SESSION_MAX_AGE_SECONDS, now] (server-side TTL)
 *   - HMAC сходится (constant-time compare)
 *
 * SECURITY FIX: раньше возвращал `true` при пустом expectedPassword
 * («auth disabled mode»), что приводило к fail-OPEN в проде при
 * misconfig env-var. Теперь возвращает false — middleware явно решает
 * политику для пустого env (deny в проде, allow в dev).
 */
export async function verifySessionToken(
  token: string | undefined,
  expectedPassword: string,
): Promise<boolean> {
  if (!expectedPassword) return false;
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const iatStr = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  const iatMs = Number(iatStr);
  if (!Number.isFinite(iatMs) || iatMs <= 0) return false;
  // Server-side TTL — отклоняем токены старше SESSION_MAX_AGE_SECONDS
  // независимо от Cookie Max-Age. Также reject из «будущего» (clock skew
  // protection: разрешаем +60 сек на разницу).
  const now = Date.now();
  const ageMs = now - iatMs;
  if (ageMs < -60_000) return false;
  if (ageMs > SESSION_MAX_AGE_SECONDS * 1000) return false;
  const expectedHmac = await hmacSign(expectedPassword, `${TOKEN_VERSION}:${iatMs}`);
  return timingSafeEqual(hmac, expectedHmac);
}

/**
 * Constant-time compare пароля — для login-route. Универсальная функция,
 * чтобы тот же compare использовался в middleware и в /api/auth/login.
 */
export function passwordEquals(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}
