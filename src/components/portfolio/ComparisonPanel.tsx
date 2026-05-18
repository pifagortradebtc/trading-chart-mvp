"use client";

import { Plus, Sparkles, Trash2, Pin } from "lucide-react";
import type { PinnedPortfolio } from "@/lib/portfolio/types";
import { formatPercent, formatRatio, prettySymbol } from "@/lib/portfolio/format";

interface Props {
  pinned: PinnedPortfolio[];
  onRemove: (id: string) => void;
  onAddCustom: () => void;
  onClearAll: () => void;
  canAddCustom: boolean;
}

export function ComparisonPanel({
  pinned,
  onRemove,
  onAddCustom,
  onClearAll,
  canAddCustom,
}: Props) {
  const symbolSet = new Set<string>();
  for (const p of pinned) for (const a of p.allocation) symbolSet.add(a.symbol);
  const allSymbols = [...symbolSet];

  return (
    <section className="rounded-2xl border border-surface-border bg-surface backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Pin size={14} className="text-brand" />
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Сравнение портфелей
          </h2>
          {pinned.length > 0 && (
            <span className="rounded-full border border-surface-border bg-white/[0.04] px-2 py-0.5 text-[10px] text-ink-muted">
              {pinned.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddCustom}
            disabled={!canAddCustom}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
          >
            <Sparkles size={12} />
            Кастомный портфель
          </button>
          {pinned.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--rex-muted)] transition hover:border-rose-500/40 hover:text-rose-200"
            >
              <Trash2 size={12} />
              Очистить
            </button>
          )}
        </div>
      </header>

      {pinned.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="rounded-full border border-dashed border-white/15 p-3">
            <Plus size={18} className="text-[var(--rex-muted)]" />
          </div>
          <div>
            <p className="text-sm text-[var(--rex-text)]">
              Закрепите портфели, чтобы сравнить их рядом.
            </p>
            <p className="mt-1 text-[11px] text-[var(--rex-muted)]">
              Используйте кнопки «Закрепить» возле Max Sharpe / Max Sortino / Min
              Volatility или создайте кастомный портфель с произвольными весами.
            </p>
          </div>
        </div>
      ) : (
        <ComparisonTable
          pinned={pinned}
          allSymbols={allSymbols}
          onRemove={onRemove}
        />
      )}
    </section>
  );
}

function ComparisonTable({
  pinned,
  allSymbols,
  onRemove,
}: {
  pinned: PinnedPortfolio[];
  allSymbols: string[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-[var(--rex-muted)]">
          <tr className="border-b border-white/[0.06]">
            <th className="px-4 py-2 text-left font-medium">Портфель</th>
            <th className="px-3 py-2 text-right font-medium">Доходность</th>
            <th className="px-3 py-2 text-right font-medium">Волатильность</th>
            <th className="px-3 py-2 text-right font-medium">Sharpe</th>
            <th className="px-3 py-2 text-right font-medium">Sortino</th>
            {allSymbols.map((s) => (
              <th key={s} className="px-3 py-2 text-right font-medium">
                {prettySymbol(s)}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium" aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {pinned.map((p) => {
            const weightBySymbol = new Map(
              p.allocation.map((a) => [a.symbol, a.weight])
            );
            return (
              <tr
                key={p.id}
                className="border-b border-white/[0.04] transition hover:bg-white/[0.03]"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--rex-text)]">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-[var(--rex-muted)]">
                        rf {(p.riskFreeRate * 100).toFixed(1)}% · окно {p.historyDays} дн.
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--rex-text)]">
                  {formatPercent(p.metrics.return)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--rex-text)]">
                  {formatPercent(p.metrics.volatility)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--rex-text)]">
                  {formatRatio(p.metrics.sharpe)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--rex-text)]">
                  {formatRatio(p.metrics.sortino)}
                </td>
                {allSymbols.map((s) => {
                  const w = weightBySymbol.get(s) ?? 0;
                  return (
                    <td key={s} className="px-3 py-2.5 text-right font-mono">
                      {w > 0 ? (
                        <span className="text-[var(--rex-text)]">
                          {(w * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    className="rounded p-1 text-[var(--rex-muted)] transition hover:bg-white/[0.06] hover:text-rose-300"
                    aria-label="Удалить из сравнения"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
