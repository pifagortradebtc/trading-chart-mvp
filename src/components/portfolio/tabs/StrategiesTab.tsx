"use client";

import { AlertTriangle, ClipboardCopy, Check, Layers, Sparkles } from "lucide-react";
import { useState } from "react";
import { formatPercent, formatRatio, prettySymbol } from "@/lib/portfolio/format";
import { METRIC_TOOLTIPS } from "@/lib/portfolio/metricGlossary";
import { strategyTooltip } from "@/lib/portfolio/strategyGlossary";
import type { StrategyResult } from "@/lib/portfolio/strategyTypes";

interface Props {
  strategies: StrategyResult[] | null;
  symbols: string[];
  /** Currently selected strategy — highlighted in the table. */
  activeId?: string;
  onSelect?: (id: string) => void;
}

/**
 * "Strategies" tab. Two layers:
 *   1) 3×3 grid of strategy cards — name, sub-line, mini-metrics, top-3 weights.
 *   2) Wide comparison table — full StrategyMetrics row per strategy.
 */
export function StrategiesTab({ strategies, symbols, activeId, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!strategies || strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-8 text-center text-sm text-ink-muted">
        Стратегии будут рассчитаны после первого запуска симуляции.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="eyebrow">14 моделей · одно семейство</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-display-tight text-ink">
            Стратегии <span className="accent-serif text-brand-light">построения</span> портфеля
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Четырнадцать параллельных моделей — от пассивного market-cap до
            финальной рекомендации с risk caps и CVaR-защитой. Все считаются
            на одном историческом окне и сравнимы напрямую.
          </p>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-surface-border bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-ink-muted sm:inline-flex">
          <Layers size={12} className="text-brand" />
          {strategies.length} models
        </span>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            symbols={symbols}
            active={activeId === s.id}
            hovered={hovered === s.id}
            onHover={setHovered}
            onClick={() => onSelect?.(s.id)}
          />
        ))}
      </div>

      <ComparisonTable strategies={strategies} symbols={symbols} activeId={activeId} onSelect={onSelect} />
    </div>
  );
}

function StrategyCard({
  strategy,
  symbols,
  active,
  hovered,
  onHover,
  onClick,
}: {
  strategy: StrategyResult;
  symbols: string[];
  active: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const top = topWeights(strategy.weights, symbols, 3);
  const isFinal = strategy.id === "finalFund";

  const ring =
    isFinal
      ? "border-brand/40 shadow-glow"
      : active
        ? "border-brand/30 shadow-glow"
        : "border-surface-border hover:border-brand/30";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(strategy.id)}
      onMouseLeave={() => onHover(null)}
      title={strategyTooltip(strategy.id)}
      className={`group relative rounded-2xl border bg-surface p-4 text-left backdrop-blur-xl shadow-card transition ${ring}`}
    >
      {isFinal && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-brand-light">
          <Sparkles size={10} />
          fund pick
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
            {strategy.id}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
            {strategy.name}
          </h3>
        </div>
        <span className="font-mono text-base font-semibold text-brand-light">
          {formatRatio(strategy.metrics.sharpe)}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
        {strategy.comment}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-surface-border pt-3 text-[11px]">
        <Mini
          label="Return"
          value={formatPercent(strategy.metrics.expectedReturn)}
          positive
          tooltip={METRIC_TOOLTIPS.return}
        />
        <Mini
          label="Vol"
          value={formatPercent(strategy.metrics.volatility)}
          tooltip={METRIC_TOOLTIPS.vol}
        />
        <Mini
          label="Max DD"
          value={formatPercent(strategy.metrics.maxDrawdown)}
          negative
          tooltip={METRIC_TOOLTIPS.maxDrawdown}
        />
      </div>

      <div className="mt-3 space-y-1">
        {top.map((t) => (
          <div key={t.symbol} className="flex items-center gap-2">
            <span className="w-14 truncate font-mono text-[10px] text-ink-muted">
              {prettySymbol(t.symbol)}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-brand-light"
                style={{ width: `${Math.min(100, t.weight * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[10px] text-ink">
              {(t.weight * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {strategy.warning && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{strategy.warning}</span>
        </div>
      )}

      {hovered && <span className="sr-only">Selected</span>}
    </button>
  );
}

function Mini({
  label,
  value,
  positive,
  negative,
  tooltip,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  tooltip?: string;
}) {
  const cls = positive
    ? "text-emerald-300"
    : negative
      ? "text-rose-300"
      : "text-ink";
  return (
    <div className="flex flex-col" title={tooltip}>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <span className={`mt-0.5 font-mono text-sm ${cls}`}>{value}</span>
    </div>
  );
}

const MAJOR_SET = new Set([
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "HYPEUSDT",
  "TONUSDT",
  "OKBUSDT",
]);

function ComparisonTable({
  strategies,
  symbols,
  activeId,
  onSelect,
}: {
  strategies: StrategyResult[];
  symbols: string[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  const btcIdx = symbols.indexOf("BTCUSDT");
  const ethIdx = symbols.indexOf("ETHUSDT");
  const fmt = (w: number) => (w > 0.001 ? `${(w * 100).toFixed(0)}%` : "—");
  const altsW = (s: StrategyResult) => {
    let sum = 0;
    for (let i = 0; i < symbols.length; i++) {
      if (!MAJOR_SET.has(symbols[i])) sum += s.weights[i];
    }
    return sum;
  };
  return (
    <section className="rounded-2xl border border-surface-border bg-surface backdrop-blur-xl shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink">
          Strategy comparison
        </h3>
        <div className="flex items-center gap-3">
          <span className="hidden text-[10px] text-ink-faint sm:inline">
            Кликните строку, чтобы выбрать стратегию для стресс-теста.
          </span>
          <CopyCsvButton strategies={strategies} symbols={symbols} btcIdx={btcIdx} ethIdx={ethIdx} />
        </div>
      </header>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-deep)]/40 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <tr className="border-b border-surface-border">
              <th className="px-4 py-2.5 text-left font-medium">Strategy</th>
              <Th label="Return" tip={METRIC_TOOLTIPS.return} />
              <Th label="Vol" tip={METRIC_TOOLTIPS.vol} />
              <Th label="Sharpe" tip={METRIC_TOOLTIPS.sharpe} />
              <Th label="Sortino" tip={METRIC_TOOLTIPS.sortino} />
              <Th label="Max DD" tip={METRIC_TOOLTIPS.maxDrawdown} />
              <Th label="CVaR 95%" tip={METRIC_TOOLTIPS.cvar95} />
              <Th label="CVaR 99%" tip={METRIC_TOOLTIPS.cvar99} />
              <Th label="Calmar" tip={METRIC_TOOLTIPS.calmar} />
              <Th label="Ulcer" tip={METRIC_TOOLTIPS.ulcer} />
              <Th label="β-BTC" tip={METRIC_TOOLTIPS["β-btc"]} />
              <Th label="BTC" tip={METRIC_TOOLTIPS.btc} />
              <Th label="ETH" tip={METRIC_TOOLTIPS.eth} />
              <Th label="Alts" tip={METRIC_TOOLTIPS.alts} />
              <Th label="ρ BTC" tip={METRIC_TOOLTIPS["ρ btc"]} />
              <th className="px-3 py-2.5 text-left font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => {
              const isFinal = s.id === "finalFund";
              const isActive = s.id === activeId;
              return (
                <tr
                  key={s.id}
                  onClick={() => onSelect?.(s.id)}
                  className={`cursor-pointer border-b border-surface-border/60 transition hover:bg-white/[0.03] ${
                    isActive ? "bg-brand/[0.06] outline outline-1 -outline-offset-1 outline-brand/30" : ""
                  } ${isFinal ? "bg-brand/[0.04]" : ""}`}
                >
                  <td className="px-4 py-2.5" title={strategyTooltip(s.id)}>
                    <div className="font-medium text-ink">{s.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                      {s.id}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-300">
                    {formatPercent(s.metrics.expectedReturn)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {formatPercent(s.metrics.volatility)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {formatRatio(s.metrics.sharpe)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {formatRatio(s.metrics.sortino)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-300">
                    {formatPercent(s.metrics.maxDrawdown)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-200">
                    {formatPercent(s.metrics.cvar95, 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-200">
                    {formatPercent(s.metrics.cvar99, 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {formatRatio(s.metrics.calmar, 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {Number.isFinite(s.metrics.ulcer)
                      ? (s.metrics.ulcer * 100).toFixed(2) + "%"
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-muted">
                    {Number.isFinite(s.metrics.betaToBtc)
                      ? s.metrics.betaToBtc.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {btcIdx >= 0 ? fmt(s.weights[btcIdx]) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {ethIdx >= 0 ? fmt(s.weights[ethIdx]) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-muted">
                    {fmt(altsW(s))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-muted">
                    {Number.isFinite(s.metrics.corrToBtc)
                      ? s.metrics.corrToBtc.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-ink-muted">
                    {s.warning ? (
                      <span className="text-amber-200">{s.warning}</span>
                    ) : (
                      s.comment
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function topWeights(weights: number[], symbols: string[], k: number) {
  return weights
    .map((w, i) => ({ weight: w, symbol: symbols[i] ?? `#${i}` }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, k);
}

function Th({ label, tip }: { label: string; tip?: string }) {
  return (
    <th
      className="cursor-help px-3 py-2.5 text-right font-medium"
      title={tip}
    >
      {label}
    </th>
  );
}

function CopyCsvButton({
  strategies,
  symbols,
  btcIdx,
  ethIdx,
}: {
  strategies: StrategyResult[];
  symbols: string[];
  btcIdx: number;
  ethIdx: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const altsW = (s: StrategyResult) => {
      let sum = 0;
      for (let i = 0; i < symbols.length; i++) {
        if (!MAJOR_SET.has(symbols[i])) sum += s.weights[i];
      }
      return sum;
    };
    const header = [
      "Strategy",
      "Return",
      "Vol",
      "Sharpe",
      "Sortino",
      "MaxDD",
      "CVaR95",
      "CVaR99",
      "Calmar",
      "Ulcer",
      "BetaBTC",
      "BTC",
      "ETH",
      "Alts",
      "CorrBTC",
      "Turnover",
      "Note",
    ];
    const pctFix = (x: number, d = 2) =>
      Number.isFinite(x) ? (x * 100).toFixed(d) : "";
    const numFix = (x: number, d = 3) =>
      Number.isFinite(x) ? x.toFixed(d) : "";
    const escape = (s: string) => {
      if (s == null) return "";
      const needs = /[",\n]/.test(s);
      const esc = s.replace(/"/g, '""');
      return needs ? `"${esc}"` : esc;
    };
    const rows = strategies.map((s) => [
      s.name,
      pctFix(s.metrics.expectedReturn),
      pctFix(s.metrics.volatility),
      numFix(s.metrics.sharpe),
      numFix(s.metrics.sortino),
      pctFix(s.metrics.maxDrawdown),
      pctFix(s.metrics.cvar95, 3),
      pctFix(s.metrics.cvar99, 3),
      numFix(s.metrics.calmar, 2),
      pctFix(s.metrics.ulcer, 2),
      numFix(s.metrics.betaToBtc, 2),
      btcIdx >= 0 ? pctFix(s.weights[btcIdx], 1) : "",
      ethIdx >= 0 ? pctFix(s.weights[ethIdx], 1) : "",
      pctFix(altsW(s), 1),
      numFix(s.metrics.corrToBtc, 2),
      numFix(s.metrics.turnover, 2),
      escape(s.warning ?? s.comment),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(csv);
      } else {
        // Legacy fallback
        const ta = document.createElement("textarea");
        ta.value = csv;
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
      className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink"
      title="Скопировать таблицу в CSV — готово для вставки в Excel/презентацию"
    >
      {copied ? (
        <>
          <Check size={11} className="text-emerald-300" />
          <span className="text-emerald-200">Copied</span>
        </>
      ) : (
        <>
          <ClipboardCopy size={11} />
          <span>Copy CSV</span>
        </>
      )}
    </button>
  );
}
