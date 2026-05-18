"use client";

import type { ReactNode } from "react";
import { RESEARCH_TABS, type ResearchTabId } from "./types";
import { ProgressBar } from "./ui";
import { PifagorFundHeader } from "@/components/PifagorFundHeader";

export function ResearchShell({
  tab,
  onTab,
  heroStats,
  runProgress,
  stickyActions,
  children,
}: {
  tab: ResearchTabId;
  onTab: (t: ResearchTabId) => void;
  heroStats?: {
    pair: string;
    interval: string;
    bars: number;
    deposit: number;
    equity?: number;
    retPct?: number;
    maxDdPct?: number;
    trades?: number;
  };
  runProgress: number | null;
  stickyActions: ReactNode;
  children: ReactNode;
}) {
  const grouped = {
    core: RESEARCH_TABS.filter((t) => t.group === "core"),
    labs: RESEARCH_TABS.filter((t) => t.group === "labs"),
    system: RESEARCH_TABS.filter((t) => t.group === "system"),
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-deep)] text-ink">
      <PifagorFundHeader />

      <div className="flex flex-1 min-h-0">
        <aside className="rex-sidebar hidden w-[220px] shrink-0 flex-col border-r border-surface-border bg-[rgba(10,16,32,0.7)] backdrop-blur-xl lg:flex">
          <div className="border-b border-surface-border px-4 py-5">
            <div className="font-display font-semibold tracking-display-tight text-ink">
              Research
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
              DCA Terminal
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-2 py-4 text-sm">
            <NavGroup title="Core" items={grouped.core} active={tab} onSelect={onTab} />
            <NavGroup title="Labs" items={grouped.labs} active={tab} onSelect={onTab} />
            <NavGroup title="System" items={grouped.system} active={tab} onSelect={onTab} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Hero ── */}
          <header className="relative overflow-hidden border-b border-surface-border bg-[rgba(10,16,32,0.55)] px-4 py-10 sm:px-8 sm:py-12">
            {/* Gold aurora */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-brand-glow blur-3xl animate-aurora-drift"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[rgba(201,169,98,0.10)] blur-3xl"
            />

            <div className="relative mx-auto max-w-[1600px]">
              <div className="flex flex-wrap items-end gap-6">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow flex items-center gap-3">
                    <span className="pulse-dot" aria-hidden />
                    Pifagor Fund · Кабинет аналитики
                  </p>
                  <h1 className="mt-4 font-display text-3xl font-semibold leading-[1.05] tracking-display-tight text-ink sm:text-[2.5rem]">
                    Пифагор DCA{" "}
                    <span className="accent-serif text-brand-light">Research</span>{" "}
                    Terminal
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-[15px]">
                    Прозрачный взгляд на стратегию циклического накопления
                    криптофонда. Каждое решение — на цифрах, не на догадках.
                  </p>
                </div>
                {heroStats && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <StatChip label="Пара" value={heroStats.pair} />
                    <StatChip label="TF" value={heroStats.interval} />
                    <StatChip label="Баров" value={String(heroStats.bars)} />
                    {heroStats.equity != null && (
                      <StatChip
                        label="Equity"
                        value={heroStats.equity.toFixed(2)}
                        accent
                      />
                    )}
                    {heroStats.retPct != null && (
                      <StatChip
                        label="Return"
                        value={`${heroStats.retPct.toFixed(2)}%`}
                        accent
                      />
                    )}
                    {heroStats.maxDdPct != null && (
                      <StatChip
                        label="Max DD"
                        value={`${heroStats.maxDdPct.toFixed(2)}%`}
                        warn
                      />
                    )}
                    {heroStats.trades != null && (
                      <StatChip label="Сделок" value={String(heroStats.trades)} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Mobile tab strip */}
          <div className="flex gap-1 overflow-x-auto border-b border-surface-border bg-[rgba(10,16,32,0.7)] px-2 py-2 lg:hidden">
            {RESEARCH_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id
                    ? "bg-brand/15 text-brand-light"
                    : "text-ink-muted hover:bg-white/[0.04]"
                }`}
              >
                {t.short}
              </button>
            ))}
          </div>

          <div className="sticky top-[68px] z-30 border-b border-surface-border bg-[rgba(6,10,16,0.85)] px-4 py-3 backdrop-blur-md sm:px-8">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
              {stickyActions}
              {runProgress != null && (
                <div className="min-w-[140px] flex-1">
                  <ProgressBar value={runProgress} />
                </div>
              )}
            </div>
          </div>

          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-8">
            {children}
          </main>

          <footer className="border-t border-surface-border px-4 py-4 sm:px-8">
            <div className="mx-auto max-w-[1600px]">
              <p className="fund-disclaimer">
                Внутренний инструмент Pifagor Fund. Образовательная демонстрация,
                не публичная финансовая рекомендация.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  active,
  onSelect,
}: {
  title: string;
  items: typeof RESEARCH_TABS;
  active: ResearchTabId;
  onSelect: (t: ResearchTabId) => void;
}) {
  return (
    <div>
      <div className="mb-2 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                active === t.id
                  ? "bg-brand/12 text-ink shadow-[inset_0_0_0_1px_rgba(201,169,98,0.28)]"
                  : "text-ink-muted hover:bg-white/[0.04] hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const cls = accent
    ? "border-brand/30 bg-brand/10 text-brand-light"
    : warn
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
      : "border-surface-border bg-white/[0.03] text-ink-muted";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px] ${cls}`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-80">
        {label}
      </span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}
