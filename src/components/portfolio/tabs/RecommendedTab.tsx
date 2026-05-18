"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight,
  Check,
  ClipboardCopy,
  Crown,
  Layers2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatPercent, prettySymbol } from "@/lib/portfolio/format";
import { portfolioDailyReturns } from "@/lib/portfolio/strategyMetrics";
import type { Data, Layout } from "plotly.js";
import type { StrategyResult } from "@/lib/portfolio/strategyTypes";
import type { PriceSeries } from "@/lib/portfolio/types";

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
