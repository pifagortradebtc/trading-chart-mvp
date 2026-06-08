"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  ClipboardCopy,
  Crown,
  Droplets,
  Eye,
  Landmark,
  Layers2,
  Network,
  Printer,
  ScrollText,
  ShieldCheck,
  Timer,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { buildWatchlist, type WatchlistEntry } from "@/lib/portfolio/watchlist";
import { buildWhyNarrative, type WhyParagraph } from "@/lib/portfolio/whyTheseWeights";
import { walkForwardHRPEquity, type WalkForwardResult } from "@/lib/portfolio/walkForward";
import {
  assessLiquidity,
  basketLiquidityScore,
  formatUsdShort,
  type LiquidityAssessment,
  type LiquidityTier,
} from "@/lib/portfolio/liquidity";
import { buildNavExport } from "@/lib/portfolio/navExport";
import type { ViewInput } from "@/lib/portfolio/strategyTypes";
import type { RecommendationMode } from "@/lib/portfolio/recommendationModes";
import { recordRun } from "@/lib/portfolio/engineRuns";
import {
  deltaVsLive,
  useLiveFundComposition,
  type FundDelta,
} from "@/lib/portfolio/fundBridge";

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
  /** All strategies — used by confidence "model agreement" + Why narrative. */
  allStrategies?: StrategyResult[] | null;
  /** Backtest window length in days. */
  windowDays?: number;
  /** Current portfolio weights entered by the operator (0..1 per symbol). */
  currentWeights?: Record<string, number>;
  onCurrentWeightsChange?: (next: Record<string, number>) => void;
  /** Active Black-Litterman views — needed for the Why narrative. */
  views?: ViewInput[];
  /** Метаданные текущего расчёта engine — для записи в Journal при Copy NAV. */
  engineMeta?: {
    paramsHash: string;
    mode: RecommendationMode;
    liveMarketCapsUsed: boolean;
  };
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
  views,
  engineMeta,
}: Props) {
  const sleeveTotalPct = ((botSleeve + manualSleeve) * 100).toFixed(0);
  const cvarPct = (cvarDefenseThreshold * 100).toFixed(1);
  const spotRows = useMemo(
    () =>
      !strategy
        ? []
        : strategy.weights
            // Раньше фильтровали `weight > 0.002` (выкидывали активы с 0%).
            // По запросу оператора: «надо чтобы даже если ноль — всё равно
            // отображалось». Все активы из universe видны в обоих donut'ах
            // независимо от того, сколько им выделил engine.
            .map((w, i) => ({ symbol: symbols[i] ?? `#${i}`, weight: w }))
            .sort((a, b) => b.weight - a.weight),
    [strategy, symbols]
  );

  // Liquidity must be computed first because Confidence and Rotation both consume it.
  const liquidityAssessments = useMemo<LiquidityAssessment[]>(
    () => (priceSeries ? assessLiquidity(priceSeries) : []),
    [priceSeries]
  );

  const basketLiquidity = useMemo(
    () =>
      strategy && liquidityAssessments.length === strategy.weights.length
        ? basketLiquidityScore(strategy.weights, liquidityAssessments)
        : null,
    [strategy, liquidityAssessments]
  );

  const confidence = useMemo(() => {
    if (!strategy || !dataQuality || !allStrategies) return null;
    return computeConfidence({
      windowDays: windowDays ?? 0,
      dataQuality,
      finalStrategy: strategy,
      allStrategies,
      symbols,
      basketLiquidity: basketLiquidity ?? undefined,
    });
  }, [strategy, dataQuality, allStrategies, windowDays, symbols, basketLiquidity]);

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
            liquidity: liquidityAssessments.length > 0 ? liquidityAssessments : null,
          })
        : [],
    [strategy, symbols, dataQuality, liquidityAssessments]
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

  const watchlist = useMemo<WatchlistEntry[]>(
    () =>
      strategy
        ? buildWatchlist({
            weights: strategy.weights,
            symbols,
            dataQuality: dataQuality ?? null,
          })
        : [],
    [strategy, symbols, dataQuality]
  );

  const whyNarrative = useMemo<WhyParagraph[]>(() => {
    if (!strategy || !allStrategies || !dataQuality) return [];
    return buildWhyNarrative({
      finalStrategy: strategy,
      allStrategies,
      symbols,
      dataQuality,
      views: views ?? [],
      cvarDefenseThreshold: cvarDefenseThreshold ?? -0.08,
      windowDays: windowDays ?? 0,
      clusterExposures,
      confidence,
    });
  }, [
    strategy,
    allStrategies,
    symbols,
    dataQuality,
    views,
    cvarDefenseThreshold,
    windowDays,
    clusterExposures,
    confidence,
  ]);

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
          <CopyNavExportButton
            weights={strategy.weights}
            symbols={symbols}
            sleeveFraction={botSleeve + manualSleeve}
            engineMeta={engineMeta}
            confidenceScore={confidence?.score}
          />
          <PrintButton />
        </div>
      </header>

      {confidence ? (
        <ConfidenceBadge breakdown={confidence} />
      ) : (
        <ConfidencePlaceholder />
      )}

      {whyNarrative.length > 0 && <WhyNarrativeCard paragraphs={whyNarrative} />}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AllocationCard
          title="Раскладка спот-куска"
          subtitle={`Веса внутри ${(spotScale * 100).toFixed(0)}%-ной спот-аллокации фонда. Строки суммируются до 100% внутри спота — не до 100% фонда.`}
          rows={spotRows.map((r) => ({ ...r, label: prettySymbol(r.symbol) }))}
          highlight
        />
        <AllocationCard
          title="Полный портфель фонда"
          subtitle={`Spot ${(spotScale * 100).toFixed(0)}% × состав слева + Bot ${(botSleeve * 100).toFixed(0)}% + Manual ${(manualSleeve * 100).toFixed(0)}% = 100% фонда.`}
          rows={totalRows}
        />
      </section>

      {clusterExposures.length > 0 && (
        <ClusterExposureCard exposures={clusterExposures} />
      )}

      {strategy && (
        <FundBridgeCard
          targetWeights={
            // strategy.weights — это number[]; собираем в Record по symbol
            (() => {
              const out: Record<string, number> = {};
              for (let i = 0; i < symbols.length; i++) {
                out[symbols[i]] = strategy.weights[i] ?? 0;
              }
              return out;
            })()
          }
          onImportCurrent={
            onCurrentWeightsChange
              ? (weights) => onCurrentWeightsChange(weights)
              : undefined
          }
          basketSymbols={symbols}
        />
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

      {watchlist.length > 0 && <WatchlistCard entries={watchlist} />}

      {liquidityAssessments.length > 0 && strategy && (
        <LiquidityCard
          assessments={liquidityAssessments}
          weights={strategy.weights}
          symbols={symbols}
          basketScore={basketLiquidity}
        />
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

      {priceSeries && priceSeries.length > 0 && (
        <WalkForwardSection priceSeries={priceSeries} />
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

/**
 * Copies a JSON payload matching the Криптофонд backend's
 * `PUT /admin/portfolio/composition` schema. Operator pastes the JSON into
 * the admin form (or curl with an admin cookie) — direct cross-domain POST
 * is intentionally not attempted: the cookie-bound JWT lives on the fund's
 * domain and would be unavailable here anyway.
 *
 * Hover tooltip surfaces the symbol whitelist + dust-drop policy so the
 * operator understands why some tickers may be absent.
 */
function CopyNavExportButton({
  weights,
  symbols,
  sleeveFraction,
  engineMeta,
  confidenceScore,
}: {
  weights: number[];
  symbols: string[];
  sleeveFraction: number;
  engineMeta?: {
    paramsHash: string;
    mode: RecommendationMode;
    liveMarketCapsUsed: boolean;
  };
  confidenceScore?: number;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    const exported = buildNavExport({ weights, symbols, sleeveFraction });
    if (exported.payload.items.length === 0) {
      setState("error");
      setTimeout(() => setState("idle"), 1800);
      return;
    }
    const wrapper = {
      generatedAt: new Date().toISOString(),
      target: "Криптофонд · PUT /admin/portfolio/composition",
      sumPercent: exported.sumPercent,
      warnings: exported.warnings,
      body: exported.payload,
    };
    const text = JSON.stringify(wrapper, null, 2);
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
      // Auto-record в Engine Run Journal: snapshot params + выданных весов.
      // Делаем fire-and-forget — clipboard уже отработал, ошибка записи не
      // должна влиять на UX. Без engineMeta (например, в тестах) не пишем.
      if (engineMeta && engineMeta.paramsHash) {
        const weightsBySymbol: Record<string, number> = {};
        for (let i = 0; i < symbols.length; i++) {
          if (typeof weights[i] === "number" && Number.isFinite(weights[i])) {
            weightsBySymbol[symbols[i]] = weights[i];
          }
        }
        recordRun({
          paramsHash: engineMeta.paramsHash,
          mode: engineMeta.mode,
          assets: [...symbols],
          weights: weightsBySymbol,
          confidence: typeof confidenceScore === "number" ? confidenceScore : 0,
          liveMarketCapsUsed: engineMeta.liveMarketCapsUsed,
          publishedAt: Date.now(),
        }).catch(() => {
          // tracked locally; journal will reflect this on next reload
        });
      }
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 1800);
    }
  };

  const label =
    state === "copied" ? "Copied" : state === "error" ? "Empty / Error" : "Copy NAV";
  const Icon = state === "copied" ? Check : Landmark;
  const tone =
    state === "copied"
      ? "border-emerald-500/30 text-emerald-200"
      : state === "error"
        ? "border-rose-500/30 text-rose-200"
        : "border-surface-border text-ink-muted hover:border-brand/40 hover:text-ink";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-md border bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition ${tone}`}
      title="Скопировать JSON в формате PUT /admin/portfolio/composition Криптофонда — символы BTC/ETH/BNB/SOL/OKB/MNT/HYPE/TON, проценты 0-100, сумма ровно 100. Sleeve превращается в CASH USDT."
    >
      <Icon size={11} className={state === "copied" ? "text-emerald-300" : undefined} />
      <span>{label}</span>
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
            title={`${e.cluster.label}: ${(e.weight * 100).toFixed(1)}%${e.cluster.softCeiling >= 1 ? " (без ограничения)" : ` (soft-ceiling ${(e.cluster.softCeiling * 100).toFixed(0)}%)`}`}
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
                  {e.cluster.softCeiling >= 1
                    ? "без ограничения"
                    : `soft-ceiling ${(e.cluster.softCeiling * 100).toFixed(0)}%`}
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
    liquidity: "Liquidity",
  };
  const sourceTone: Record<RotationSuggestion["source"], string> = {
    "data-quality": "text-rose-300",
    "cluster-overshoot": "text-amber-200",
    "core-deficit": "text-brand-light",
    liquidity: "text-sky-300",
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
 * Liquidity Card — per-asset USD-volume tier + basket-level score.
 *
 * Source: Binance daily base-volume × close (proxy for daily USD volume).
 * Four tiers (blue / green / yellow / red) drive the executable-ticket
 * recommendation; basket score aggregates by portfolio weight and penalizes
 * red/yellow exposure. Surfaces capacity for the operator before they
 * try to size up.
 */
function LiquidityCard({
  assessments,
  weights,
  symbols,
  basketScore,
}: {
  assessments: LiquidityAssessment[];
  weights: number[];
  symbols: string[];
  basketScore: number | null;
}) {
  const tierTone: Record<LiquidityTier, { dot: string; chip: string; label: string }> = {
    blue: { dot: "bg-sky-300", chip: "text-sky-200", label: "Blue · Institutional" },
    green: { dot: "bg-emerald-300", chip: "text-emerald-200", label: "Green · Fund-tier" },
    yellow: { dot: "bg-amber-300", chip: "text-amber-200", label: "Yellow · Retail-large" },
    red: { dot: "bg-rose-400", chip: "text-rose-200", label: "Red · Thin" },
    "no-data": { dot: "bg-ink-faint/60", chip: "text-ink-faint", label: "No data" },
  };
  const bySymbol = new Map(assessments.map((a) => [a.symbol, a]));
  const sorted = symbols
    .map((sym, i) => ({ sym, weight: weights[i] ?? 0, a: bySymbol.get(sym) }))
    .filter((r) => r.a !== undefined)
    .sort((a, b) => b.weight - a.weight);

  const scoreTone =
    basketScore == null
      ? "text-ink-faint"
      : basketScore >= 80
        ? "text-emerald-300"
        : basketScore >= 60
          ? "text-brand-light"
          : basketScore >= 40
            ? "text-amber-200"
            : "text-rose-300";

  // Sum of avg daily USD volume across the basket, weighted by allocation.
  const weightedAdv = sorted.reduce(
    (s, r) => s + r.weight * (r.a?.avgDailyUsdVolume ?? 0),
    0
  );

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Droplets size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Liquidity layer
          </h3>
          <span className="font-mono text-[10px] text-ink-faint">
            30d ADV × close · max ticket = 5% ADV
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Basket
          </span>
          <span className={`font-display text-lg font-semibold ${scoreTone}`}>
            {basketScore != null ? `${basketScore}/100` : "—"}
          </span>
          <span className="font-mono text-[10px] text-ink-faint">
            ADV-weighted ≈ {formatUsdShort(weightedAdv)}
          </span>
        </div>
      </header>

      <div className="overflow-auto">
        <table className="mt-3 w-full text-xs">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <tr className="border-b border-surface-border">
              <th className="px-2 py-2 text-left font-medium">Asset</th>
              <th className="px-2 py-2 text-right font-medium">Weight</th>
              <th className="px-2 py-2 text-right font-medium">30d ADV</th>
              <th className="px-2 py-2 text-right font-medium">Latest day</th>
              <th className="px-2 py-2 text-left font-medium">Tier</th>
              <th className="px-2 py-2 text-right font-medium">Max ticket</th>
              <th className="px-2 py-2 text-left font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const a = r.a!;
              const tone = tierTone[a.tier];
              return (
                <tr key={r.sym} className="border-b border-surface-border/60">
                  <td className="px-2 py-2 font-mono text-sm text-ink">
                    {prettySymbol(r.sym)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-ink">
                    {(r.weight * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-ink">
                    {formatUsdShort(a.avgDailyUsdVolume)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-ink-muted">
                    {formatUsdShort(a.latestDailyUsdVolume)}
                  </td>
                  <td className={`px-2 py-2 font-mono text-[11px] ${tone.chip}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${tone.dot}`} />
                      {tone.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-ink">
                    {formatUsdShort(a.maxExecutableUsd)}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-ink-muted">{a.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="fund-disclaimer mt-3">
        Volume — base-asset volume Binance × close (USD-проксии). Max ticket =
        5% ADV (консервативно). Для крупных ребалансировок дробить исполнение,
        учитывать spread и комиссии биржи.
      </p>
    </section>
  );
}

/**
 * Walk-forward equity for HRP weights — retrains weights every `step` days on
 * a sliding training window and applies them out-of-sample. Pure OOS curve,
 * no look-ahead. Plotted as a single line with summary stats.
 *
 * Why HRP: parameter-free, cheap to retrain (no BL views, no MC cloud), and
 * a robust risk-only model — good honest benchmark for "what would this
 * basket have done under disciplined rebalancing."
 */
function WalkForwardSection({ priceSeries }: { priceSeries: PriceSeries[] }) {
  const wf = useMemo<WalkForwardResult | null>(
    () => walkForwardHRPEquity(priceSeries),
    [priceSeries]
  );
  if (!wf || wf.equity.length < 2) {
    return (
      <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
        <header className="flex items-center gap-2 border-b border-surface-border pb-3">
          <Timer size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Walk-forward (HRP)
          </h3>
        </header>
        <p className="mt-3 text-sm text-ink-muted">
          {wf?.warning ??
            "Истории недостаточно для walk-forward: нужно ≥395 дней (365 train + 30 step)."}
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Timer size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Walk-forward equity · HRP retrain
          </h3>
          <span className="font-mono text-[10px] text-ink-faint">
            train 365d · step 30d · {wf.rebalances} ребалансов · OOS
          </span>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[11px]">
          <Stat
            label="Total"
            value={`${wf.totalReturn >= 0 ? "+" : ""}${(wf.totalReturn * 100).toFixed(1)}%`}
            tone={wf.totalReturn >= 0 ? "positive" : "negative"}
          />
          <Stat label="Max DD" value={`${(wf.maxDrawdown * 100).toFixed(1)}%`} tone="negative" />
          <Stat
            label="Realized σ p.a."
            value={`${(wf.realizedVol * 100).toFixed(1)}%`}
            tone="negative"
          />
        </div>
      </header>
      <div className="mt-3 h-[260px]">
        <WalkForwardChart times={wf.times} equity={wf.equity} />
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Каждые 30 дней HRP-веса пересчитываются на последних 365 днях и
        применяются к следующим 30 дням OOS. Это честная out-of-sample
        репликация дисциплинированной квартальной ребалансировки — без
        look-ahead и без подгонки.
      </p>
    </section>
  );
}

function WalkForwardChart({ times, equity }: { times: number[]; equity: number[] }) {
  const tsDates = times.map((t) => new Date(t));
  const traces: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      x: tsDates,
      y: equity,
      line: { color: "#8aa6c4", width: 2 },
      name: "Walk-forward HRP",
      hovertemplate: "%{x|%Y-%m-%d}<br>$%{y:.1f}<extra>WF HRP</extra>",
    },
  ];
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
    showlegend: false,
    hoverlabel: {
      bgcolor: "#0c121c",
      bordercolor: "#8aa6c4",
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

/**
 * Narrative summary of the recommended allocation — five short paragraphs
 * answering "what's in the basket / which models / what risk framing /
 * what cluster shape / how confident." All text is generated from current
 * state; no LLM, no canned templates beyond fact substitution.
 */
function WhyNarrativeCard({ paragraphs }: { paragraphs: WhyParagraph[] }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Why these weights
          </h3>
        </div>
        <span className="font-mono text-[10px] text-ink-faint">
          Авто-наратив · факты из текущего state, не AI
        </span>
      </header>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {paragraphs.map((p, i) => (
          <li
            key={i}
            className="rounded-xl border border-surface-border bg-white/[0.02] p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
              {i + 1}. {p.heading}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              {p.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Watchlist — assets the fund tracks but does not currently hold (or holds
 * effectively zero). Three internal flavors (no-data / uncategorized /
 * effectively-zero) plus a small set of honorary tickers tracked for context.
 */
function WatchlistCard({ entries }: { entries: WatchlistEntry[] }) {
  const reasonLabel: Record<WatchlistEntry["reason"], string> = {
    "no-data": "No data",
    uncategorized: "Uncategorized",
    "effectively-zero": "≈ 0% weight",
    honorary: "Honorary",
  };
  const reasonTone: Record<WatchlistEntry["reason"], string> = {
    "no-data": "text-rose-300",
    uncategorized: "text-amber-200",
    "effectively-zero": "text-ink-faint",
    honorary: "text-brand-light",
  };
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Watchlist
          </h3>
        </div>
        <span className="font-mono text-[10px] text-ink-faint">
          Активы фонда «следим, но не покупаем» · {entries.length} запис{entries.length === 1 ? "ь" : entries.length < 5 ? "и" : "ей"}
        </span>
      </header>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map((e) => (
          <li
            key={`${e.reason}-${e.symbol}`}
            className="rounded-xl border border-surface-border bg-white/[0.02] p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm text-ink">
                {prettySymbol(e.symbol)}
              </span>
              <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${reasonTone[e.reason]}`}>
                {reasonLabel[e.reason]}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              {e.detail}
            </p>
            {e.currentWeight > 0 && (
              <p className="mt-1 font-mono text-[10px] text-ink-faint">
                текущий вес {(e.currentWeight * 100).toFixed(2)}%
              </p>
            )}
          </li>
        ))}
      </ul>
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

/** «обновлено N сек/мин назад» — short, no-second-precision human ago. */
function humanAgo(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return "только что";
  if (diffMs < 60_000) return `${Math.max(1, Math.floor(diffMs / 1000))} сек назад`;
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} мин назад`;
  return `${Math.floor(diffMs / 3600_000)} ч назад`;
}

/**
 * Δ vs Live Fund — read-only мост к Криптофонду.
 *
 * Auto-syncs current weights from the fund (every 60s + on focus). When the
 * fund's `/portfolio/public` endpoint runs in ledger-mode, weights reflect
 * live AUM (qty × current price) — so operator trades and price moves
 * propagate into Rebalance Plan automatically within ~30-60s.
 *
 * Если PIFAGOR_FUND_API_URL не задан или фонд недоступен — блок ничего не
 * рендерит (graceful: research работает standalone, без зависимости от
 * фонда).
 *
 * Конвенция: target = что engine рекомендует сейчас; live = что в фонде
 * (live AUM-weighted из ledger'а либо последняя operator-set раскладка,
 * см. data.source). Δ = target - live; BUY если положительная (надо
 * докупить), SELL если отрицательная.
 */
function FundBridgeCard({
  targetWeights,
  basketSymbols,
  onImportCurrent,
}: {
  targetWeights: Record<string, number>;
  basketSymbols: string[];
  onImportCurrent?: (weights: Record<string, number>) => void;
}) {
  const { data, loading, error, refresh } = useLiveFundComposition();
  const deltas = useMemo<FundDelta[]>(
    () => deltaVsLive(targetWeights, data, { band: 0.01 }),
    [targetWeights, data],
  );

  // Дайджест весов — используем чтобы триггерить auto-import ТОЛЬКО когда
  // composition реально изменилась. Иначе каждые 60s интервал будет
  // перетирать `currentWeights` тем же значением и сбрасывать ручные правки
  // (если оператор их зачем-то делал — например, тестировал сценарий).
  const weightsDigest = useMemo(() => {
    if (!data) return "";
    return data.items
      .map((i) => `${i.symbol}:${i.weight.toFixed(6)}`)
      .sort()
      .join("|");
  }, [data]);

  // Auto-import: при первом получении data + каждый раз когда веса фактически
  // изменились (e.g. оператор сделал сделку в фонде → composition обновился
  // → research-tool автоматом подтягивает в Current %).
  const lastImportedDigestRef = useRef<string>("");
  useEffect(() => {
    if (!data || !onImportCurrent) return;
    if (data.items.length === 0) return;
    if (weightsDigest === lastImportedDigestRef.current) return;
    lastImportedDigestRef.current = weightsDigest;
    const next: Record<string, number> = {};
    for (const item of data.items) {
      if (basketSymbols.includes(item.symbol)) {
        next[item.symbol] = item.weight;
      }
    }
    // Edge case: фонд держит активы вне нашей корзины (например, 100% USDT
    // в CASH-категории — а у нас в корзине BTCUSDT/ETHUSDT/... без USDT).
    // Без этого гарда `next` был бы пустым {} → setCurrentWeights({}) → юзер
    // увидел бы старые ручные значения из localStorage и не понял что фонд
    // реально на 0%. Явно проставляем 0 для всех basket-символов, чтобы UI
    // показал «BTC 0% / ETH 0% / ...» — отражает реальность фонда.
    if (Object.keys(next).length === 0 && basketSymbols.length > 0) {
      for (const sym of basketSymbols) next[sym] = 0;
    }
    onImportCurrent(next);
  }, [data, weightsDigest, basketSymbols, onImportCurrent]);

  // Skip block entirely if fund API не сконфигурирован — это норма для
  // локальной разработки. Показываем только если есть ошибка-кроме-503
  // или live-data есть.
  if (!loading && !data && !error) return null;
  if (
    !loading &&
    !data &&
    error &&
    error.includes("недоступен или не сконфигурирован")
  ) {
    // Тихо скрываем — фонд не подключён, не отвлекаем оператора.
    return null;
  }

  const handleImport = () => {
    if (!data || !onImportCurrent) return;
    const next: Record<string, number> = {};
    for (const item of data.items) {
      if (basketSymbols.includes(item.symbol)) {
        next[item.symbol] = item.weight;
      }
    }
    // Edge case: см. комментарий в useEffect выше. Если фонд = 100% cash
    // и USDT не в корзине — явно ставим 0 на все basket-символы, чтобы
    // ручная кнопка «Import current» вела себя так же предсказуемо как
    // auto-sync и не оставляла залипшие значения из localStorage.
    if (Object.keys(next).length === 0 && basketSymbols.length > 0) {
      for (const sym of basketSymbols) next[sym] = 0;
    }
    onImportCurrent(next);
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          <Landmark size={14} className="text-brand" />
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
            Δ vs Live Fund
          </h3>
          {data?.fundUrl && (
            <span className="font-mono text-[10px] text-ink-faint">
              ← {new URL(data.fundUrl).host}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onImportCurrent && data && (
            <button
              type="button"
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
              title="Скопировать live composition фонда в Rebalance Plan → текущие веса"
            >
              Import current
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && !error.includes("недоступен или не сконфигурирован") && (
        <p className="mt-3 text-xs text-rose-300">{error}</p>
      )}

      {data && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-faint">
            {/* Source chip — "ledger" значит фонд live-считает веса из сделок ×
                текущих цен (price-adjusted). "operator" — старая статичная
                раскладка. null — старая версия фонда без поля. */}
            {data.source === "ledger" ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200"
                title="Веса вычислены фондом из ledger'а сделок × текущих цен — отражают реальное состояние портфеля с учётом движения цен"
              >
                live · ledger
              </span>
            ) : data.source === "operator" ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200"
                title="Веса — последняя ручная раскладка оператора (не price-adjusted)"
              >
                operator
              </span>
            ) : null}
            {data.missingPriceSymbols.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-200"
                title={`Фонд не получил цену для: ${data.missingPriceSymbols.join(", ")} — веса этих активов посчитаны без price-adjustment`}
              >
                нет цены: {data.missingPriceSymbols.length}
              </span>
            )}
            <span>
              {data.lastChangedAt
                ? `last change: ${new Date(data.lastChangedAt).toISOString().slice(0, 16).replace("T", " ")} UTC · `
                : ""}
              обновлено {humanAgo(data.fetchedAt)} · auto-sync 60s · band ±1pp
            </span>
          </div>
          <table className="mt-3 w-full text-xs">
            <thead className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              <tr className="border-b border-surface-border">
                <th className="py-1.5 text-left font-medium">Symbol</th>
                <th className="py-1.5 text-right font-medium">Target</th>
                <th className="py-1.5 text-right font-medium">Live</th>
                <th className="py-1.5 text-right font-medium">Δ</th>
                <th className="py-1.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {deltas.map((d) => (
                <tr key={d.symbol} className="border-b border-surface-border/60">
                  <td className="py-1.5 text-ink">{prettySymbol(d.symbol)}</td>
                  <td className="py-1.5 text-right text-ink-muted">
                    {(d.target * 100).toFixed(2)}%
                  </td>
                  <td className="py-1.5 text-right text-ink-muted">
                    {(d.live * 100).toFixed(2)}%
                  </td>
                  <td
                    className={`py-1.5 text-right ${
                      d.action === "HOLD"
                        ? "text-ink-faint"
                        : d.delta > 0
                          ? "text-emerald-300"
                          : "text-rose-300"
                    }`}
                  >
                    {d.delta > 0 ? "+" : ""}
                    {(d.delta * 100).toFixed(2)}pp
                  </td>
                  <td className="py-1.5 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                        d.action === "BUY"
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : d.action === "SELL"
                            ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                            : "border border-surface-border text-ink-faint"
                      }`}
                    >
                      {d.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              Фонд вернул пустую композицию.
            </p>
          )}
        </>
      )}
    </section>
  );
}
