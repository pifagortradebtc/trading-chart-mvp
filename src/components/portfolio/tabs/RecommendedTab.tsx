"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  ClipboardCopy,
  Crown,
  Layers2,
  Network,
  Printer,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatPercent, prettySymbol } from "@/lib/portfolio/format";
import { portfolioDailyReturns } from "@/lib/portfolio/strategyMetrics";
import type { Data, Layout } from "plotly.js";
import type { StrategyResult } from "@/lib/portfolio/strategyTypes";
import type { PriceSeries } from "@/lib/portfolio/types";
import type { AssetDataQuality } from "@/lib/portfolio/dataQuality";
import { computeConfidence } from "@/lib/portfolio/confidence";
import { aggregateByCluster, type ClusterExposure } from "@/lib/portfolio/clusters";
import { buildRotationSuggestions, type RotationSuggestion } from "@/lib/portfolio/rotation";
import { computeModelContributions, type ModelContribution } from "@/lib/portfolio/modelContribution";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  strategy: StrategyResult | null;
  symbols: string[];
  /** Aligned daily price series — used to build the historical equity curve. */
  priceSeries?: PriceSeries[] | null;
  botSleeve?: number;
  manualSleeve?: number;
  /** Daily CVaR-95 trigger from the policy editor, e.g. -0.08. */
  cvarDefenseThreshold?: number;
  /** Per-asset data-quality assessment from the worker — drives confidence + rebalance reasons. */
  dataQuality?: AssetDataQuality[] | null;
  /** All 9 strategies — used by the confidence "model agreement" factor. */
  allStrategies?: StrategyResult[] | null;
  /** Backtest window length in days. */
  windowDays?: number;
  /** Current portfolio weights entered by the operator (0..1 per symbol). */
  currentWeights?: Record<string, number>;
  onCurrentWeightsChange?: (next: Record<string, number>) => void;
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
  priceSeries,
  botSleeve = 0.05,
  manualSleeve = 0.05,
  cvarDefenseThreshold = -0.08,
  dataQuality,
  allStrategies,
  windowDays,
  currentWeights,
  onCurrentWeightsChange,
}: Props) {
  const sleeveTotalPct = ((botSleeve + manualSleeve) * 100).toFixed(0);
  const cvarPct = (cvarDefenseThreshold * 100).toFixed(1);
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

  const confidence = useMemo(() => {
    if (!strategy || !dataQuality || !allStrategies) return null;
    return computeConfidence({
      windowDays: windowDays ?? 0,
      dataQuality,
      finalStrategy: strategy,
      allStrategies,
      symbols,
    });
  }, [strategy, dataQuality, allStrategies, windowDays, symbols]);

  const clusterExposures = useMemo<ClusterExposure[]>(
    () => (strategy ? aggregateByCluster(strategy.weights, symbols) : []),
    [strategy, symbols]
  );

  const rotationSuggestions = useMemo<RotationSuggestion[]>(
    () =>
      strategy
        ? buildRotationSuggestions({
            weights: strategy.weights,
            symbols,
            dataQuality: dataQuality ?? null,
          })
        : [],
    [strategy, symbols, dataQuality]
  );

  const modelContributions = useMemo<ModelContribution[]>(
    () =>
      strategy && allStrategies
        ? computeModelContributions({
            finalWeights: strategy.weights,
            allStrategies,
            symbols,
          })
        : [],
    [strategy, allStrategies, symbols]
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
      <PrintCoverPage strategy={strategy} symbols={symbols} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">fund pick</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-display-tight text-ink sm:text-[2.25rem]">
            <span className="accent-serif text-brand-light">Recommended</span> Fund Allocation
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Black-Litterman базовые веса → risk caps → CVaR-защита. Premium-картинка
            с двумя срезами: spot-портфель и общий портфель фонда.
          </p>
        </div>
        <div className="print:hidden flex items-center gap-2">
          <CopyJsonButton
            strategy={strategy}
            symbols={symbols}
            spotRows={spotRows}
            totalRows={totalRows}
            botSleeve={botSleeve}
            manualSleeve={manualSleeve}
            cvarDefenseThreshold={cvarDefenseThreshold}
          />
          <PrintButton />
        </div>
      </header>

      {confidence ? (
        <ConfidenceBadge breakdown={confidence} />
      ) : (
        <ConfidencePlaceholder />
      )}

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

      {clusterExposures.length > 0 && (
        <ClusterExposureCard exposures={clusterExposures} />
      )}

      {strategy && onCurrentWeightsChange && (
        <RebalancePlan
          strategy={strategy}
          symbols={symbols}
          dataQuality={dataQuality ?? null}
          currentWeights={currentWeights ?? {}}
          onCurrentWeightsChange={onCurrentWeightsChange}
        />
      )}

      {rotationSuggestions.length > 0 && (
        <RotationSuggestionsCard suggestions={rotationSuggestions} />
      )}

      {modelContributions.length > 0 && (
        <ModelContributionCard contributions={modelContributions} />
      )}

      {priceSeries && priceSeries.length > 0 && (
        <EquitySection
          weights={strategy.weights}
          priceSeries={priceSeries}
          symbols={symbols}
        />
      )}

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
            body="Стартуем с market-cap equilibrium и накладываем views: BTC/ETH — высокая уверенность, альты — умеренная. Получаем более сбалансированное распределение, чем чистый Sharpe."
          />
          <Reason
            icon={<ShieldCheck size={14} />}
            title="Risk caps как policy floor"
            body="Жёсткие ограничения: BTC 45–65%, ETH 15–25%, мелкие альты суммарно ≤ 8%. После каждого пересчёта проверяется, что фактические веса им соответствуют."
          />
          <Reason
            icon={<ArrowRight size={14} />}
            title="CVaR-95 защита"
            body={`Если CVaR-95 хуже ${cvarPct}% в день, +10% веса автоматически переезжает в BTC/ETH. Это не итеративная оптимизация, но достаточно для контроля хвоста.`}
          />
          <Reason
            icon={<Crown size={14} />}
            title="Sleeve диверсификация"
            body={`${sleeveTotalPct}% от общего портфеля резервируется под бот-стратегии и manual-управление — это снижает корреляцию книги с чистым spot.`}
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

/**
 * Cover page shown only in print/PDF — превращает экспорт из «скриншот таба»
 * в нормальный титульный отчёт фонда. Скрыт на экране через `hidden print:block`.
 * `break-after: page` отделяет cover от основного содержимого.
 */
function PrintCoverPage({
  strategy,
  symbols,
}: {
  strategy: StrategyResult;
  symbols: string[];
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const top3 = [...strategy.weights]
    .map((w, i) => ({ symbol: symbols[i] ?? `#${i}`, weight: w }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => `${prettySymbol(r.symbol)} ${(r.weight * 100).toFixed(0)}%`)
    .join(" · ");

  return (
    <section
      className="hidden print:block print:break-after-page"
      aria-hidden="true"
    >
      <div className="flex h-[28rem] flex-col items-start justify-between py-12">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#8a6f2c] text-2xl font-semibold text-[#8a6f2c]">
              π
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-black">
                Pifagor Fund
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-neutral-500">
                Закрытый криптофонд
              </p>
            </div>
          </div>

          <h1 className="mt-16 font-display text-4xl font-semibold tracking-tight text-black">
            Allocation Research Report
          </h1>
          <p className="mt-3 max-w-xl font-serif italic text-lg text-neutral-700">
            Black-Litterman base, risk caps, CVaR-95 defense.
          </p>
        </div>

        <div className="w-full border-t border-neutral-300 pt-6">
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                Дата
              </p>
              <p className="mt-1 font-medium text-neutral-800">{dateStr}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                Модель
              </p>
              <p className="mt-1 font-medium text-neutral-800">{strategy.name}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                Ядро
              </p>
              <p className="mt-1 font-medium text-neutral-800">{top3}</p>
            </div>
          </div>
          <p className="mt-6 text-[10px] leading-relaxed text-neutral-500">
            Внутренний инструмент Pifagor Fund. Образовательная количественная
            модель — не публичная финансовая рекомендация. Прошлая доходность
            не гарантирует будущую.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Backtested equity curve under static rebalanced weights.
 *   - "Final Fund" line (gold): equity_t = 100 · exp(Σ portfolio log-returns).
 *   - "BTC-only" benchmark (muted): equity from BTC daily log-returns alone.
 * Both start at 100 on day 0 of the aligned window so they're directly comparable.
 */
function EquitySection({
  weights,
  priceSeries,
  symbols,
}: {
  weights: number[];
  priceSeries: PriceSeries[];
  symbols: string[];
}) {
  const { times, fundEquity, btcEquity, summary } = useMemo(() => {
    const dailyR = portfolioDailyReturns(weights, priceSeries);
    const ts = priceSeries[0]?.times ?? [];
    const fundEq = cumulativeEquity(dailyR, 100);

    const btcIdx = symbols.findIndex((s) => s === "BTCUSDT" || s === "BTCUSDC");
    let btcEq: number[] | null = null;
    if (btcIdx >= 0) {
      const btcPrices = priceSeries[btcIdx].prices;
      const btcR: number[] = [];
      for (let i = 1; i < btcPrices.length; i++) {
        btcR.push(Math.log(btcPrices[i] / btcPrices[i - 1]));
      }
      btcEq = cumulativeEquity(btcR, 100);
    }

    const last = fundEq[fundEq.length - 1] ?? 100;
    const ret = (last - 100) / 100;
    const dd = computeMaxDD(fundEq);

    return {
      times: ts,
      fundEquity: fundEq,
      btcEquity: btcEq,
      summary: { totalReturn: ret, finalEquity: last, maxDD: dd, windowDays: dailyR.length },
    };
  }, [weights, priceSeries, symbols]);

  if (fundEquity.length < 2) return null;

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Backtested equity curve
          </h3>
          <span className="font-mono text-[10px] text-ink-faint">
            $100 → ${summary.finalEquity.toFixed(0)} · {summary.windowDays} дней
          </span>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[11px]">
          <Stat
            label="Total"
            value={`${summary.totalReturn >= 0 ? "+" : ""}${(summary.totalReturn * 100).toFixed(1)}%`}
            tone={summary.totalReturn >= 0 ? "positive" : "negative"}
          />
          <Stat
            label="Max DD"
            value={`${(summary.maxDD * 100).toFixed(1)}%`}
            tone="negative"
          />
        </div>
      </header>
      <div className="mt-3 h-[320px]">
        <EquityChart times={times} fund={fundEquity} btc={btcEquity} />
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Гипотетический исторический backtest при фиксированных весах
        Final Fund Portfolio, без ребалансировки в течение окна. Прошлая
        доходность не гарантирует будущую.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  const cls = tone === "positive" ? "text-emerald-300" : "text-rose-300";
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <span className={cls}>{value}</span>
    </span>
  );
}

function EquityChart({
  times,
  fund,
  btc,
}: {
  times: number[];
  fund: number[];
  btc: number[] | null;
}) {
  // Align lengths defensively (cumulativeEquity adds 1 leading point).
  const tsDates = times.slice(0, fund.length).map((t) => new Date(t));
  const traces: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      x: tsDates,
      y: fund,
      line: { color: "#c9a962", width: 2.5 },
      name: "Final Fund",
      hovertemplate: "%{x|%Y-%m-%d}<br>$%{y:.1f}<extra>Final Fund</extra>",
    },
  ];
  if (btc && btc.length === fund.length) {
    traces.push({
      type: "scatter",
      mode: "lines",
      x: tsDates,
      y: btc,
      line: { color: "rgba(139,147,168,0.65)", width: 1.5, dash: "dot" },
      name: "BTC-only",
      hovertemplate: "%{x|%Y-%m-%d}<br>$%{y:.1f}<extra>BTC</extra>",
    });
  }
  const layout: Partial<Layout> = {
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#d4d4d8", family: "ui-sans-serif, system-ui" },
    margin: { l: 50, r: 20, t: 10, b: 40 },
    xaxis: {
      gridcolor: "rgba(255,255,255,0.05)",
      tickfont: { color: "#a1a1aa", size: 10 },
    },
    yaxis: {
      gridcolor: "rgba(255,255,255,0.05)",
      tickfont: { color: "#a1a1aa", size: 10 },
      tickprefix: "$",
    },
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: -0.18,
      bgcolor: "rgba(0,0,0,0)",
      font: { size: 10, color: "#a1a1aa" },
    },
    hoverlabel: {
      bgcolor: "#0c121c",
      bordercolor: "#c9a962",
      font: { color: "#e8eaf0", size: 11 },
    },
  };
  return (
    <Plot
      data={traces}
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

function cumulativeEquity(dailyLogReturns: number[], start: number): number[] {
  const out = new Array<number>(dailyLogReturns.length + 1);
  out[0] = start;
  let acc = 0;
  for (let i = 0; i < dailyLogReturns.length; i++) {
    acc += dailyLogReturns[i];
    out[i + 1] = start * Math.exp(acc);
  }
  return out;
}

function computeMaxDD(equity: number[]): number {
  let peak = equity[0] ?? 1;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = e / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

function CopyJsonButton({
  strategy,
  symbols,
  spotRows,
  totalRows,
  botSleeve,
  manualSleeve,
  cvarDefenseThreshold,
}: {
  strategy: StrategyResult;
  symbols: string[];
  spotRows: { symbol: string; weight: number }[];
  totalRows: { symbol: string; label: string; weight: number }[];
  botSleeve: number;
  manualSleeve: number;
  cvarDefenseThreshold: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      model: strategy.name,
      strategyId: strategy.id,
      symbols,
      spot: Object.fromEntries(spotRows.map((r) => [r.symbol, r.weight])),
      totalFund: Object.fromEntries(totalRows.map((r) => [r.symbol, r.weight])),
      metrics: {
        expectedReturn: strategy.metrics.expectedReturn,
        volatility: strategy.metrics.volatility,
        sharpe: strategy.metrics.sharpe,
        sortino: strategy.metrics.sortino,
        maxDrawdown: strategy.metrics.maxDrawdown,
        cvar95: strategy.metrics.cvar95,
        cvar99: strategy.metrics.cvar99,
        corrToBtc: strategy.metrics.corrToBtc,
        turnover: strategy.metrics.turnover,
      },
      policy: {
        cvarDefenseThreshold,
        botSleeve,
        manualSleeve,
      },
      warning: strategy.warning ?? null,
    };
    const text = JSON.stringify(snapshot, null, 2);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
      title="Скопировать веса и метрики в виде JSON-snapshot для отправки/архива"
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-300" />
          <span className="text-emerald-200">Copied</span>
        </>
      ) : (
        <>
          <ClipboardCopy size={11} />
          <span>Copy JSON</span>
        </>
      )}
    </button>
  );
}

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
      title="Распечатать или сохранить как PDF — print-стили адаптированы под белый фон"
    >
      <Printer size={11} />
      <span>Print · PDF</span>
    </button>
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

/**
 * Cold-start stub for Confidence: shown when persisted activeTab=recommended
 * brings the user here before the first worker round-trip completes. Lighter
 * border, dashed bar — visually distinct from the "real" badge so the user
 * doesn't read it as a finished verdict.
 */
function ConfidencePlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-surface/60 p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-semibold leading-none text-ink-faint">
            —
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
              Confidence
            </p>
            <p className="font-display text-lg font-semibold text-ink-muted">
              Awaiting calculation
            </p>
          </div>
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-dashed border-surface-border bg-transparent" />
          <p className="mt-2 text-[11px] leading-snug text-ink-muted">
            Бэйдж появится после первого расчёта — Confidence требует
            data quality, метрик финального портфеля и согласия моделей.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact confidence card: large gold number, level label, gradient progress bar,
 * collapsible breakdown of factors. Score is a heuristic triage signal — see
 * computeConfidence() docstring.
 */
function ConfidenceBadge({
  breakdown,
}: {
  breakdown: ReturnType<typeof computeConfidence>;
}) {
  const { score, level, factors } = breakdown;
  const levelTone =
    level === "high"
      ? { bar: "from-emerald-400 to-emerald-200", text: "text-emerald-300", label: "High" }
      : level === "medium"
        ? { bar: "from-brand to-brand-light", text: "text-brand-light", label: "Medium" }
        : { bar: "from-rose-500 to-rose-300", text: "text-rose-300", label: "Low" };

  const tooltipText = factors
    .map((f) => `${f.impact === "+" ? "+" : f.impact === "-" ? "−" : "·"} ${f.label}: ${f.detail}`)
    .join("\n");

  return (
    <details className="group rounded-2xl border border-brand/30 bg-surface p-5 backdrop-blur-xl shadow-glow">
      <summary
        className="flex cursor-pointer list-none flex-wrap items-center gap-5"
        title={tooltipText}
      >
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-semibold leading-none text-brand">
            {score}
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
              Confidence
            </p>
            <p className={`font-display text-lg font-semibold ${levelTone.text}`}>
              {levelTone.label}
            </p>
          </div>
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${levelTone.bar}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-muted">
            Эвристический сводный сигнал «стоит ли действовать по этой рекомендации сегодня».
            Не posterior, а triage-метрика — кликните, чтобы раскрыть факторы.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint group-open:hidden">
          ▾ детали
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint group-open:inline">
          ▴ скрыть
        </span>
      </summary>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {factors.map((f, i) => {
          const tone =
            f.impact === "+"
              ? "text-emerald-300"
              : f.impact === "-"
                ? "text-rose-300"
                : "text-ink-muted";
          const sign = f.impact === "+" ? "+" : f.impact === "-" ? "−" : "·";
          return (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-surface-border bg-white/[0.02] px-3 py-2"
            >
              <span className={`font-mono text-xs ${tone}`}>{sign}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {f.label}{" "}
                  <span className={`font-mono text-[10px] ${tone}`}>
                    {f.points >= 0 ? "+" : ""}
                    {f.points}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                  {f.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * Operator-facing rebalance plan.
 *   - User enters current weights (per symbol, %), targets come from strategy.
 *   - Delta vs target classified into HOLD / BUY / SELL / WATCH ONLY with
 *     a tolerance band (3% BTC/ETH, 2% major alts, 1% small/limited).
 *   - Priority bucket (High / Medium / Low) by |delta|.
 *   - Reason combines data quality status + delta sign.
 *
 * Current weights are persisted in localStorage via the parent.
 */
function RebalancePlan({
  strategy,
  symbols,
  dataQuality,
  currentWeights,
  onCurrentWeightsChange,
}: {
  strategy: StrategyResult;
  symbols: string[];
  dataQuality: AssetDataQuality[] | null;
  currentWeights: Record<string, number>;
  onCurrentWeightsChange: (next: Record<string, number>) => void;
}) {
  const dqBySymbol = new Map<string, AssetDataQuality>();
  if (dataQuality) for (const d of dataQuality) dqBySymbol.set(d.symbol, d);

  const MAJOR_ALTS = new Set(["SOLUSDT", "BNBUSDT", "XRPUSDT"]);
  const bandOf = (symbol: string): number => {
    const dq = dqBySymbol.get(symbol);
    if (dq && (dq.status === "limited" || dq.status === "very-limited" || dq.status === "no-data")) {
      return 0.01;
    }
    if (symbol === "BTCUSDT" || symbol === "ETHUSDT") return 0.03;
    if (MAJOR_ALTS.has(symbol)) return 0.02;
    return 0.01;
  };

  type Row = {
    symbol: string;
    current: number;
    target: number;
    delta: number;
    band: number;
    action: "HOLD" | "BUY" | "INCREASE" | "SELL" | "REDUCE" | "WATCH ONLY";
    priority: "High" | "Medium" | "Low";
    reason: string;
  };

  const rows: Row[] = strategy.weights.map((target, i) => {
    const symbol = symbols[i] ?? `#${i}`;
    const current = currentWeights[symbol] ?? 0;
    const delta = target - current;
    const band = bandOf(symbol);
    const absD = Math.abs(delta);
    const dq = dqBySymbol.get(symbol);
    const noData = dq?.status === "no-data";

    let action: Row["action"];
    if (noData) {
      action = "WATCH ONLY";
    } else if (absD <= band) {
      action = "HOLD";
    } else if (delta > 0) {
      action = current > 0.001 ? "INCREASE" : "BUY";
    } else {
      action = current > target + band ? "REDUCE" : "SELL";
    }

    const priority: Row["priority"] = absD >= 0.05 ? "High" : absD >= 0.02 ? "Medium" : "Low";

    const parts: string[] = [];
    if (dq && dq.status !== "good") parts.push(dq.reason);
    if (action === "HOLD") parts.push("в полосе допуска");
    else if (action === "WATCH ONLY") parts.push("исключён, наблюдаем");
    else if (delta > 0) parts.push("ниже таргета");
    else parts.push("выше таргета");
    const reason = parts.join(" · ");

    return { symbol, current, target, delta, band, action, priority, reason };
  });

  // Summary
  let buys = 0;
  let sells = 0;
  let holds = 0;
  let turnover = 0;
  for (const r of rows) {
    turnover += Math.abs(r.delta);
    if (r.action === "BUY" || r.action === "INCREASE") buys++;
    else if (r.action === "SELL" || r.action === "REDUCE") sells++;
    else if (r.action === "HOLD") holds++;
  }
  // L1 turnover counts both legs; divide by 2 for one-side turnover.
  const turnoverOneSide = turnover / 2;

  const handleEdit = (symbol: string, pct: number) => {
    const next = { ...currentWeights };
    if (!Number.isFinite(pct) || pct <= 0) delete next[symbol];
    else next[symbol] = Math.max(0, Math.min(1, pct / 100));
    onCurrentWeightsChange(next);
  };

  const resetToTarget = () => {
    const next: Record<string, number> = {};
    for (let i = 0; i < symbols.length; i++) next[symbols[i]] = strategy.weights[i];
    onCurrentWeightsChange(next);
  };
  const resetToZero = () => onCurrentWeightsChange({});

  const actionColor = (a: Row["action"]) => {
    if (a === "BUY" || a === "INCREASE") return "text-emerald-300";
    if (a === "SELL" || a === "REDUCE") return "text-rose-300";
    if (a === "WATCH ONLY") return "text-amber-200";
    return "text-ink-faint";
  };
  const priorityColor = (p: Row["priority"]) =>
    p === "High" ? "text-rose-200" : p === "Medium" ? "text-amber-200" : "text-ink-faint";

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Rebalance Plan
          </h3>
          <span className="font-mono text-[10px] text-ink-faint">
            turnover ~{(turnoverOneSide * 100).toFixed(1)}% ·{" "}
            <span className="text-emerald-300">{buys} buy</span> ·{" "}
            <span className="text-rose-300">{sells} sell</span> ·{" "}
            <span className="text-ink-faint">{holds} hold</span>
          </span>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={resetToTarget}
            className="rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
            title="Сбросить current = target (всё в равновесии)"
          >
            current = target
          </button>
          <button
            type="button"
            onClick={resetToZero}
            className="rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
            title="Обнулить все current — портфель ещё не собран"
          >
            обнулить
          </button>
        </div>
      </header>

      <div className="overflow-auto">
        <table className="mt-3 w-full text-xs">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <tr className="border-b border-surface-border">
              <th className="px-2 py-2 text-left font-medium">Asset</th>
              <th className="px-2 py-2 text-right font-medium">Current %</th>
              <th className="px-2 py-2 text-right font-medium">Target %</th>
              <th className="px-2 py-2 text-right font-medium">Δ</th>
              <th className="px-2 py-2 text-left font-medium">Action</th>
              <th className="px-2 py-2 text-left font-medium">Priority</th>
              <th className="px-2 py-2 text-left font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                className="border-b border-surface-border/60"
              >
                <td className="px-2 py-2 font-mono text-sm text-ink">
                  {prettySymbol(r.symbol)}
                </td>
                <td className="px-2 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={
                      currentWeights[r.symbol] !== undefined
                        ? +(currentWeights[r.symbol] * 100).toFixed(2)
                        : ""
                    }
                    placeholder="0"
                    onChange={(e) => handleEdit(r.symbol, Number(e.target.value))}
                    className="w-20 rounded-md border border-surface-border bg-[rgba(8,12,20,0.6)] px-2 py-1 text-right font-mono text-xs text-ink outline-none [appearance:textfield] focus:border-brand/40 [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                  />
                </td>
                <td className="px-2 py-2 text-right font-mono text-ink">
                  {(r.target * 100).toFixed(1)}%
                </td>
                <td
                  className={`px-2 py-2 text-right font-mono ${
                    r.delta > 0 ? "text-emerald-300" : r.delta < 0 ? "text-rose-300" : "text-ink-faint"
                  }`}
                >
                  {r.delta >= 0 ? "+" : ""}
                  {(r.delta * 100).toFixed(1)}%
                </td>
                <td className={`px-2 py-2 font-mono text-[11px] ${actionColor(r.action)}`}>
                  {r.action}
                </td>
                <td className={`px-2 py-2 font-mono text-[11px] ${priorityColor(r.priority)}`}>
                  {r.priority}
                </td>
                <td className="px-2 py-2 text-[11px] text-ink-muted">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="fund-disclaimer mt-3">
        Plan не учитывает spread, комиссии биржи, маркет-импакт и slippage —
        для крупных ребалансировок добавьте 20-40bps буфера и разделите
        исполнение на несколько частей.
      </p>
    </section>
  );
}

/**
 * Stacked horizontal bar showing fund exposure across taxonomy clusters
 * (Core / Infra / High-beta L1 / Exchange / Alpha / Meme / Other). Empty
 * clusters are hidden — the bar only shows what's actually allocated.
 *
 * Each row below the bar lists cluster weight, soft-ceiling, and members.
 */
function ClusterExposureCard({ exposures }: { exposures: ClusterExposure[] }) {
  const visible = exposures.filter((e) => e.weight > 0.001);
  if (visible.length === 0) return null;
  const total = visible.reduce((s, e) => s + e.weight, 0);
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Cluster exposure
          </h3>
        </div>
        <span className="font-mono text-[10px] text-ink-faint">
          Таксономия фонда · soft-ceilings advisory
        </span>
      </header>

      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full border border-surface-border bg-white/[0.03]"
        role="img"
        aria-label="Распределение по кластерам"
      >
        {visible.map((e) => (
          <span
            key={e.cluster.id}
            title={`${e.cluster.label}: ${(e.weight * 100).toFixed(1)}% (soft-ceiling ${(e.cluster.softCeiling * 100).toFixed(0)}%)`}
            style={{
              width: `${(e.weight / total) * 100}%`,
              backgroundColor: e.cluster.color,
            }}
          />
        ))}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {visible.map((e) => {
          const overshoot = e.overshoot > 0.005;
          return (
            <li
              key={e.cluster.id}
              className={`rounded-xl border bg-white/[0.02] px-3 py-2 ${
                overshoot ? "border-amber-500/30" : "border-surface-border"
              }`}
              title={e.cluster.description}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: e.cluster.color }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    {e.cluster.label}
                  </span>
                </div>
                <span className="font-mono text-xs text-ink">
                  {(e.weight * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
                <span>
                  soft-ceiling {(e.cluster.softCeiling * 100).toFixed(0)}%
                  {overshoot && (
                    <span className="ml-2 text-amber-300">
                      +{(e.overshoot * 100).toFixed(1)}pp
                    </span>
                  )}
                </span>
                <span className="truncate text-right">
                  {e.members
                    .slice(0, 3)
                    .map((m) => prettySymbol(m.symbol))
                    .join(" · ") || "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Strategic-level rotation tickets layered on top of Rebalance Plan.
 * Each row is "Trim X by N%, route into Y" with priority + driving rule.
 */
function RotationSuggestionsCard({
  suggestions,
}: {
  suggestions: RotationSuggestion[];
}) {
  const sourceLabel: Record<RotationSuggestion["source"], string> = {
    "data-quality": "Data quality",
    "cluster-overshoot": "Cluster",
    "core-deficit": "Core deficit",
  };
  const sourceTone: Record<RotationSuggestion["source"], string> = {
    "data-quality": "text-rose-300",
    "cluster-overshoot": "text-amber-200",
    "core-deficit": "text-brand-light",
  };
  const priorityTone: Record<RotationSuggestion["priority"], string> = {
    High: "text-rose-200",
    Medium: "text-amber-200",
    Low: "text-ink-faint",
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Rotation suggestions
          </h3>
        </div>
        <span className="font-mono text-[10px] text-ink-faint">
          {suggestions.length} тикет{suggestions.length === 1 ? "" : suggestions.length < 5 ? "а" : "ов"} ·
          Data-quality + кластерные потолки + core floor
        </span>
      </header>

      <div className="overflow-auto">
        <table className="mt-3 w-full text-xs">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <tr className="border-b border-surface-border">
              <th className="px-2 py-2 text-left font-medium">Trim from</th>
              <th className="px-2 py-2 text-left font-medium">Add to</th>
              <th className="px-2 py-2 text-right font-medium">Δ</th>
              <th className="px-2 py-2 text-left font-medium">Reason</th>
              <th className="px-2 py-2 text-left font-medium">Driver</th>
              <th className="px-2 py-2 text-left font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s, i) => (
              <tr key={i} className="border-b border-surface-border/60">
                <td className="px-2 py-2 font-mono text-rose-200">
                  −{(s.trim.reduceBy * 100).toFixed(1)}% {prettySymbol(s.trim.symbol)}
                </td>
                <td className="px-2 py-2 font-mono text-emerald-300">
                  +{(s.add.addBy * 100).toFixed(1)}% {prettySymbol(s.add.symbol)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-ink">
                  {(s.trim.reduceBy * 100).toFixed(1)}pp
                </td>
                <td className="px-2 py-2 text-[11px] text-ink-muted">{s.reason}</td>
                <td className={`px-2 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ${sourceTone[s.source]}`}>
                  {sourceLabel[s.source]}
                </td>
                <td className={`px-2 py-2 font-mono text-[11px] ${priorityTone[s.priority]}`}>
                  {s.priority}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="fund-disclaimer mt-3">
        Эвристические тикеты, не результат оптимизации. Каждый — независимая
        переброска веса; применять последовательно с пересчётом метрик.
      </p>
    </section>
  );
}

/**
 * "Which models drove the final allocation."
 *   - Influence bar: 1 − L1(model, final)/2, normalized to 0..100%.
 *   - Top effects: three assets where this model voted hardest vs final.
 *     Positive delta = model pushed for *more* of this asset.
 */
function ModelContributionCard({
  contributions,
}: {
  contributions: ModelContribution[];
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Workflow size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Model contribution
          </h3>
        </div>
        <span className="font-mono text-[10px] text-ink-faint">
          Influence = 1 − L1(model, final)/2 · ближе к 100% значит модель ближе к итогу
        </span>
      </header>

      <div className="overflow-auto">
        <table className="mt-3 w-full text-xs">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <tr className="border-b border-surface-border">
              <th className="px-2 py-2 text-left font-medium">Model</th>
              <th className="px-2 py-2 text-left font-medium">Influence</th>
              <th className="px-2 py-2 text-left font-medium">Top effects vs final</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((c) => (
              <tr key={c.modelId} className="border-b border-surface-border/60">
                <td className="px-2 py-2">
                  <div className="font-medium text-ink">{c.modelName}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {c.modelId}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light"
                        style={{ width: `${(c.influence * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-ink">
                      {(c.influence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {c.topEffects.map((e) => {
                      const sign = e.delta >= 0 ? "+" : "−";
                      const tone =
                        Math.abs(e.delta) < 0.005
                          ? "text-ink-faint"
                          : e.delta > 0
                            ? "text-emerald-300"
                            : "text-rose-300";
                      return (
                        <span
                          key={e.symbol}
                          className={`inline-flex items-center gap-1 rounded-md border border-surface-border bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] ${tone}`}
                        >
                          {prettySymbol(e.symbol)}
                          <span>
                            {sign}
                            {(Math.abs(e.delta) * 100).toFixed(1)}%
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
