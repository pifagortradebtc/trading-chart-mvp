"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Pin,
  Play,
  Settings2,
} from "lucide-react";
import { PifagorFundHeader } from "@/components/PifagorFundHeader";
import { AssetSelector } from "./AssetSelector";
import { BoundsPanel } from "./BoundsPanel";
import { ComparisonPanel } from "./ComparisonPanel";
import { CustomPortfolioModal } from "./CustomPortfolioModal";
import { FrontierChart } from "./FrontierChart";
import { PortfolioTable } from "./PortfolioTable";
import { PresetMenu } from "./PresetMenu";
import { alignSeries, fetchPortfolioCloses } from "@/lib/portfolio/market-data";
import { computeMetrics } from "@/lib/portfolio/mpt";
import {
  formatPercent,
  formatRatio,
  prettySymbol,
} from "@/lib/portfolio/format";
import { useMPTWorker } from "@/lib/portfolio/use-mpt-worker";
import {
  addPinned,
  deletePreset,
  loadPinned,
  loadPresets,
  removePinned,
  savePinned,
  savePreset,
} from "@/lib/portfolio/storage";
import type {
  AssetBounds,
  MPTResult,
  PinnedPortfolio,
  PinnedSource,
  Portfolio,
  Preset,
  PriceSeries,
} from "@/lib/portfolio/types";

const DEFAULT_ASSETS = ["BTCUSDT", "ETHUSDT"];
const HISTORY_PRESETS = [
  { label: "1 год", days: 365 },
  { label: "2 года", days: 730 },
  { label: "3 года", days: 1095 },
  { label: "5 лет", days: 1825 },
];
const SIM_PRESETS = [10000, 25000, 50000, 100000];

/** Палитра status-маркеров для закреплённых портфелей. Намеренно разноцветная —
 *  это функциональные различающие цвета (Sharpe / Sortino / Min Vol / custom),
 *  а не декор. Сохраняем как есть; gold резервируем за брендом UI. */
const PIN_COLOR_PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#4ade80",
  "#fb923c",
  "#facc15",
  "#f472b6",
  "#38bdf8",
  "#d63ec8",
];

export function MPTSimulator() {
  const [assets, setAssets] = useState<string[]>(DEFAULT_ASSETS);
  const [bounds, setBounds] = useState<AssetBounds[]>(() =>
    DEFAULT_ASSETS.map(() => ({ min: 0, max: 1 }))
  );
  const [historyDays, setHistoryDays] = useState(1095);
  const [simulations, setSimulations] = useState(50000);
  const [riskFreeRate, setRiskFreeRate] = useState(0.04);

  const [result, setResult] = useState<MPTResult | null>(null);
  const [priceSeries, setPriceSeries] = useState<PriceSeries[] | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [pinned, setPinned] = useState<PinnedPortfolio[]>([]);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  const worker = useMPTWorker();

  useEffect(() => {
    setPresets(loadPresets());
    setPinned(loadPinned());
  }, []);

  useEffect(() => {
    setBounds((prev) => syncBounds(prev, assets));
  }, [assets]);

  const recalculate = useCallback(async () => {
    if (assets.length < 2) {
      setError("Выберите минимум два актива.");
      return;
    }
    setError(null);
    setLoading(true);
    setDurationMs(null);
    try {
      const series = await Promise.all(
        assets.map(async (symbol) => {
          const klines = await fetchPortfolioCloses({ symbol, days: historyDays });
          return { symbol, klines };
        })
      );

      const aligned = alignSeries(series);
      if ((aligned[0]?.times.length ?? 0) < 30) {
        throw new Error(
          "Слишком мало общих торговых дней между активами. Уменьшите окно или замените активы."
        );
      }

      const { result: mptResult, durationMs: elapsed } = await worker.run({
        priceSeries: aligned,
        simulations,
        riskFreeRate,
        bounds,
      });
      setPriceSeries(aligned);
      setResult(mptResult);
      setDurationMs(elapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить данные.");
      setResult(null);
      setPriceSeries(null);
    } finally {
      setLoading(false);
    }
  }, [assets, bounds, historyDays, riskFreeRate, simulations, worker]);

  useEffect(() => {
    recalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePin = (portfolio: Portfolio, source: PinnedSource) => {
    if (!result) return;
    const color = PIN_COLOR_PALETTE[pinned.length % PIN_COLOR_PALETTE.length];
    const next = addPinned(pinned, {
      name: defaultPinName(source, pinned),
      source,
      allocation: result.symbols.map((symbol, i) => ({
        symbol,
        weight: portfolio.weights[i],
      })),
      metrics: { ...portfolio },
      riskFreeRate,
      historyDays: result.windowDays,
      color,
    });
    setPinned(next);
  };

  const handleAddCustom = (allocation: { symbol: string; weight: number }[]) => {
    if (!priceSeries || !result) return;
    const weights = result.symbols.map((symbol) => {
      const found = allocation.find((a) => a.symbol === symbol);
      return found ? found.weight : 0;
    });
    const metrics = computeMetrics(weights, priceSeries, riskFreeRate);
    const color = PIN_COLOR_PALETTE[pinned.length % PIN_COLOR_PALETTE.length];
    const next = addPinned(pinned, {
      name: customNameFromAllocation(allocation),
      source: "custom",
      allocation,
      metrics,
      riskFreeRate,
      historyDays: result.windowDays,
      color,
    });
    setPinned(next);
  };

  const handleUnpin = (id: string) => setPinned(removePinned(pinned, id));
  const clearAllPinned = () => {
    setPinned([]);
    savePinned([]);
  };

  const handleSavePreset = (name: string) => {
    const next = savePreset({
      name,
      assets,
      bounds: assets.map((symbol, i) => ({
        symbol,
        min: bounds[i]?.min ?? 0,
        max: bounds[i]?.max ?? 1,
      })),
      historyDays,
      simulations,
      riskFreeRate,
    });
    setPresets((current) => [next, ...current]);
  };

  const handleLoadPreset = (preset: Preset) => {
    setAssets(preset.assets);
    setBounds(
      preset.assets.map((symbol) => {
        const saved = preset.bounds.find((b) => b.symbol === symbol);
        return saved
          ? { min: saved.min, max: saved.max }
          : { min: 0, max: 1 };
      })
    );
    setHistoryDays(preset.historyDays);
    setSimulations(preset.simulations);
    setRiskFreeRate(preset.riskFreeRate);
  };

  const handleDeletePreset = (id: string) => {
    setPresets(deletePreset(id));
  };

  const visiblePinned = useMemo(() => {
    if (!result) return pinned;
    const currentSet = new Set(result.symbols);
    return pinned.filter((p) =>
      p.allocation.every((a) => currentSet.has(a.symbol) || a.weight === 0)
    );
  }, [pinned, result]);

  const busy = loading;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-ink">
      <PifagorFundHeader />

      <header className="relative overflow-hidden border-b border-surface-border bg-[rgba(10,16,32,0.55)] px-4 py-10 sm:px-8 sm:py-12">
        {/* Gold aurora */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-brand-glow blur-3xl animate-aurora-drift"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[rgba(201,169,98,0.10)] blur-3xl"
        />

        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-4">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-1">
              <p className="eyebrow flex items-center gap-3">
                <span className="pulse-dot" aria-hidden />
                Pifagor Fund · Кабинет аналитики
              </p>
              <h1 className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-3xl font-semibold leading-[1.05] tracking-display-tight text-ink sm:text-[2.5rem]">
                <Settings2
                  size={26}
                  className="text-brand"
                  strokeWidth={1.6}
                  aria-hidden
                />
                <span>
                  Пифагор{" "}
                  <span className="accent-serif text-brand-light">Portfolio</span>{" "}
                  Research
                </span>
                <span className="rounded-md border border-surface-border bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
                  beta
                </span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-[15px]">
                Симуляция оптимального распределения долей капитала фонда. Модель
                Марковица, дневные закрытия Binance, расчёт в Web Worker.
              </p>
            </div>
            {durationMs !== null && (result?.portfolios.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                <StatChip
                  label="Симуляций"
                  value={(result?.portfolios.length ?? 0).toLocaleString("ru")}
                />
                <StatChip label="Время" value={`${durationMs.toFixed(0)}мс`} />
                <StatChip
                  label="Окно"
                  value={`${result?.windowDays ?? 0} дн.`}
                />
                {result?.rejectionRate !== undefined &&
                  result.rejectionRate > 0.01 && (
                    <StatChip
                      label="Отброшено"
                      value={`${(result.rejectionRate * 100).toFixed(1)}%`}
                      warn
                    />
                  )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-8">
        <section className="rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <label className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
                  Активы
                </label>
                <AssetSelector
                  value={assets}
                  onChange={setAssets}
                  disabled={busy}
                />
              </div>

              <div className="flex items-center gap-2">
                <PresetMenu
                  presets={presets}
                  onSave={handleSavePreset}
                  onLoad={handleLoadPreset}
                  onDelete={handleDeletePreset}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={recalculate}
                  disabled={busy || assets.length < 2}
                  className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-[var(--bg-deep)] shadow-glow-strong transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Считаем…
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Пересчитать
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <ControlGroup label="Период истории">
                <SegmentedControl
                  options={HISTORY_PRESETS.map((p) => ({
                    value: p.days,
                    label: p.label,
                  }))}
                  value={historyDays}
                  onChange={setHistoryDays}
                  disabled={busy}
                />
              </ControlGroup>

              <ControlGroup label="Симуляций">
                <SegmentedControl
                  options={SIM_PRESETS.map((n) => ({
                    value: n,
                    label: n.toLocaleString("ru"),
                  }))}
                  value={simulations}
                  onChange={setSimulations}
                  disabled={busy}
                />
              </ControlGroup>

              <ControlGroup label="Безрисковая ставка">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={0.1}
                    step={0.005}
                    value={riskFreeRate}
                    disabled={busy}
                    onChange={(e) => setRiskFreeRate(parseFloat(e.target.value))}
                    className="w-40 accent-brand"
                  />
                  <span className="w-12 font-mono text-sm text-ink">
                    {(riskFreeRate * 100).toFixed(1)}%
                  </span>
                </div>
              </ControlGroup>
            </div>

            <BoundsPanel
              symbols={assets}
              bounds={bounds}
              onChange={setBounds}
              disabled={busy}
            />
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="relative min-h-[560px] rounded-2xl border border-surface-border bg-surface p-3 backdrop-blur-xl shadow-card">
            {busy && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Loader2 size={18} className="animate-spin text-brand" />
                  Загружаем данные и считаем симуляции в фоне…
                </div>
              </div>
            )}
            {result ? (
              <FrontierChart result={result} pinned={visiblePinned} />
            ) : (
              <div className="flex h-full min-h-[520px] items-center justify-center text-ink-muted">
                Нажмите «Пересчитать», чтобы запустить симуляцию.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {result && (
              <>
                <StatsPanel result={result} onPin={handlePin} />
                <PortfolioTable result={result} />
              </>
            )}
          </div>
        </section>

        <ComparisonPanel
          pinned={visiblePinned}
          onRemove={handleUnpin}
          onAddCustom={() => setCustomModalOpen(true)}
          onClearAll={clearAllPinned}
          canAddCustom={!!priceSeries && !!result}
        />

        <footer className="border-t border-surface-border pt-4">
          <p className="fund-disclaimer">
            Внутренний инструмент Pifagor Fund. Данные — Binance Spot (через
            /api/ohlcv с дисковым кэшем); расчёты — в Web Worker; пресеты и
            закреплённые портфели хранятся в localStorage браузера.
            Образовательная демонстрация, не публичная финансовая рекомендация.
          </p>
        </footer>

        {priceSeries && (
          <CustomPortfolioModal
            open={customModalOpen}
            onClose={() => setCustomModalOpen(false)}
            priceSeries={priceSeries}
            riskFreeRate={riskFreeRate}
            onConfirm={handleAddCustom}
          />
        )}
      </main>
    </div>
  );
}

function StatChip({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  const cls = warn
    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
    : "border-surface-border bg-white/[0.03] text-ink-muted";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px] ${cls}`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-80">
        {label}
      </span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </span>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-surface-border">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-medium transition ${
            value === o.value
              ? "bg-brand/15 text-brand-light"
              : "bg-white/[0.02] text-ink-muted hover:text-ink"
          } disabled:opacity-40`}
        >
          {o.label}
        </button>
      ))}
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

function syncBounds(prev: AssetBounds[], assets: string[]): AssetBounds[] {
  if (prev.length === assets.length) return prev;
  const next: AssetBounds[] = [];
  for (let i = 0; i < assets.length; i++) {
    next.push(prev[i] ?? { min: 0, max: 1 });
  }
  return next;
}

function defaultPinName(source: PinnedSource, existing: PinnedPortfolio[]): string {
  const labels: Record<PinnedSource, string> = {
    "max-sharpe": "Max Sharpe",
    "max-sortino": "Max Sortino",
    "min-vol": "Min Vol",
    frontier: "Frontier",
    custom: "Custom",
  };
  const base = labels[source];
  const count = existing.filter((p) => p.source === source).length;
  return count === 0 ? base : `${base} #${count + 1}`;
}

function customNameFromAllocation(
  allocation: { symbol: string; weight: number }[]
): string {
  const top = [...allocation]
    .filter((a) => a.weight > 0.005)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  return top
    .map((a) => `${prettySymbol(a.symbol)} ${(a.weight * 100).toFixed(0)}%`)
    .join(" · ");
}
