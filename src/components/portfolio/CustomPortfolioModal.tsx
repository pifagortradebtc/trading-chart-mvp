"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { PriceSeries } from "@/lib/portfolio/types";
import { computeMetrics } from "@/lib/portfolio/mpt";
import { prettySymbol, formatPercent, formatRatio } from "@/lib/portfolio/format";

interface Props {
  open: boolean;
  onClose: () => void;
  priceSeries: PriceSeries[];
  riskFreeRate: number;
  onConfirm: (allocation: { symbol: string; weight: number }[]) => void;
}

export function CustomPortfolioModal({
  open,
  onClose,
  priceSeries,
  riskFreeRate,
  onConfirm,
}: Props) {
  const symbols = priceSeries.map((p) => p.symbol);
  const [raw, setRaw] = useState<number[]>(() =>
    symbols.map(() => 1 / symbols.length)
  );

  useEffect(() => {
    if (open) {
      setRaw(symbols.map(() => 1 / symbols.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, symbols.length]);

  const normalized = useMemo(() => normalize(raw), [raw]);

  const preview = useMemo(() => {
    if (priceSeries.length === 0) return null;
    try {
      return computeMetrics(normalized, priceSeries, riskFreeRate);
    } catch {
      return null;
    }
  }, [normalized, priceSeries, riskFreeRate]);

  if (!open) return null;

  const total = raw.reduce((a, b) => a + b, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--rex-bg-elevated)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <h2 className="text-sm font-semibold tracking-wide text-[var(--rex-text)]">
              Кастомный портфель
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--rex-muted)] hover:bg-white/[0.06] hover:text-[var(--rex-text)]"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 text-[11px] text-[var(--rex-muted)]">
            Задайте вручную доли активов. Веса автоматически нормируются на 100%.
          </p>

          <div className="space-y-2">
            {symbols.map((sym, i) => (
              <div
                key={sym}
                className="grid grid-cols-[80px_1fr_64px] items-center gap-3"
              >
                <span className="font-mono text-sm text-[var(--rex-text)]">
                  {prettySymbol(sym)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={raw[i]}
                  onChange={(e) => {
                    const next = [...raw];
                    next[i] = Number(e.target.value);
                    setRaw(next);
                  }}
                  className="w-full accent-brand"
                />
                <span className="text-right font-mono text-xs text-[var(--rex-text)]">
                  {formatPercent(normalized[i], 0)}
                </span>
              </div>
            ))}
          </div>

          {total === 0 && (
            <p className="mt-3 text-[11px] text-rose-300">
              Все доли равны нулю. Подвиньте хотя бы один слайдер.
            </p>
          )}

          {preview && (
            <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <PreviewStat label="Return" value={formatPercent(preview.return)} />
              <PreviewStat label="Vol" value={formatPercent(preview.volatility)} />
              <PreviewStat label="Sharpe" value={formatRatio(preview.sharpe)} />
              <PreviewStat label="Sortino" value={formatRatio(preview.sortino)} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--rex-text)] transition hover:border-white/30 hover:text-white"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={total === 0}
            onClick={() => {
              onConfirm(
                symbols.map((symbol, i) => ({ symbol, weight: normalized[i] }))
              );
              onClose();
            }}
            className="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-[var(--bg-deep)] transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            Закрепить
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--rex-muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-[var(--rex-text)]">{value}</div>
    </div>
  );
}

function normalize(raw: number[]): number[] {
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum === 0) return raw.map(() => 0);
  return raw.map((v) => v / sum);
}
