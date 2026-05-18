"use client";

import dynamic from "next/dynamic";
import { ArrowRight, Crown, Layers2, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { formatPercent, prettySymbol } from "@/lib/portfolio/format";
import type { Data, Layout } from "plotly.js";
import type { StrategyResult } from "@/lib/portfolio/strategyTypes";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  strategy: StrategyResult | null;
  symbols: string[];
  /** Bot & manual sleeves get a fixed 10% of total fund AUM. */
  botSleeve?: number;
  manualSleeve?: number;
}

const SPOT_PALETTE = [
  "#c9a962",
  "#e6c989",
  "#8aa6c4",
  "#a78bfa",
  "#22d3ee",
  "#4ade80",
  "#fb923c",
  "#f472b6",
  "#facc15",
  "#38bdf8",
];

/**
 * Premium "Recommended Fund Allocation" view.
 *   - Left donut: spot allocation (the Final Fund strategy weights).
 *   - Right donut: total fund (spot × (1 - bot - manual) + bot + manual).
 *   - Explanation card: why these weights — BL → caps → CVaR defense.
 */
export function RecommendedTab({
  strategy,
  symbols,
  botSleeve = 0.05,
  manualSleeve = 0.05,
}: Props) {
  const spotRows = useMemo(
    () =>
      !strategy
        ? []
        : strategy.weights
            .map((w, i) => ({ symbol: symbols[i] ?? `#${i}`, weight: w }))
            .filter((r) => r.weight > 0.002)
            .sort((a, b) => b.weight - a.weight),
    [strategy, symbols]
  );

  const spotScale = Math.max(0, 1 - botSleeve - manualSleeve);
  const totalRows = useMemo(() => {
    const rows = spotRows.map((r) => ({
      symbol: r.symbol,
      label: prettySymbol(r.symbol),
      weight: r.weight * spotScale,
    }));
    rows.push({ symbol: "BOT", label: "Bot strategies", weight: botSleeve });
    rows.push({ symbol: "MANUAL", label: "Manual book", weight: manualSleeve });
    return rows;
  }, [spotRows, botSleeve, manualSleeve, spotScale]);

  if (!strategy) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-8 text-center text-sm text-ink-muted">
        Final Fund Portfolio ещё не рассчитан.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">fund pick</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-display-tight text-ink sm:text-[2.25rem]">
          <span className="accent-serif text-brand-light">Recommended</span> Fund Allocation
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Black-Litterman базовые веса → risk caps → CVaR-защита. Premium-картинка
          с двумя срезами: spot-портфель и общий портфель фонда.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AllocationCard
          title="Spot allocation"
          subtitle="Прямые позиции в крипте (без бот/manual слоёв)"
          rows={spotRows.map((r) => ({ ...r, label: prettySymbol(r.symbol) }))}
          highlight
        />
        <AllocationCard
          title="Total fund allocation"
          subtitle={`Spot × ${(spotScale * 100).toFixed(0)}% + Bot ${(botSleeve * 100).toFixed(0)}% + Manual ${(manualSleeve * 100).toFixed(0)}%`}
          rows={totalRows}
        />
      </section>

      <section className="rounded-2xl border border-brand/30 bg-surface p-6 backdrop-blur-xl shadow-glow">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-brand-light">
            Why this allocation
          </h3>
        </div>
        <ul className="mt-4 grid gap-3 text-sm text-ink sm:grid-cols-2">
          <Reason
            icon={<Layers2 size={14} />}
            title="Black-Litterman prior + tilt"
            body="Стартуем с market-cap equilibrium и накладываем views: BTC/ETH — высокая уверенность, альты — умеренная. Получаем посмtрнее распределение, чем чистый Sharpe."
          />
          <Reason
            icon={<ShieldCheck size={14} />}
            title="Risk caps как policy floor"
            body="Жёсткие ограничения: BTC 45–65%, ETH 15–25%, мелкие альты суммарно ≤ 8%. После каждого пересчёта проверяется, что фактические веса им соответствуют."
          />
          <Reason
            icon={<ArrowRight size={14} />}
            title="CVaR-95 защита"
            body="Если CVaR-95 хуже -8% в день, +10% веса автоматически переезжает в BTC/ETH. Это не итеративная оптимизация, но достаточно для контроля хвоста."
          />
          <Reason
            icon={<Crown size={14} />}
            title="Sleeve диверсификация"
            body="10% от общего портфеля резервируется под бот-стратегии и manual-управление — это снижает корреляцию книги с чистым spot."
          />
        </ul>
        {strategy.warning && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {strategy.warning}
          </p>
        )}
      </section>

      <p className="fund-disclaimer">
        This is a quantitative research model, not financial advice.
      </p>
    </div>
  );
}

function AllocationCard({
  title,
  subtitle,
  rows,
  highlight,
}: {
  title: string;
  subtitle: string;
  rows: { symbol: string; label: string; weight: number }[];
  highlight?: boolean;
}) {
  const colored = rows.map((r, i) => ({
    ...r,
    color: r.symbol === "BOT"
      ? "#22d3ee"
      : r.symbol === "MANUAL"
        ? "#a78bfa"
        : SPOT_PALETTE[i % SPOT_PALETTE.length],
  }));
  return (
    <div
      className={`rounded-2xl border bg-surface p-5 backdrop-blur-xl shadow-card ${
        highlight ? "border-brand/30 shadow-glow" : "border-surface-border"
      }`}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p>
        </div>
      </header>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr] md:items-center">
        <div className="h-[260px]">
          <DonutChart rows={colored} />
        </div>
        <ul className="space-y-1.5">
          {colored.map((r) => (
            <li
              key={r.symbol}
              className="flex items-center justify-between rounded-md border border-surface-border/60 bg-white/[0.02] px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-ink">{r.label}</span>
              </div>
              <span className="font-mono text-ink">
                {formatPercent(r.weight, 1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DonutChart({
  rows,
}: {
  rows: { symbol: string; label: string; weight: number; color: string }[];
}) {
  const data: Data[] = [
    {
      type: "pie",
      hole: 0.62,
      labels: rows.map((r) => r.label),
      values: rows.map((r) => r.weight),
      marker: {
        colors: rows.map((r) => r.color),
        line: { color: "rgba(8,12,20,0.95)", width: 2 },
      },
      textinfo: "none",
      hovertemplate: "%{label}: %{percent}<extra></extra>",
      sort: false,
    },
  ];
  const layout: Partial<Layout> = {
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#d4d4d8", family: "ui-sans-serif, system-ui" },
    margin: { l: 5, r: 5, t: 5, b: 5 },
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

function Reason({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-surface-border bg-white/[0.02] p-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-brand-light">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  );
}
