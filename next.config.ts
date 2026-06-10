import type { NextConfig } from "next";

/**
 * SECURITY: security-response-заголовки на все маршруты.
 *
 * Сознательные решения:
 *   - frame-ancestors (а не X-Frame-Options: DENY) — платформа штатно
 *     встраивается в iframe из админ-хаба фонда (см. iframe-breakout в
 *     /login/page.tsx). DENY убил бы этот сценарий целиком. Белый список
 *     'self' + pifagor.fund блокирует clickjacking с чужих доменов, но
 *     сохраняет легитимный embed.
 *   - НЕ ставим полный default-src CSP: Next.js инлайнит скрипты/стили без
 *     nonce, строгий CSP сломал бы рендер. frame-ancestors — самостоятельная
 *     CSP-директива, на загрузку самой страницы не влияет (только на то, кто
 *     может её фреймить), поэтому безопасна для ретрофита.
 *   - HSTS активен только поверх HTTPS (Render отдаёт HTTPS) — на http
 *     браузер его игнорирует, downgrade-риска нет.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://pifagor.fund https://*.pifagor.fund",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
