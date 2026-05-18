"use client";

import {
  CheckCircle2,
  Crown,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sliders,
  TrendingDown,
} from "lucide-react";
import { useMemo } from "react";
import { prettySymbol } from "@/lib/portfolio/format";
import { applyRiskCaps } from "@/lib/portfolio/riskCaps";
import type {
  AggregateRules,
  StrategyResult,
  ViewInput,
} from "@/lib/portfolio/strategyTypes";

interface Props {
  symbols: string[];
  riskCaps: Record<string, { min?: number; max?: number }>;
  aggregateRules: AggregateRules;
  views: ViewInput[];
  /** Daily CVaR-95 trigger for the Final Fund defensive bump (fraction, e.g. -0.08). */
  cvarDefenseThreshold: number;
  /** Bot strategies sleeve as a fraction of total AUM (0..0.4). */
  botSleeve: number;
  /** Manual book sleeve as a fraction of total AUM (0..0.4). */
  manualSleeve: number;
  strategies: StrategyResult[] | null;
  onRiskCapsChange: (next: Record<string, { min?: number; max?: number }>) => void;
  onAggregateChange: (next: AggregateRules) => void;
  onViewsChange: (next: ViewInput[]) => void;
  onCvarDefenseThresholdChange: (next: number) => void;
  onBotSleeveChange: (next: number) => void;
  onManualSleeveChange: (next: number) => void;
  /** Wipes localStorage policy and resets all caps/views/threshold to defaults. */
  onResetPolicy: () => void;
  onApply: () => void;
  loading: boolean;
}

/**
 * Two-section editor:
 *   1) Per-asset caps + aggregate floors/ceilings (BTC+ETH min, small-alts max).
 *   2) Black-Litterman views (expected return, confidence, max weight).
 *
 * Changes don't fire automatically; user clicks "Применить" to recompute
 * strategies in the worker. This keeps the heavy round-trip explicit.
 */
export function RiskCapsTab({
  symbols,
  riskCaps,
  aggregateRules,
  views,
  cvarDefenseThreshold,
  botSleeve,
  manualSleeve,
  strategies,
  onRiskCapsChange,
  onAggregateChange,
  onViewsChange,
  onCvarDefenseThresholdChange,
  onBotSleeveChange,
  onManualSleeveChange,
  onResetPolicy,
  onApply,
  loading,
}: Props) {
  const sleevesTotal = botSleeve + manualSleeve;
  const sleevesOverflow = sleevesTotal > 0.5;
  const finalStrategy = strategies?.find((s) => s.id === "finalFund");

  const previewViolations = useMemo(() => {
    if (!finalStrategy) return [];
    const { violations } = applyRiskCaps(
      finalStrategy.weights,
      symbols,
      riskCaps,
      aggregateRules
    );
    return violations;
  }, [finalStrategy, symbols, riskCaps, aggregateRules]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="eyebrow">policy floor</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-display-tight text-ink">
            Risk <span className="accent-serif text-brand-light">Caps</span> &amp; Views
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Жёсткие лимиты долей и Black-Litterman взгляды. Применяются к
            Final Fund Portfolio: BL → caps → CVaR-защита.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetPolicy}
          className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.03] px-3 py-1.5 text-xs text-ink-muted transition hover:border-brand/40 hover:text-ink"
        >
          <RotateCcw size={12} /> Reset to defaults
        </button>
      </header>

      <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-brand" />
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
              Per-asset caps
            </h3>
          </div>
          <span className="text-[10px] text-ink-faint">
            Доли в процентах. Пусто = без ограничения.
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[110px_repeat(2,90px)_1fr] gap-x-3 gap-y-2 text-xs">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Symbol
          </div>
          <div className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Min %
          </div>
          <div className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Max %
          </div>
          <div />
          {symbols.map((s) => {
            const cap = riskCaps[s] ?? {};
            return (
              <CapRow
                key={s}
                symbol={s}
                min={cap.min}
                max={cap.max}
                onChange={(next) => {
                  const copy = { ...riskCaps };
                  if (next.min === undefined && next.max === undefined) {
                    delete copy[s];
                  } else {
                    copy[s] = next;
                  }
                  onRiskCapsChange(copy);
                }}
              />
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
        <div className="flex items-center gap-2 border-b border-surface-border pb-3">
          <ShieldAlert size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Aggregate rules
          </h3>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="BTC + ETH floor"
            help="Минимальная суммарная доля core-активов."
            value={aggregateRules.coreMin}
            onChange={(v) =>
              onAggregateChange({ ...aggregateRules, coreMin: v })
            }
          />
          <NumberField
            label="Small alts cap"
            help="Максимум на сумму мелких альтов (не majors)."
            value={aggregateRules.smallAltsMax}
            onChange={(v) =>
              onAggregateChange({ ...aggregateRules, smallAltsMax: v })
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
        <div className="flex items-center gap-2 border-b border-surface-border pb-3">
          <TrendingDown size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            CVaR-Defense порог
          </h3>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-mono text-[11px] leading-relaxed text-ink-muted">
            Если CVaR-95 итогового портфеля хуже этого значения (в дневных
            returns), система автоматически добавит +10% веса к BTC/ETH из
            non-core активов.
          </p>
          <CvarThresholdInput
            value={cvarDefenseThreshold}
            onChange={onCvarDefenseThresholdChange}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <div className="flex items-center gap-2">
            <Crown size={14} className="text-brand" />
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
              Fund sleeves
            </h3>
          </div>
          <span
            className={`font-mono text-[10px] ${
              sleevesOverflow ? "text-rose-300" : "text-ink-faint"
            }`}
          >
            Spot {((1 - sleevesTotal) * 100).toFixed(0)}% · Sleeves {(sleevesTotal * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <p className="font-mono text-[11px] leading-relaxed text-ink-muted">
            Доля общего AUM фонда, зарезервированная под бот-стратегии и
            ручную книгу. Уменьшает прямую крипто-экспозицию и снижает
            корреляцию с чистым spot-портфелем.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SleeveInput
              label="Bot strategies"
              value={botSleeve}
              onChange={onBotSleeveChange}
            />
            <SleeveInput
              label="Manual book"
              value={manualSleeve}
              onChange={onManualSleeveChange}
            />
          </div>
          {sleevesOverflow && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
              Sleeves суммарно &gt;50% — spot-экспозиция станет слишком маленькой.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface backdrop-blur-xl shadow-card">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Sliders size={14} className="text-brand" />
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
              Black-Litterman views
            </h3>
          </div>
          <span className="text-[10px] text-ink-faint">
            Влияет на BL + Final Fund.
          </span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-deep)]/40 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              <tr className="border-b border-surface-border">
                <th className="px-4 py-2 text-left font-medium">Symbol</th>
                <th className="px-4 py-2 text-left font-medium">Expected return</th>
                <th className="px-4 py-2 text-left font-medium">Confidence</th>
                <th className="px-4 py-2 text-right font-medium">Max weight</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => {
                const v = views.find((x) => x.symbol === s);
                const view = v ?? {
                  symbol: s,
                  expectedReturn: 0.15,
                  confidence: 0.4,
                  maxWeight: 0.1,
                };
                return (
                  <ViewRow
                    key={s}
                    view={view}
                    onChange={(next) => {
                      const copy = views.filter((x) => x.symbol !== s);
                      onViewsChange([...copy, next]);
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface p-4 backdrop-blur-xl shadow-card">
        <div className="flex flex-col gap-1">
          {previewViolations.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 size={14} /> Current Final Fund соответствует caps.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs text-amber-200">
                <ShieldAlert size={14} /> Final Fund нарушает caps:
              </div>
              <ul className="ml-5 list-disc text-[11px] text-ink-muted">
                {previewViolations.slice(0, 4).map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-[var(--bg-deep)] shadow-glow-strong transition hover:bg-brand-light disabled:opacity-50"
        >
          {loading ? "Применяем…" : "Применить и пересчитать"}
        </button>
      </section>
    </div>
  );
}

function CapRow({
  symbol,
  min,
  max,
  onChange,
}: {
  symbol: string;
  min: number | undefined;
  max: number | undefined;
  onChange: (next: { min?: number; max?: number }) => void;
}) {
  return (
    <>
      <div className="self-center font-mono text-sm text-ink">
        {prettySymbol(symbol)}
      </div>
      <PercentInput
        value={min}
        onChange={(v) => onChange({ min: v, max })}
        placeholder="—"
      />
      <PercentInput
        value={max}
        onChange={(v) => onChange({ min, max: v })}
        placeholder="—"
      />
      <div className="self-center text-[10px] text-ink-faint">
        {min !== undefined && max !== undefined
          ? `${(min * 100).toFixed(0)}…${(max * 100).toFixed(0)}%`
          : min !== undefined
            ? `≥ ${(min * 100).toFixed(0)}%`
            : max !== undefined
              ? `≤ ${(max * 100).toFixed(0)}%`
              : "без ограничений"}
      </div>
    </>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  const display = value === undefined ? "" : Math.round(value * 100).toString();
  return (
    <div className="flex items-center gap-1 rounded-md border border-surface-border bg-[rgba(8,12,20,0.6)] px-2 py-1 focus-within:border-brand/40">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") {
            onChange(undefined);
            return;
          }
          const n = Number(v);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(0, Math.min(1, n / 100)));
        }}
        className="w-full bg-transparent text-right font-mono text-xs text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
      />
      <span className="text-[10px] text-ink-faint">%</span>
    </div>
  );
}

function NumberField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-brand"
        />
        <span className="w-16 text-right font-mono text-sm text-ink">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-[10px] text-ink-faint">{help}</p>
    </div>
  );
}

function ViewRow({
  view,
  onChange,
}: {
  view: ViewInput;
  onChange: (next: ViewInput) => void;
}) {
  return (
    <tr className="border-b border-surface-border/60">
      <td className="px-4 py-2.5 font-mono text-sm text-ink">
        {prettySymbol(view.symbol)}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-0.5}
            max={2}
            step={0.05}
            value={view.expectedReturn}
            onChange={(e) =>
              onChange({ ...view, expectedReturn: Number(e.target.value) })
            }
            className="w-36 accent-brand"
          />
          <span className="w-14 text-right font-mono text-xs text-emerald-300">
            {`${view.expectedReturn >= 0 ? "+" : ""}${(view.expectedReturn * 100).toFixed(0)}%`}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={view.confidence}
            onChange={(e) =>
              onChange({ ...view, confidence: Number(e.target.value) })
            }
            className="w-32 accent-brand"
          />
          <span className="w-10 text-right font-mono text-xs text-ink">
            {view.confidence.toFixed(2)}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <PercentInput
          value={view.maxWeight}
          onChange={(v) => onChange({ ...view, maxWeight: v ?? 1 })}
        />
      </td>
    </tr>
  );
}

/**
 * Input для CVaR-Defense порога. Внутри держим долю (например -0.08),
 * пользователю показываем процент с минусом ("-8%"). Диапазон −15…−2,
 * шаг 0.5%. Сохраняем тот же `.input-field`-like стиль, что и в PercentInput.
 */
function CvarThresholdInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  // value is a fraction (negative). UI shows percent (also negative).
  const displayPct = (value * 100).toFixed(1);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 rounded-md border border-surface-border bg-[rgba(8,12,20,0.6)] px-2 py-1 focus-within:border-brand/40 sm:w-40">
        <input
          type="number"
          min={-15}
          max={-2}
          step={0.5}
          value={displayPct}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") return;
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            // Clamp -15..-2 percent → -0.15..-0.02 fraction.
            const clamped = Math.max(-15, Math.min(-2, n));
            onChange(clamped / 100);
          }}
          className="w-full bg-transparent text-right font-mono text-xs text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
        />
        <span className="text-[10px] text-ink-faint">%</span>
      </div>
      <input
        type="range"
        min={-15}
        max={-2}
        step={0.5}
        value={Number(displayPct)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 accent-brand"
      />
      <span className="w-20 text-right font-mono text-xs text-amber-200">
        {`${displayPct}%`} daily
      </span>
    </div>
  );
}

/**
 * Input для одного sleeve (bot / manual). Внутри держим долю (0..0.4),
 * пользователю показываем процент. Range slider от 0 до 25%.
 */
function SleeveInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const displayPct = (value * 100).toFixed(1);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-surface-border bg-[rgba(8,12,20,0.4)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {label}
        </span>
        <span className="font-mono text-xs text-brand-light">
          {displayPct}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={25}
        step={0.5}
        value={Number(displayPct)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(0, Math.min(0.4, n / 100)));
        }}
        className="w-full accent-brand"
      />
    </div>
  );
}
