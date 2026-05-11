"use client";

import type { ReactNode } from "react";
import { RESEARCH_TABS, type ResearchTabId } from "./types";
import { ProgressBar } from "./ui";

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
    <div className="flex min-h-screen bg-[var(--rex-bg)] text-[var(--rex-text)]">
      <aside className="rex-sidebar hidden w-[220px] shrink-0 flex-col border-r border-white/[0.06] bg-[var(--rex-bg-elevated)]/90 backdrop-blur-xl lg:flex">
        <div className="border-b border-white/[0.06] px-4 py-5">
          <div className="font-semibold tracking-tight text-[var(--rex-text)]">Research</div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--rex-muted)]">
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
        <header className="relative overflow-hidden border-b border-white/[0.06] bg-gradient-to-br from-[#050814] via-[#0a1020] to-[#060c18] px-4 py-8 sm:px-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="relative mx-auto max-w-[1600px]">
            <div className="flex flex-wrap items-end gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400/90">
                  Quant-grade backtest
                </p>
                <h1 className="mt-2 bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                  DCA Research Terminal
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[var(--rex-muted)]">
                  Чайкин + Кельтнер · факторная DCA-сетка · риск-метрики · лаборатории оптимизации и
                  стресс-тесты (часть — заглушки с понятной архитектурой).
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
                    <StatChip label="Max DD" value={`${heroStats.maxDdPct.toFixed(2)}%`} warn />
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
        <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] bg-[var(--rex-bg-elevated)]/80 px-2 py-2 lg:hidden">
          {RESEARCH_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                tab === t.id
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "text-[var(--rex-muted)] hover:bg-white/[0.04]"
              }`}
            >
              {t.short}
            </button>
          ))}
        </div>

        <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-[var(--rex-bg)]/85 px-4 py-3 backdrop-blur-md sm:px-8">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
            {stickyActions}
            {runProgress != null && (
              <div className="min-w-[140px] flex-1">
                <ProgressBar value={runProgress} />
              </div>
            )}
          </div>
        </div>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-8">{children}</main>
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
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--rex-muted)]">
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
                  ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/10 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                  : "text-[var(--rex-muted)] hover:bg-white/[0.04] hover:text-[var(--rex-text)]"
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
    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
    : warn
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
      : "border-white/10 bg-white/[0.03] text-[var(--rex-muted)]";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px] ${cls}`}
    >
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  );
}
