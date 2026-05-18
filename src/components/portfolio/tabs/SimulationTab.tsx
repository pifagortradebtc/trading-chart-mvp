"use client";

import { Loader2, Pin } from "lucide-react";
import { FrontierChart } from "../FrontierChart";
import { PortfolioTable } from "../PortfolioTable";
import { ComparisonPanel } from "../ComparisonPanel";
import {
  formatPercent,
  formatRatio,
  prettySymbol,
} from "@/lib/portfolio/format";
import type {
  MPTResult,
  PinnedPortfolio,
  PinnedSource,
  Portfolio,
  PriceSeries,
} from "@/lib/portfolio/types";

interface Props {
  loading: boolean;
  result: MPTResult | null;
  priceSeries: PriceSeries[] | null;
  pinned: PinnedPortfolio[];
  onPin: (portfolio: Portfolio, source: PinnedSource) => void;
  onUnpin: (id: string) => void;
  onAddCustom: () => void;
  onClearAll: () => void;
}

/**
 * Original "Simulation" view extracted unchanged from MPTSimulator —
 * efficient frontier cloud, three KeyStat cards, sample-weights table,
 * and the comparison panel.
 */
export function SimulationTab({
  loading,
  result,
  priceSeries,
  pinned,
  onPin,
  onUnpin,
  onAddCustom,
  onClearAll,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="relative min-h-[560px] rounded-2xl border border-surface-border bg-surface p-3 backdrop-blur-xl shadow-card">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-ink">
                <Loader2 size={18} className="animate-spin text-brand" />
                Загружаем данные и считаем симуляции в фоне…
              </div>
            </div>
          )}
          {result ? (
            <FrontierChart result={result} pinned={pinned} />
          ) : (
            <div className="flex h-full min-h-[520px] items-center justify-center text-ink-muted">
              Нажмите «Пересчитать», чтобы запустить симуляцию.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {result && (
            <>
              <StatsPanel result={result} onPin={onPin} />
              <PortfolioTable result={result} />
            </>
          )}
        </div>
      </section>

      <ComparisonPanel
        pinned={pinned}
        onRemove={onUnpin}
        onAddCustom={onAddCustom}
        onClearAll={onClearAll}
        canAddCustom={!!priceSeries && !!result}
      />
    </div>
  );
}

function StatsPanel({
  result,
  onPin,
}: {
  result: MPTResult;
  onPin: (portfolio: Portfolio, source: PinnedSource) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <KeyStat
        title="Max Sharpe"
        color="text-emerald-400"
        portfolio={result.maxSharpe}
        symbols={result.symbols}
        metric="sharpe"
        onPin={() => onPin(result.maxSharpe, "max-sharpe")}
      />
      <KeyStat
        title="Max Sortino"
        color="text-violet-300"
        portfolio={result.maxSortino}
        symbols={result.symbols}
        metric="sortino"
        onPin={() => onPin(result.maxSortino, "max-sortino")}
      />
      <KeyStat
        title="Min Volatility"
        color="text-sky-400"
        portfolio={result.minVol}
        symbols={result.symbols}
        metric="vol"
        onPin={() => onPin(result.minVol, "min-vol")}
      />
    </div>
  );
}

function KeyStat({
  title,
  color,
  portfolio,
  symbols,
  metric,
  onPin,
}: {
  title: string;
  color: string;
  portfolio: Portfolio;
  symbols: string[];
  metric: "sharpe" | "sortino" | "vol";
  onPin: () => void;
}) {
  const headline =
    metric === "sharpe"
      ? formatRatio(portfolio.sharpe)
      : metric === "sortino"
        ? formatRatio(portfolio.sortino)
        : formatRatio(portfolio.volatility);

  return (
    <div className="group relative rounded-xl border border-surface-border bg-gradient-to-br from-white/[0.04] to-transparent p-3 transition-colors hover:border-brand/30">
      <div className="flex items-baseline justify-between">
        <span
          className={`font-mono text-[10px] font-medium uppercase tracking-[0.22em] ${color}`}
        >
          {title}
        </span>
        <span className="font-mono text-lg font-semibold text-ink">
          {headline}
        </span>
      </div>
      <div className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
        <div className="flex justify-between">
          <span>Доходность</span>
          <span className="font-mono text-ink">
            {formatPercent(portfolio.return)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Волатильность</span>
          <span className="font-mono text-ink">
            {formatPercent(portfolio.volatility)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {portfolio.weights.map((w, i) =>
          w > 0.005 ? (
            <span
              key={i}
              className="rounded border border-surface-border bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-ink"
            >
              {prettySymbol(symbols[i])} {(w * 100).toFixed(0)}%
            </span>
          ) : null
        )}
      </div>
      <button
        type="button"
        onClick={onPin}
        title="Закрепить в сравнении"
        className="absolute right-2 top-2 rounded-md border border-surface-border bg-black/30 p-1 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-brand/40 hover:text-ink"
      >
        <Pin size={12} />
      </button>
    </div>
  );
}
