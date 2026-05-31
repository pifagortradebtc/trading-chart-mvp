"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pifagor Fund — общий sticky-header для внутренних research-страниц
 * (`/backtest`, `/portfolio`).
 *
 * Дизайн зеркалит шапку основного лендинга Криптофонда: π в круглой
 * gold-обводке, фирменная wordmark, sub-label моноширинной капителью.
 * Справа — две вкладки-ссылки на роуты исследования.
 *
 * Анимация состояний — на чистом CSS (без framer-motion, как и оговорено
 * в инфраструктуре MVP).
 */
export function PifagorFundHeader() {
  const pathname = usePathname() ?? "";

  return (
    <header
      className="sticky top-0 z-40 border-b border-surface-border bg-[rgba(6,10,16,0.78)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-4">
        {/* Brand — clickable to public fund site */}
        <a
          href="https://pifagor.fund/"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
          title="Открыть публичный сайт криптофонда (pifagor.fund) в новой вкладке"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full border border-brand/40 bg-[rgba(201,169,98,0.06)] shadow-glow transition-colors group-hover:border-brand/60"
          >
            <span className="font-display text-base font-semibold leading-none text-brand">
              π
            </span>
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-base font-semibold tracking-display-tight text-ink sm:text-lg">
              Pifagor Fund
            </span>
            <span className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint sm:inline">
              Закрытый криптофонд · Research
            </span>
          </span>
        </a>

        {/* Tabs + Fund button */}
        <nav className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-surface-border bg-white/[0.02] p-1">
            <HeaderTab href="/backtest" label="Бэктест" active={isActive(pathname, "/backtest")} />
            <HeaderTab href="/portfolio" label="Портфель" active={isActive(pathname, "/portfolio")} />
          </div>
          <a
            href="https://pifagor.fund/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-brand/50 bg-brand/15 px-4 py-1.5 text-[12px] font-medium text-brand transition-colors hover:bg-brand/25 sm:text-[13px]"
            title="Открыть публичный сайт криптофонда в новой вкладке"
          >
            На фонд ↗
          </a>
        </nav>
      </div>
    </header>
  );
}

function isActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function HeaderTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-medium text-[var(--bg-deep)] shadow-glow transition-colors sm:px-4 sm:text-[13px]"
          : "rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink sm:px-4 sm:text-[13px]"
      }
    >
      {label}
    </Link>
  );
}
