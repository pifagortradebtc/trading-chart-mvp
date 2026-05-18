"use client";

import dynamic from "next/dynamic";
import { AlertOctagon, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPercent, prettySymbol } from "@/lib/portfolio/format";
import {
  DEFAULT_ALT_SHOCK,
  SCENARIO_LIBRARY,
  runStressTest,
} from "@/lib/portfolio/cvarStress";
import { tailRiskContribution } from "@/lib/portfolio/strategyMetrics";
import type { Data, Layout } from "plotly.js";
import type {
  StrategyResult,
} from "@/lib/portfolio/strategyTypes";
import type { PriceSeries } from "@/lib/portfolio/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  strategies: StrategyResult[] | null;
  symbols: string[];
  priceSeries: PriceSeries[] | null;
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * Stress-test workbench:
 *   - Dropdown picks a strategy to stress-test.
 *   - Cards show historical CVaR-95/99 + worst-day & max-DD.
 *   - Scenario table runs three canonical shock vectors (+ user-editable shocks).
 *   - Bar chart breaks the historical CVaR-95 down by asset contribution.
 */
export function StressTestTab({
  strategies,
  symbols,
  priceSeries,
  activeId,
  onSelect,
}: Props) {
  const [customShocks, setCustomShocks] = useState<Record<string, number>>({});
  const [showCustom, setShowCustom] = useState(false);

  const active = strategies?.find((s) => s.id === activeId) ?? strategies?.[0];

  const contributions = useMemo(() => {
    if (!active || !priceSeries) return [];
    return tailRiskContribution(active.weights, priceSeries, 0.95);
  }, [active, priceSeries]);

  if (!strategies || !active || !priceSeries) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-8 text-center text-sm text-ink-muted">
        Стресс-тест станет доступен после первого расчёта стратегий.
      </div>
    );
  }

  const scenarios = SCENARIO_LIBRARY.map((sc) => {
    const result = runStressTest(active.weights, symbols, sc.shocks);
    return { ...sc, result };
  });

  const customResult = showCustom
    ? runStressTest(active.weights, symbols, customShocks)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">tail-risk workbench</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-display-tight text-ink">
            CVaR &amp; <span className="accent-serif text-brand-light">Stress</span> Test
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Историческая хвостовая статистика плюс сценарные шоки. Числа CVaR —
            ежедневные (среднее по худшим 5% и 1% дней).
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Стратегия:
          <select
            value={active.id}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-md border border-surface-border bg-[rgba(8,12,20,0.6)] px-3 py-1.5 text-sm text-ink focus:border-brand/50 focus:outline-none"
          >
            {strategies.map((s) => (
              <option key={s.id} value={s.id} className="bg-[var(--bg-deep)]">
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="CVaR 95% (daily)"
          value={formatPercent(active.metrics.cvar95, 2)}
          tone="negative"
          help="Среднее портфельной доходности в худших 5% дней истории."
        />
        <MetricCard
          label="CVaR 99% (daily)"
          value={formatPercent(active.metrics.cvar99, 2)}
          tone="negative"
          help="Среднее по худшим 1% дней — экстремальный хвост."
        />
        <MetricCard
          label="Max drawdown"
          value={formatPercent(active.metrics.maxDrawdown, 1)}
          tone="negative"
          help="Историческое peak-to-trough на окне симуляции."
        />
        <MetricCard
          label="Sharpe / Sortino"
          value={`${active.metrics.sharpe.toFixed(2)} / ${active.metrics.sortino.toFixed(2)}`}
          tone="neutral"
          help="Контекст для оценки качества хвоста."
        />
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface backdrop-blur-xl shadow-card">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertOctagon size={14} className="text-amber-300" />
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
              Scenario shocks
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="text-[11px] text-ink-muted underline-offset-2 hover:text-brand-light hover:underline"
          >
            {showCustom ? "Скрыть custom" : "+ Custom scenario"}
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-deep)]/40 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              <tr className="border-b border-surface-border">
                <th className="px-4 py-2 text-left font-medium">Scenario</th>
                <th className="px-3 py-2 text-right font-medium">Portfolio loss</th>
                <th className="px-3 py-2 text-left font-medium">Top contributor</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((sc) => (
                <tr
                  key={sc.name}
                  className="border-b border-surface-border/60 transition hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-2.5 font-medium text-ink">{sc.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-200">
                    {formatPercent(sc.result.portfolioLoss, 1)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-ink">
                    {prettySymbol(sc.result.topContributor.symbol)}{" "}
                    <span className="text-ink-faint">
                      ({formatPercent(sc.result.topContributor.contribution, 1)})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-muted">
                    {sc.description}
                  </td>
                </tr>
              ))}
              {customResult && (
                <tr className="border-b border-brand/30 bg-brand/[0.04]">
                  <td className="px-4 py-2.5 font-medium text-brand-light">Custom</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-200">
                    {formatPercent(customResult.portfolioLoss, 1)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-ink">
                    {prettySymbol(customResult.topContributor.symbol)}{" "}
                    <span className="text-ink-faint">
                      ({formatPercent(customResult.topContributor.contribution, 1)})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-muted">
                    User-defined shocks.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCustom && (
        <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Custom shocks (per asset)
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {symbols.map((s) => (
              <ShockSlider
                key={s}
                symbol={s}
                value={customShocks[s] ?? DEFAULT_ALT_SHOCK}
                onChange={(v) =>
                  setCustomShocks({ ...customShocks, [s]: v })
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-surface-border bg-surface p-3 backdrop-blur-xl shadow-card">
        <div className="flex items-center gap-2 px-2 pt-2">
          <TrendingDown size={14} className="text-rose-300" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Per-asset tail contribution (CVaR-95)
          </h3>
        </div>
        <div className="mt-2 h-[340px]">
          <ContributionChart contributions={contributions} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  help,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  help: string;
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-200"
        : "text-ink";
  return (
    <div className="rounded-xl border border-surface-border bg-gradient-to-br from-white/[0.03] to-transparent p-4">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${valueColor}`}>
        {value}
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">{help}</p>
    </div>
  );
}

function ShockSlider({
  symbol,
  value,
  onChange,
}: {
  symbol: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-ink">
          {prettySymbol(symbol)}
        </span>
        <span className="font-mono text-xs text-rose-200">
          {formatPercent(value, 0)}
        </span>
      </div>
      <input
        type="range"
        min={-0.9}
        max={0}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </div>
  );
}

function ContributionChart({
  contributions,
}: {
  contributions: { symbol: string; contribution: number }[];
}) {
  const sorted = [...contributions].sort((a, b) => a.contribution - b.contribution);
  const data: Data[] = [
    {
      type: "bar",
      orientation: "h",
      x: sorted.map((c) => c.contribution),
      y: sorted.map((c) => prettySymbol(c.symbol)),
      marker: {
        color: sorted.map((c) =>
          c.contribution < 0 ? "rgba(244,63,94,0.8)" : "rgba(74,222,128,0.7)"
        ),
        line: { color: "rgba(0,0,0,0.3)", width: 1 },
      },
      hovertemplate: "%{y}: %{x:.4f}<extra></extra>",
    },
  ];
  const layout: Partial<Layout> = {
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#d4d4d8", family: "ui-sans-serif, system-ui" },
    margin: { l: 60, r: 20, t: 20, b: 40 },
    xaxis: {
      title: { text: "w_i · mean(asset return on worst-5% days)", font: { size: 11 } },
      gridcolor: "rgba(255,255,255,0.06)",
      zerolinecolor: "rgba(255,255,255,0.15)",
      tickfont: { color: "#a1a1aa", size: 10 },
    },
    yaxis: {
      tickfont: { color: "#e4e4e7", size: 11 },
    },
    showlegend: false,
  };
  return (
    <Plot
      data={data}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      config={{
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
      }}
    />
  );
}
