/**
 * Safe server-side fetch wrappers — SSRF guard + timeout.
 *
 * SECURITY context:
 *   Раньше server-side `fetch()` вызовы в trading-chart-mvp:
 *     1. Не имели timeout'ов на kline-fetcher'ах (Binance/OKX/Bybit/CoinGecko)
 *        — slow-loris upstream исчерпывал worker'ы.
 *     2. Не проверяли target URL когда он приходит из env (PIFAGOR_FUND_API_URL,
 *        PIFAGOR_VPS_BASE) — теоретически атакующий с контролем env мог
 *        перенаправить fetch на 169.254.169.254 (AWS metadata), loopback,
 *        приватные RFC1918 диапазоны для recon внутренней инфры.
 *
 * Этот модуль решает обе проблемы. Все новые server-side fetch'и должны
 * использовать `safeFetch` или один из его пресетов.
 */

/**
 * Возвращает true если хост — приватный/loopback/link-local IP.
 * Блокирует:
 *   - localhost / 127.0.0.0/8 (loopback)
 *   - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC1918 private)
 *   - 169.254.0.0/16 (link-local, AWS/Azure metadata endpoint)
 *   - 0.0.0.0/8 (current network)
 *   - IPv6 loopback ::1, link-local fe80::/10, ULA fc00::/7
 *
 * Не блокирует DNS — если злонамеренный env-vars указывает на attacker.com
 * который резолвится в 127.0.0.1 (DNS rebinding), эта проверка пройдёт. Для
 * полной защиты нужен resolve+check, что выходит за scope shared-password
 * research-tool.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (h === "localhost" || h === "localhost.") return true;
  // IPv6
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fe80:") || h.startsWith("[fe80:")) return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("[fc") || h.startsWith("[fd")) {
    // ULA fc00::/7 — приблизительная проверка
    return true;
  }
  // IPv4
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved
  }
  return false;
}

export interface SafeUrlOptions {
  /** Если true (default in prod) — разрешаем только https. В dev допускаем http. */
  requireHttps?: boolean;
  /** Если true — пропускаем приватные хосты (для локальной разработки). */
  allowPrivate?: boolean;
}

/**
 * Парсит URL и проверяет protocol + host. Возвращает null если URL невалидный
 * или хост приватный. Использовать ПЕРЕД любым `fetch()` где URL приходит из
 * env-var или user input.
 */
export function safeUrl(
  rawUrl: string,
  opts: SafeUrlOptions = {},
): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const isProd = process.env.NODE_ENV === "production";
  const requireHttps = opts.requireHttps ?? isProd;
  if (requireHttps && url.protocol !== "https:") return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Block private hosts unless explicitly allowed
  const allowPrivate = opts.allowPrivate ?? !isProd;
  if (!allowPrivate && isPrivateHost(url.hostname)) return null;
  return url;
}

/**
 * Default timeout for server-side fetches. 10 секунд — баланс между нормальной
 * latency upstream'ов (Binance/OKX обычно <1s) и защитой от slow-loris.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Server-side fetch wrapper с обязательным timeout. Использует
 * `AbortSignal.timeout` который доступен на Node 18+ и Edge runtime.
 *
 * Не делает SSRF check — если URL приходит из env/user, ОБЯЗАТЕЛЬНО прогнать
 * через `safeUrl()` ПЕРЕД вызовом. Для хардкоженных URL'ов (Binance/OKX/...)
 * SSRF check не нужен — URL контролируем мы.
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...init, signal });
}
