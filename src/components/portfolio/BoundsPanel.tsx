"use client";

import { ChevronDown, RotateCcw, Lock } from "lucide-react";
import { useState } from "react";
import type { AssetBounds } from "@/lib/portfolio/types";
import { prettySymbol } from "@/lib/portfolio/format";

interface Props {
  symbols: string[];
  bounds: AssetBounds[];
  onChange: (next: AssetBounds[]) => void;
  disabled?: boolean;
}

export function BoundsPanel({ symbols, bounds, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const sumMin = bounds.reduce((a, b) => a + b.min, 0);
  const sumMax = bounds.reduce((a, b) => a + b.max, 0);
  const infeasible = sumMin > 1 + 1e-6 || sumMax < 1 - 1e-6;
  const hasConstraint = bounds.some((b) => b.min > 0.001 || b.max < 0.999);

  const update = (idx: number, next: Partial<AssetBounds>) => {
    onChange(
      bounds.map((b, i) => {
        if (i !== idx) return b;
        const min = clamp(next.min ?? b.min, 0, 1);
        const max = clamp(next.max ?? b.max, 0, 1);
        return {
          min: Math.min(min, max),
          max: Math.max(min, max),
        };
      })
    );
  };

  const reset = () => onChange(symbols.map(() => ({ min: 0, max: 1 })));

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-[var(--rex-muted)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--rex-text)]">
            Ограничения долей
          </span>
          {hasConstraint && (
            <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand-light">
              активны
            </span>
          )}
          {infeasible && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-200">
              неосуществимо
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[var(--rex-muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 py-4">
          <p className="mb-3 text-[11px] text-[var(--rex-muted)]">
            Задайте минимальную и максимальную долю для каждого актива.
            Σmin ≤ 100% ≤ Σmax — иначе решения не существует. Жёсткие ограничения
            снизят количество принятых симуляций.
          </p>

          <div className="space-y-2">
            {symbols.map((symbol, i) => (
              <BoundsRow
                key={symbol}
                symbol={symbol}
                bounds={bounds[i]}
                disabled={disabled}
                onMinChange={(min) => update(i, { min })}
                onMaxChange={(max) => update(i, { max })}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px]">
            <div className="flex gap-3 text-[var(--rex-muted)]">
              <span>
                Σmin:{" "}
                <span className="font-mono text-[var(--rex-text)]">
                  {(sumMin * 100).toFixed(0)}%
                </span>
              </span>
              <span>
                Σmax:{" "}
                <span className="font-mono text-[var(--rex-text)]">
                  {(sumMax * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-[var(--rex-text)] transition hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              <RotateCcw size={12} />
              Сбросить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BoundsRow({
  symbol,
  bounds,
  onMinChange,
  onMaxChange,
  disabled,
}: {
  symbol: string;
  bounds: AssetBounds;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr_64px_64px] items-center gap-3">
      <span className="font-mono text-sm text-[var(--rex-text)]">
        {prettySymbol(symbol)}
      </span>
      <div className="relative h-6">
        <DualRange
          min={bounds.min}
          max={bounds.max}
          onMinChange={onMinChange}
          onMaxChange={onMaxChange}
          disabled={disabled}
        />
      </div>
      <NumberInput
        value={bounds.min}
        onChange={onMinChange}
        disabled={disabled}
        suffix="%"
      />
      <NumberInput
        value={bounds.max}
        onChange={onMaxChange}
        disabled={disabled}
        suffix="%"
      />
    </div>
  );
}

function DualRange({
  min,
  max,
  onMinChange,
  onMaxChange,
  disabled,
}: {
  min: number;
  max: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  disabled?: boolean;
}) {
  const minPct = min * 100;
  const maxPct = max * 100;
  return (
    <div className="relative h-6 w-full select-none">
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/[0.06]" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-brand to-brand-light"
        style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={minPct}
        disabled={disabled}
        onChange={(e) => onMinChange(Math.min(Number(e.target.value) / 100, max))}
        className="dual-range absolute inset-0 h-6 w-full appearance-none bg-transparent"
        aria-label="Минимум доли"
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={maxPct}
        disabled={disabled}
        onChange={(e) => onMaxChange(Math.max(Number(e.target.value) / 100, min))}
        className="dual-range absolute inset-0 h-6 w-full appearance-none bg-transparent"
        aria-label="Максимум доли"
      />
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-surface-border bg-white/[0.03] px-2 py-1 focus-within:border-brand/50">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value) / 100, 0, 1))}
        className="w-full bg-transparent text-right font-mono text-xs text-[var(--rex-text)] outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
      />
      {suffix && <span className="text-[10px] text-[var(--rex-muted)]">{suffix}</span>}
    </div>
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
