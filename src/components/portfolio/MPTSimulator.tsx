"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  ChartCandlestick,
  Crown,
  Layers,
  Loader2,
  Play,
  ShieldAlert,
  Settings2,
  TrendingDown,
} from "lucide-react";
import { PifagorFundHeader } from "@/components/PifagorFundHeader";
import { AssetSelector } from "./AssetSelector";
import { BoundsPanel } from "./BoundsPanel";
import { CustomPortfolioModal } from "./CustomPortfolioModal";
import { PresetMenu } from "./PresetMenu";
import { SimulationTab } from "./tabs/SimulationTab";
import { StrategiesTab } from "./tabs/StrategiesTab";
import { RiskCapsTab } from "./tabs/RiskCapsTab";
import { StressTestTab } from "./tabs/StressTestTab";
import { RecommendedTab } from "./tabs/RecommendedTab";
import { JournalTab } from "./tabs/JournalTab";
import { computeParamsHash, type EngineRunParams } from "@/lib/portfolio/engineRuns";
import {
  alignSeries,
  fetchPortfolioCloses,
  prefilterByHistoryLength,
} from "@/lib/portfolio/market-data";
import { computeMetrics } from "@/lib/portfolio/mpt";
import { useMPTWorker } from "@/lib/portfolio/use-mpt-worker";
import {
  addPinned,
  deletePreset,
  loadPinned,
  loadPolicy,
  loadPresets,
  removePinned,
  resetPolicy,
  savePinned,
  savePolicy,
  savePreset,
} from "@/lib/portfolio/storage";
import {
  DEFAULT_AGGREGATE_RULES,
  DEFAULT_RISK_CAPS,
} from "@/lib/portfolio/riskCaps";
import { DEFAULT_CVAR_DEFENSE_THRESHOLD } from "@/lib/portfolio/strategies";
import { fetchLiveMarketCaps } from "@/lib/portfolio/marketCaps";
import { defaultViewsForSymbols } from "@/lib/portfolio/defaultViews";
import { prettySymbol } from "@/lib/portfolio/format";
import type {
  AssetBounds,
  MPTResult,
  PinnedPortfolio,
  PinnedSource,
  Portfolio,
  Preset,
  PriceSeries,
} from "@/lib/portfolio/types";
import type {
  AggregateRules,
  StrategyResult,
  ViewInput,
} from "@/lib/portfolio/strategyTypes";
import type { AssetDataQuality } from "@/lib/portfolio/dataQuality";
import { MODES, type RecommendationMode } from "@/lib/portfolio/recommendationModes";

const DEFAULT_ASSETS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "HYPEUSDT",
  "TONUSDT",
  "OKBUSDT",
  "MNTUSDT",
];
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

type TabId = "sim" | "strategies" | "caps" | "stress" | "recommended" | "journal";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "sim", label: "Simulation", icon: ChartCandlestick },
  { id: "strategies", label: "Strategies", icon: Layers },
  { id: "caps", label: "Risk Caps & Views", icon: ShieldAlert },
  { id: "stress", label: "Stress Test", icon: TrendingDown },
  { id: "recommended", label: "Recommended", icon: Crown },
  { id: "journal", label: "Journal", icon: BookOpen },
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
  const [strategies, setStrategies] = useState<StrategyResult[] | null>(null);
  const [dataQuality, setDataQuality] = useState<AssetDataQuality[] | null>(null);
  const [recommendationMode, setRecommendationMode] = useState<RecommendationMode | undefined>(undefined);
  const [currentWeights, setCurrentWeights] = useState<Record<string, number>>({});
  const [priceSeries, setPriceSeries] = useState<PriceSeries[] | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [warningSymbols, setWarningSymbols] = useState<string[]>([]);
  /** Активы, у которых данные пришли, но история слишком короткая на фоне остальных — в watchlist. */
  const [pendingSymbols, setPendingSymbols] = useState<
    { symbol: string; length: number; maxLength: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [pinned, setPinned] = useState<PinnedPortfolio[]>([]);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  const [tab, setTab] = useState<TabId>("sim");
  const [activeStrategyId, setActiveStrategyId] = useState<string>("finalFund");

  const [riskCaps, setRiskCaps] = useState<Record<string, { min?: number; max?: number }>>(
    () => ({ ...DEFAULT_RISK_CAPS })
  );
  const [aggregateRules, setAggregateRules] = useState<AggregateRules>(
    () => ({ ...DEFAULT_AGGREGATE_RULES })
  );
  const [views, setViews] = useState<ViewInput[]>(() =>
    defaultViewsForSymbols(DEFAULT_ASSETS)
  );
  const [cvarDefenseThreshold, setCvarDefenseThreshold] = useState<number>(
    DEFAULT_CVAR_DEFENSE_THRESHOLD
  );
  const [liveMarketCaps, setLiveMarketCaps] = useState<Record<string, number> | null>(null);
  const [policyHydrated, setPolicyHydrated] = useState(false);

  const worker = useMPTWorker();
  // CORRECTNESS FIX (security finding): worker-multiplexing race. Раньше поздний
  // promise мог перетереть setStrategies от более нового ввода — оператор видел
  // устаревшую аллокацию. Теперь каждый job increments version, и в async
  // колбэках мы сверяем что текущая версия не сменилась — если сменилась,
  // dropping результат (новый job уже летит).
  const workerJobVersion = useRef(0);

  useEffect(() => {
    setPresets(loadPresets());
    setPinned(loadPinned());
    // Hydrate policy from localStorage (Фича 1)
    const stored = loadPolicy();
    if (stored.riskCaps && Object.keys(stored.riskCaps).length > 0) {
      setRiskCaps(stored.riskCaps);
    }
    if (stored.aggregateRules) {
      setAggregateRules(stored.aggregateRules);
    }
    if (stored.views && stored.views.length > 0) {
      setViews(stored.views);
    }
    if (typeof stored.cvarDefenseThreshold === "number" && Number.isFinite(stored.cvarDefenseThreshold)) {
      setCvarDefenseThreshold(stored.cvarDefenseThreshold);
    }
    if (
      typeof stored.activeTab === "string" &&
      TABS.some((t) => t.id === stored.activeTab)
    ) {
      setTab(stored.activeTab as TabId);
    }
    if (stored.recommendationMode) {
      setRecommendationMode(stored.recommendationMode);
    }
    if (stored.currentWeights) {
      // Sanity-filter: drop any ticker the user no longer holds in `assets`.
      // Without this, switching baskets leaves stale BUY/SELL rows for tickers
      // that aren't even in the table — "ghost data" from a previous session.
      const allowed = new Set(DEFAULT_ASSETS);
      const cleaned: Record<string, number> = {};
      for (const [sym, w] of Object.entries(stored.currentWeights)) {
        if (allowed.has(sym) && typeof w === "number" && Number.isFinite(w)) {
          cleaned[sym] = Math.max(0, Math.min(1, w));
        }
      }
      setCurrentWeights(cleaned);
    }
    setPolicyHydrated(true);
    // Live market caps (Фича 2) — silent best-effort
    fetchLiveMarketCaps().then((caps) => {
      if (caps) setLiveMarketCaps(caps);
    });
  }, []);

  // Persist policy on change (debounced 300ms)
  useEffect(() => {
    if (!policyHydrated) return;
    const handle = setTimeout(() => {
      savePolicy({
        riskCaps,
        aggregateRules,
        views,
        cvarDefenseThreshold,
        activeTab: tab,
        recommendationMode,
        currentWeights,
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [
    policyHydrated,
    riskCaps,
    aggregateRules,
    views,
    cvarDefenseThreshold,
    tab,
    recommendationMode,
    currentWeights,
  ]);

  const handleResetPolicy = useCallback(() => {
    resetPolicy();
    setRiskCaps({ ...DEFAULT_RISK_CAPS });
    setAggregateRules({ ...DEFAULT_AGGREGATE_RULES });
    setViews(defaultViewsForSymbols(assets));
    setCvarDefenseThreshold(DEFAULT_CVAR_DEFENSE_THRESHOLD);
    setRecommendationMode(undefined);
    setCurrentWeights({});
  }, [assets]);

  const handleApplyMode = useCallback(
    (mode: RecommendationMode) => {
      const cfg = MODES[mode];
      setRiskCaps({ ...cfg.riskCaps });
      setAggregateRules({ ...cfg.aggregateRules });
      setCvarDefenseThreshold(cfg.cvarDefenseThreshold);
      setRecommendationMode(mode);
    },
    []
  );

  // Engine params snapshot — детерминированный hash используется для:
  //   - identification повторных запусков с теми же параметрами в Journal
  //   - привязки Copy NAV-snapshot к точно тому configu, который его выдал
  const engineParams = useMemo<EngineRunParams>(
    () => ({
      assets,
      riskCaps,
      aggregateRules,
      views,
      cvarDefenseThreshold,
      mode: recommendationMode ?? "balanced",
      riskFreeRate,
      simulations,
      historyDays,
    }),
    [
      assets,
      riskCaps,
      aggregateRules,
      views,
      cvarDefenseThreshold,
      recommendationMode,
      riskFreeRate,
      simulations,
      historyDays,
    ],
  );

  const [paramsHash, setParamsHash] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    computeParamsHash(engineParams).then((h) => {
      if (!cancelled) setParamsHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [engineParams]);

  useEffect(() => {
    setBounds((prev) => syncBounds(prev, assets));
    // Add views for newly added symbols (keep existing edits)
    setViews((prev) => {
      const existing = new Map(prev.map((v) => [v.symbol, v]));
      const defaults = defaultViewsForSymbols(assets);
      return defaults.map((d) => existing.get(d.symbol) ?? d);
    });
    // Drop currentWeights entries for symbols that left the basket.
    setCurrentWeights((prev) => {
      const allowed = new Set(assets);
      let changed = false;
      const next: Record<string, number> = {};
      for (const [sym, w] of Object.entries(prev)) {
        if (allowed.has(sym)) next[sym] = w;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [assets]);

  const recalculate = useCallback(async () => {
    if (assets.length < 2) {
      setError("Выберите минимум два актива.");
      return;
    }
    setError(null);
    setLoading(true);
    setDurationMs(null);
    setWarningSymbols([]);
    setPendingSymbols([]);
    try {
      const fetched = await Promise.allSettled(
        assets.map(async (symbol) => {
          const klines = await fetchPortfolioCloses({ symbol, days: historyDays });
          return { symbol, klines };
        })
      );

      const ok: { symbol: string; klines: { time: number; close: number }[] }[] = [];
      const failed: string[] = [];
      for (let i = 0; i < fetched.length; i++) {
        const r = fetched[i];
        if (r.status === "fulfilled" && r.value.klines.length > 30) {
          ok.push(r.value);
        } else {
          failed.push(assets[i]);
        }
      }
      if (failed.length > 0) setWarningSymbols(failed);
      if (ok.length < 2) {
        throw new Error(
          failed.length > 0
            ? `Недоступны данные: ${failed.join(", ")}. Замените активы.`
            : "Слишком мало активов с данными."
        );
      }

      // Защита от «короткий тянет вниз»: если один актив втрое короче
      // остальных, alignSeries обрежет всех под него и dataQuality пометит
      // даже BTC как `limited`. Лучше короткого временно вынести в watchlist.
      const { kept, dropped } = prefilterByHistoryLength(ok);
      if (dropped.length > 0) {
        setPendingSymbols(
          dropped.map((d) => ({
            symbol: d.symbol,
            length: d.length,
            maxLength: d.maxLength,
          })),
        );
      }
      if (kept.length < 2) {
        throw new Error(
          "После фильтра по длине истории осталось <2 активов. Удалите свежие листинги или дождитесь накопления истории.",
        );
      }

      const aligned = alignSeries(kept);
      if ((aligned[0]?.times.length ?? 0) < 30) {
        throw new Error(
          "Слишком мало общих торговых дней между активами. Уменьшите окно или замените активы."
        );
      }

      // Adjust bounds to surviving asset list (worker requires |bounds|=|series|)
      const liveSymbols = aligned.map((p) => p.symbol);
      const liveBounds = liveSymbols.map((symbol) => {
        const idx = assets.indexOf(symbol);
        return idx >= 0 && bounds[idx] ? bounds[idx] : { min: 0, max: 1 };
      });
      const liveViews = defaultViewsForSymbols(liveSymbols).map((d) => {
        const found = views.find((v) => v.symbol === d.symbol);
        return found ?? d;
      });

      const myVersion = ++workerJobVersion.current;
      const { result: mptResult, strategies: strats, dataQuality: dq, durationMs: elapsed } =
        await worker.runWithStrategies({
          priceSeries: aligned,
          simulations,
          riskFreeRate,
          bounds: liveBounds,
          views: liveViews,
          riskCaps,
          aggregateRules,
          cvarDefenseThreshold,
          liveMarketCaps,
        });
      // Race guard: если новый job уже стартанул — dropping результат.
      if (workerJobVersion.current !== myVersion) return;
      setPriceSeries(aligned);
      setResult(mptResult);
      setStrategies(strats);
      setDataQuality(dq);
      setDurationMs(elapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить данные.");
      setResult(null);
      setStrategies(null);
      setPriceSeries(null);
    } finally {
      setLoading(false);
    }
  }, [
    assets,
    bounds,
    historyDays,
    riskFreeRate,
    simulations,
    worker,
    views,
    riskCaps,
    aggregateRules,
    cvarDefenseThreshold,
    liveMarketCaps,
  ]);

  /**
   * Recomputes the 9 strategies without re-running the heavy MC cloud.
   * Used after the user edits caps/views.
   */
  const reapplyStrategies = useCallback(async () => {
    if (!result || !priceSeries) return;
    setLoading(true);
    try {
      const liveSymbols = priceSeries.map((p) => p.symbol);
      const liveViews = defaultViewsForSymbols(liveSymbols).map((d) => {
        const found = views.find((v) => v.symbol === d.symbol);
        return found ?? d;
      });
      const myVersion = ++workerJobVersion.current;
      const { strategies: strats, dataQuality: dq } = await worker.computeStrategies({
        priceSeries,
        riskFreeRate,
        mptResult: result,
        views: liveViews,
        riskCaps,
        aggregateRules,
        cvarDefenseThreshold,
        liveMarketCaps,
      });
      // Race guard — см. комментарий выше.
      if (workerJobVersion.current !== myVersion) return;
      setStrategies(strats);
      setDataQuality(dq);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось пересчитать стратегии.");
    } finally {
      setLoading(false);
    }
  }, [
    result,
    priceSeries,
    worker,
    riskFreeRate,
    views,
    riskCaps,
    aggregateRules,
    cvarDefenseThreshold,
    liveMarketCaps,
  ]);

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

  const liveSymbols = result?.symbols ?? assets;
  const finalStrategy = strategies?.find((s) => s.id === "finalFund") ?? null;
  const busy = loading;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-ink">
      <PifagorFundHeader />

      <header className="relative overflow-hidden border-b border-surface-border bg-[rgba(10,16,32,0.55)] px-4 py-10 sm:px-8 sm:py-12">
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
                Симуляция оптимального распределения долей капитала фонда. 14 моделей
                построения, risk caps, Black-Litterman views, CVaR stress test и
                рекомендованный портфель — всё в Web Worker.
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
                <StatChip
                  label="Стратегий"
                  value={String(strategies?.length ?? 0)}
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

        {warningSymbols.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              Не удалось загрузить котировки: {warningSymbols.map(prettySymbol).join(", ")}.
              Возможные причины: пары нет на источнике, сетевая ошибка, или тикер
              не маппится. Активы временно исключены из расчёта.
            </span>
          </div>
        )}

        {pendingSymbols.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              В watchlist (мало истории для участия в портфеле):{" "}
              {pendingSymbols
                .map(
                  (p) =>
                    `${prettySymbol(p.symbol)} (${p.length}д из ${p.maxLength}д у длиннейшего)`,
                )
                .join(", ")}
              . Появятся в расчёте, когда наберут хотя бы половину истории длиннейшего актива.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <TabSwitcher tab={tab} setTab={setTab} />

        {loading && !result && <FirstRunSkeleton />}

        {tab === "sim" && (
          <SimulationTab
            loading={busy}
            result={result}
            priceSeries={priceSeries}
            pinned={visiblePinned}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onAddCustom={() => setCustomModalOpen(true)}
            onClearAll={clearAllPinned}
          />
        )}

        {tab === "strategies" && (
          <StrategiesTab
            strategies={strategies}
            symbols={liveSymbols}
            activeId={activeStrategyId}
            onSelect={setActiveStrategyId}
          />
        )}

        {tab === "caps" && (
          <RiskCapsTab
            symbols={liveSymbols}
            riskCaps={riskCaps}
            aggregateRules={aggregateRules}
            views={views}
            cvarDefenseThreshold={cvarDefenseThreshold}
            strategies={strategies}
            onRiskCapsChange={setRiskCaps}
            onAggregateChange={setAggregateRules}
            onViewsChange={setViews}
            onCvarDefenseThresholdChange={setCvarDefenseThreshold}
            onResetPolicy={handleResetPolicy}
            onApply={reapplyStrategies}
            loading={busy}
            recommendationMode={recommendationMode}
            onApplyMode={handleApplyMode}
          />
        )}

        {tab === "stress" && (
          <StressTestTab
            strategies={strategies}
            symbols={liveSymbols}
            priceSeries={priceSeries}
            activeId={activeStrategyId}
            onSelect={setActiveStrategyId}
          />
        )}

        {tab === "recommended" && (
          <RecommendedTab
            strategy={finalStrategy}
            symbols={liveSymbols}
            priceSeries={priceSeries}
            cvarDefenseThreshold={cvarDefenseThreshold}
            dataQuality={dataQuality}
            allStrategies={strategies}
            windowDays={result?.windowDays ?? historyDays}
            currentWeights={currentWeights}
            onCurrentWeightsChange={setCurrentWeights}
            views={views}
            engineMeta={{
              paramsHash,
              mode: recommendationMode ?? "balanced",
              liveMarketCapsUsed: !!liveMarketCaps,
            }}
          />
        )}

        {tab === "journal" && <JournalTab />}

        <footer className="border-t border-surface-border pt-4">
          <p className="fund-disclaimer">
            Внутренний инструмент Pifagor Fund. Данные — Binance Spot (через
            /api/ohlcv с дисковым кэшем); все расчёты — в Web Worker; пресеты и
            закреплённые портфели хранятся в localStorage. Образовательная
            демонстрация, не публичная финансовая рекомендация.
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

function TabSwitcher({
  tab,
  setTab,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-full border border-surface-border bg-surface p-1 backdrop-blur-xl shadow-card">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition ${
              active
                ? "bg-brand text-[var(--bg-deep)] shadow-sm"
                : "text-ink-muted hover:bg-white/[0.04] hover:text-ink"
            }`}
          >
            <Icon size={13} />
            {t.label}
          </button>
        );
      })}
    </nav>
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

/**
 * First-load skeleton — показывается под TabSwitcher пока идёт первый расчёт
 * и `result` ещё `null`. Лучше пустых блоков и текста «ещё не рассчитано».
 * Использует пульсацию tailwind `animate-pulse` + матовые золотые тона.
 */
function FirstRunSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <SkelBlock className="h-[560px]" />
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <SkelBlock className="h-[120px]" />
            <SkelBlock className="h-[120px]" />
            <SkelBlock className="h-[120px]" />
          </div>
          <SkelBlock className="h-[300px]" />
        </div>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
        Загружаем дневные closes и считаем 14 моделей…
      </p>
    </div>
  );
}

function SkelBlock({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-surface-border bg-surface ${className ?? ""}`}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-brand/[0.04] to-transparent" />
    </div>
  );
}
