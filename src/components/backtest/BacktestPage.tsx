"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/types/candle";
import {
  loadOhlcvBinance,
  parseOhlcvCsv,
  tryLoadOhlcvBrowserCache,
} from "@/lib/backtest/dataProvider";
import { runBacktestOffMainThread } from "@/lib/backtest/runBacktestClient";
import { computeMetrics, type MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestSettings } from "@/lib/backtest/types";
import { DEFAULT_BACKTEST } from "@/lib/backtest/backtestDefaults";
import { BacktestSettingsForm } from "./BacktestSettings";
import { BacktestResults } from "./BacktestResults";
import { TradeDetailsModal } from "./TradeDetailsModal";
import { EquityCurve } from "./charts/EquityCurve";
import { PriceChart } from "./charts/PriceChart";
import type { TradeRecord } from "@/lib/backtest/types";
import type { BacktestSnapshotFile } from "@/lib/backtest/snapshotTypes";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { computeAdvancedResearchMetrics } from "@/lib/research/advancedMetrics";
import { analyzeDataQuality } from "@/lib/research/dataQuality";
import { buildInterpretation } from "@/lib/research/interpretationRules";
import {
  computeBenchmarksStub,
  runMonteCarloStub,
  runOptimizationStub,
  runStressSuiteStub,
  runWalkForwardStub,
} from "@/lib/research/engines";
import { ResearchShell } from "@/components/research/ResearchShell";
import type { ResearchTabId } from "@/components/research/types";
import { EmptyState, GlassCard, MetricTile, NeonBadge, SkeletonBlock } from "@/components/research/ui";
import { UnderwaterChart } from "@/components/research/charts/UnderwaterChart";
import { ExtendedKpiGrid } from "@/components/research/panels/ExtendedKpiGrid";
import { InterpretationPanel } from "@/components/research/panels/InterpretationPanel";
import { DataQualityPanel } from "@/components/research/panels/DataQualityPanel";
import { LabStubPanel } from "@/components/research/panels/LabStubPanel";
import { ReportingPanel } from "@/components/research/panels/ReportingPanel";
import { TradeAnalyticsSection } from "@/components/research/panels/TradeAnalyticsSection";
import { DcaGridSection } from "@/components/research/panels/DcaGridSection";

const PAIRS = [
  "ETHUSDT",
  "BTCUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "TONUSDT",
];

const INTERVALS = ["15m", "1h", "4h", "1d"] as const;

/** Соответствуют пресетам Fast в проде; у всех TP = 0.6%. */
type PresetName = "conservative" | "start" | "aggressive" | "medium" | "custom";

const TP_ALL_PRESETS = 0.6;

function presetSettings(name: Exclude<PresetName, "custom">): Partial<BacktestSettings> {
  const base = DEFAULT_BACKTEST.dca;
  if (name === "conservative") {
    /** Fast — Консервативно */
    return {
      dca: {
        ...base,
        leverage: 4,
        ordersCount: 7,
        priceOverlapPct: 25,
        priceFactor: 1.6,
        volumeFactor: 1.2,
        takeProfitPct: TP_ALL_PRESETS,
      },
    };
  }
  if (name === "start") {
    /** Fast — Старт */
    return {
      dca: {
        ...base,
        leverage: 4,
        ordersCount: 4,
        priceOverlapPct: 20,
        priceFactor: 1.0,
        volumeFactor: 1.6,
        takeProfitPct: TP_ALL_PRESETS,
      },
    };
  }
  if (name === "aggressive") {
    /** Fast — Агрессивно */
    return {
      dca: {
        ...base,
        leverage: 6,
        ordersCount: 4,
        priceOverlapPct: 15,
        priceFactor: 1.8,
        volumeFactor: 1.75,
        takeProfitPct: TP_ALL_PRESETS,
      },
    };
  }
  /** Fast — Средний риск, прибыль */
  if (name === "medium") {
    return {
      dca: {
        ...base,
        leverage: 4,
        ordersCount: 5,
        priceOverlapPct: 25,
        priceFactor: 1.0,
        volumeFactor: 1.2,
        takeProfitPct: TP_ALL_PRESETS,
      },
    };
  }
  const _exhaustive: never = name;
  return _exhaustive;
}

/** Пояснения для UI: что именно перезаписывается при выборе пресета. */
const PRESET_UI: Record<
  PresetName,
  {
    titleRu: string;
    titleEn: string;
    oneLine: string;
    tooltip: string;
  }
> = {
  conservative: {
    titleRu: "Консервативно",
    titleEn: "Conservative",
    oneLine: "Плечо 4×, 7 ордеров, overlap 25%, цена ×1.6 / объём ×1.2 · TP 0.6%.",
    tooltip:
      "Fast «Консервативно»: плечо 4×, ордеров 7, перекрытие цены 25%, price_factor 1.6, volume_factor 1.2, take profit 0.6%. Режим long/short не меняется (как в форме). Индикатор V2 не трогаем.",
  },
  start: {
    titleRu: "Старт",
    titleEn: "Start",
    oneLine: "Плечо 4×, 4 ордера, overlap 20%, цена ×1.0 / объём ×1.6 · TP 0.6%.",
    tooltip:
      "Fast «Старт»: плечо 4×, ордеров 4, overlap 20%, price_factor 1.0, volume_factor 1.6, TP 0.6%. Узкая сетка, выше нарастание объёма по уровням.",
  },
  aggressive: {
    titleRu: "Агрессивно",
    titleEn: "Aggressive",
    oneLine: "Плечо 6×, 4 ордера, overlap 15%, цена ×1.8 / объём ×1.75 · TP 0.6%.",
    tooltip:
      "Fast «Агрессивно»: плечо 6×, ордеров 4, overlap 15%, price_factor 1.8, volume_factor 1.75, TP 0.6%. Уже шаг по цене, выше нагрузка на маржу.",
  },
  medium: {
    titleRu: "Средний риск",
    titleEn: "Medium",
    oneLine: "Плечо 4×, 5 ордеров, overlap 25%, цена ×1.0 / объём ×1.2 · TP 0.6%.",
    tooltip:
      "Fast «Средний риск, прибыль»: плечо 4×, ордеров 5, overlap 25%, price_factor 1.0, volume_factor 1.2, TP 0.6%.",
  },
  custom: {
    titleRu: "Свой",
    titleEn: "Custom",
    oneLine: "Все цифры только из формы ниже; пресет не подставляет значения автоматически.",
    tooltip:
      "Поля DCA и индикатора вручную. Чтобы применить готовый набор — выберите Консервативно / Старт / Агрессивно / Средний риск.",
  },
};

const inp =
  "rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-[var(--rex-text)] outline-none ring-cyan-500/0 transition-shadow focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20";

export function BacktestPage() {
  const router = useRouter();
  const [researchTab, setResearchTab] = useState<ResearchTabId>("strategy");
  const [settings, setSettings] = useState<BacktestSettings>(DEFAULT_BACKTEST);
  const [preset, setPreset] = useState<PresetName>("conservative");
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [customPair, setCustomPair] = useState("");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>("15m");
  const [yearsBack, setYearsBack] = useState(8);
  const [source, setSource] = useState<"binance" | "csv">("binance");
  const [csvName, setCsvName] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadMsg, setLoadMsg] = useState("");
  const [warning, setWarning] = useState<string | undefined>();
  const [dataNote, setDataNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<Awaited<ReturnType<typeof runBacktestOffMainThread>> | null>(
    null,
  );
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [selected, setSelected] = useState<TradeRecord | null>(null);
  const [persistSnapshots, setPersistSnapshots] = useState(true);
  const [runProgress, setRunProgress] = useState<number | null>(null);
  /** Сбрасывает незавершённое восстановление OHLCV из IndexedDB, если пользователь нажал «Загрузить». */
  const ohlcvRestoreGeneration = useRef(0);

  const effectiveSymbol = useMemo(() => {
    const c = customPair.trim().toUpperCase().replace("/", "");
    return c.length >= 6 ? c : symbol;
  }, [customPair, symbol]);

  const advancedMetrics = useMemo(() => {
    if (!metrics || !result || !candles.length) return null;
    return computeAdvancedResearchMetrics(
      metrics,
      result.trades,
      result.equity,
      candles,
      settings.dca.startDepositUsdt,
    );
  }, [metrics, result, candles, settings.dca.startDepositUsdt]);

  const interpretation = useMemo(() => {
    if (!metrics) return [];
    return buildInterpretation(metrics, advancedMetrics);
  }, [metrics, advancedMetrics]);

  const dataQualityReport = useMemo(() => analyzeDataQuality(candles), [candles]);

  const optimizationStub = useMemo(
    () => runOptimizationStub(candles, settings),
    [candles, settings],
  );

  const walkForwardStub = useMemo(() => runWalkForwardStub(candles), [candles]);

  const monteCarloStub = useMemo(
    () => runMonteCarloStub(result?.trades.map((t) => t.pnlUsdt) ?? []),
    [result],
  );

  const stressStub = useMemo(() => runStressSuiteStub(), []);

  const benchmarkStub = useMemo(
    () => computeBenchmarksStub(candles, settings.dca.startDepositUsdt),
    [candles, settings.dca.startDepositUsdt],
  );

  const heroStats = useMemo(() => {
    const eq =
      metrics != null ? settings.dca.startDepositUsdt + metrics.totalPnlUsdt : undefined;
    return {
      pair: effectiveSymbol.replace(/USDT$/, "/USDT"),
      interval,
      bars: candles.length,
      deposit: settings.dca.startDepositUsdt,
      equity: eq,
      retPct: metrics?.totalReturnPct,
      maxDdPct: metrics?.maxEquityDrawdownPct,
      trades: metrics?.trades,
    };
  }, [effectiveSymbol, interval, candles.length, settings.dca.startDepositUsdt, metrics]);

  /**
   * Восстановление OHLCV из IndexedDB при смене пары/ТФ/глубины или первом заходе.
   * Не перезаписывает результат активной кнопки «Загрузить OHLCV» (см. ohlcvRestoreGeneration).
   */
  useEffect(() => {
    if (source !== "binance") return;
    const genAtStart = ohlcvRestoreGeneration.current;
    let cancelled = false;
    const endMs = Date.now();
    const startMs = endMs - yearsBack * 365.25 * 24 * 3600 * 1000;
    void (async () => {
      const hit = await tryLoadOhlcvBrowserCache(
        effectiveSymbol,
        interval,
        yearsBack,
        startMs,
        endMs,
      );
      if (cancelled || genAtStart !== ohlcvRestoreGeneration.current) {
        return;
      }
      if (hit?.candles?.length) {
        const first = hit.candles[0]!;
        const last = hit.candles[hit.candles.length - 1]!;
        setCandles(hit.candles);
        setDataNote(
          `Восстановлено из кеша браузера (IndexedDB): ${hit.candles.length} баров · ${new Date(first.time * 1000).toISOString().slice(0, 10)} — ${new Date(last.time * 1000).toISOString().slice(0, 10)}`,
        );
        if (hit.warning) setWarning(hit.warning);
      } else {
        setCandles([]);
        setDataNote("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, effectiveSymbol, interval, yearsBack]);

  const openTradeOnChart = useCallback(
    (t: TradeRecord) => {
      useBacktestOverlayStore.getState().openTradeOnChart(t, effectiveSymbol, interval);
      router.push("/chart");
    },
    [effectiveSymbol, interval, router],
  );

  const applyPreset = useCallback(
    (name: Exclude<PresetName, "custom">) => {
      const p = presetSettings(name);
      setSettings((prev) => ({
        ...prev,
        ...p,
        dca: { ...prev.dca, ...p.dca },
        indicator: { ...prev.indicator },
      }));
      setPreset(name);
    },
    [],
  );

  const mergeImportedSettings = useCallback((s: BacktestSettings) => {
    setSettings({
      ...DEFAULT_BACKTEST,
      ...s,
      dca: { ...DEFAULT_BACKTEST.dca, ...s.dca },
      indicator: { ...DEFAULT_BACKTEST.indicator, ...s.indicator },
    });
    setPreset("custom");
  }, []);

  const loadData = async () => {
    ohlcvRestoreGeneration.current += 1;
    setBusy(true);
    setWarning(undefined);
    setLoadMsg("");
    try {
      const endMs = Date.now();
      const startMs = endMs - yearsBack * 365.25 * 24 * 3600 * 1000;

      if (source === "csv") {
        setLoadMsg("Загрузите CSV через поле ниже.");
        setBusy(false);
        return;
      }

      const { candles: data, warning: w } = await loadOhlcvBinance({
        symbol: effectiveSymbol,
        interval,
        startMs,
        endMs,
        yearsBack,
        forceRefresh: true,
        useCache: true,
        onProgress: (p) =>
          setLoadMsg(`${p.phase}: ${p.message} (${p.loadedBars} баров)`),
      });
      setCandles(data);
      setWarning(w);
      setDataNote(
        data.length
          ? `Данные: ${new Date(data[0]!.time * 1000).toISOString().slice(0, 10)} — ${new Date(data[data.length - 1]!.time * 1000).toISOString().slice(0, 10)} · ${data.length} баров`
          : "Нет данных",
      );
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
      setCandles([]);
    } finally {
      setBusy(false);
    }
  };

  const onCsvFile = async (file: File | null) => {
    if (!file) return;
    ohlcvRestoreGeneration.current += 1;
    setBusy(true);
    try {
      const text = await file.text();
      const data = parseOhlcvCsv(text);
      setCandles(data);
      setCsvName(file.name);
      setWarning(undefined);
      setDataNote(
        data.length
          ? `CSV «${file.name}»: ${data.length} баров · ${new Date(data[0]!.time * 1000).toISOString().slice(0, 10)} — ${new Date(data[data.length - 1]!.time * 1000).toISOString().slice(0, 10)}`
          : "CSV пуст",
      );
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!candles.length) {
      setWarning("Сначала загрузите исторические данные.");
      return;
    }
    const startMs = candles[0]!.time * 1000;
    setRunProgress(18);
    const progressTimer = window.setInterval(() => {
      setRunProgress((v) => {
        if (v == null || v >= 92) return v;
        return Math.min(92, v + 2);
      });
    }, 220);
    try {
      const res = await runBacktestOffMainThread(candles, effectiveSymbol, settings, startMs);
      window.clearInterval(progressTimer);
      setRunProgress(96);
      const m = computeMetrics(res.trades, res.equity, settings.dca.startDepositUsdt);
      setResult(res);
      setMetrics(m);
      setRunProgress(100);
      await new Promise((r) => setTimeout(r, 200));

      if (!persistSnapshots) return;
      try {
        const save = await fetch("/api/backtest/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: effectiveSymbol,
            interval,
            yearsBack,
            settings,
            trades: res.trades,
            equity: res.equity,
            metrics: m,
            candleCount: candles.length,
          }),
        });
        if (!save.ok) {
          const err = (await save.json().catch(() => ({}))) as { error?: string };
          console.warn("Снимок не сохранён:", err.error ?? save.status);
        }
      } catch (e) {
        console.warn("Снимок не сохранён (сеть или диск недоступны)", e);
      }
    } catch (e) {
      window.clearInterval(progressTimer);
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      window.clearInterval(progressTimer);
      setTimeout(() => setRunProgress(null), 350);
    }
  };

  const restoreFromServer = async () => {
    setWarning(undefined);
    try {
      const r = await fetch("/api/backtest/snapshot");
      const j = (await r.json()) as { snapshot: BacktestSnapshotFile | null };
      if (!j.snapshot) {
        setWarning("На сервере пока нет сохранённого бэктеста.");
        return;
      }
      const snap = j.snapshot;
      setSettings(snap.settings);
      if ((PAIRS as readonly string[]).includes(snap.symbol)) {
        setSymbol(snap.symbol);
        setCustomPair("");
      } else {
        setSymbol("ETHUSDT");
        setCustomPair(snap.symbol);
      }
      const iv = (INTERVALS as readonly string[]).includes(snap.interval)
        ? (snap.interval as (typeof INTERVALS)[number])
        : "15m";
      setInterval(iv);
      setYearsBack(snap.yearsBack || 8);
      setMetrics(snap.metrics);

      if (!candles.length) {
        setWarning(
          "Настройки восстановлены. Нажмите «Загрузить OHLCV» для тех же параметров — при включённом диске данные возьмутся из файлового кеша без повторной загрузки с Binance.",
        );
        return;
      }

      if (candles.length !== snap.candleCount) {
        setWarning(
          `В браузере загружено ${candles.length} баров, в снимке ${snap.candleCount}. Загрузите OHLCV с теми же параметрами (кеш на диске сервера ускорит это).`,
        );
        return;
      }

      const t0 = candles[0]!.time * 1000;
      const t1 = candles[candles.length - 1]!.time * 1000;
      setResult({
        candles,
        trades: snap.trades,
        equity: snap.equity,
        signals: new Array(candles.length).fill(null),
        signalMeta: new Array(candles.length).fill(null),
        dataRange: {
          fromMs: t0,
          toMs: t1,
          requestedFromMs: t0,
        },
      });
      setDataNote((prev) =>
        prev.includes("Восстановлено с сервера")
          ? prev
          : `${prev} · Восстановлено с сервера.`,
      );
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    }
  };

  const liqMarkers = useMemo(
    () =>
      result?.trades
        .filter((t) => t.exitReason === "liquidation")
        .map((t) => ({ time: t.exitTime })) ?? [],
    [result],
  );

  const stickyActions = (
    <>
      <button
        type="button"
        disabled={busy || !candles.length || runProgress != null}
        onClick={() => void run()}
        className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 disabled:opacity-40"
      >
        Запустить бэктест
      </button>
      <button
        type="button"
        onClick={() => void restoreFromServer()}
        className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100 hover:bg-sky-500/20"
      >
        Восстановить снимок
      </button>
      <button
        type="button"
        onClick={() => {
          setSettings(DEFAULT_BACKTEST);
          setPreset("conservative");
        }}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm hover:bg-white/[0.08]"
      >
        Сбросить настройки
      </button>
      <a
        href="/chart"
        className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-[var(--rex-muted)] hover:bg-white/[0.04]"
      >
        Демо-график
      </a>
    </>
  );

  return (
    <>
      <ResearchShell
        tab={researchTab}
        onTab={setResearchTab}
        heroStats={heroStats}
        runProgress={runProgress}
        stickyActions={stickyActions}
      >
        {warning && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {warning}
          </div>
        )}

        {researchTab === "strategy" && (
          <div className="space-y-6">
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
              <GlassCard glow="cyan" className="p-6">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Пара</span>
                    <select
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className={inp}
                    >
                      {PAIRS.map((p) => (
                        <option key={p} value={p}>
                          {p.replace("USDT", "/USDT")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Другая пара</span>
                    <input
                      placeholder="LINKUSDT"
                      value={customPair}
                      onChange={(e) => setCustomPair(e.target.value)}
                      className={`${inp} w-44`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Таймфрейм</span>
                    <select
                      value={interval}
                      onChange={(e) =>
                        setInterval(e.target.value as (typeof INTERVALS)[number])
                      }
                      className={inp}
                    >
                      {INTERVALS.map((iv) => (
                        <option key={iv} value={iv}>
                          {iv}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Глубина (лет)</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={yearsBack}
                      onChange={(e) => setYearsBack(Number(e.target.value))}
                      className={`${inp} w-24`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Источник</span>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as "binance" | "csv")}
                      className={inp}
                    >
                      <option value="binance">Binance Spot</option>
                      <option value="csv">CSV файл</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || source !== "binance"}
                    onClick={() => void loadData()}
                    className="rounded-xl bg-emerald-600/90 px-5 py-2 font-medium text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Загрузить OHLCV
                  </button>
                </div>

                {source === "csv" && (
                  <div className="mt-4 flex items-center gap-3">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
                      className="text-sm text-[var(--rex-muted)]"
                    />
                    {csvName && <span className="text-xs text-cyan-400">{csvName}</span>}
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--rex-muted)]">
                      Пресеты DCA
                    </span>
                    <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-[var(--rex-muted)]">
                      Это <strong className="font-medium text-[var(--rex-text)]">готовые наборы параметров сетки</strong>{" "}
                      (плечо, число уровней DCA, перекрытие диапазона цены, множители шага цены и объёма).{" "}
                      <strong className="font-medium text-[var(--rex-text)]">Тейк-профит 0.6%</strong> одинаковый во всех четырёх
                      пресетах (как в ваших Fast-профилях). Режим long/short не меняется — берётся из блока DCA. Индикатор V2 пресеты{" "}
                      <strong className="font-medium text-[var(--rex-text)]">не меняют</strong>.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {(["conservative", "start", "aggressive", "medium"] as const).map((p) => {
                      const meta = PRESET_UI[p];
                      const active = preset === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          title={meta.tooltip}
                          onClick={() => applyPreset(p)}
                          className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            active
                              ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_20px_-8px_rgba(34,211,238,0.45)]"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
                          }`}
                        >
                          <span className="text-[13px] font-semibold text-[var(--rex-text)]">{meta.titleRu}</span>
                          <span className="text-[10px] uppercase tracking-wide text-[var(--rex-muted)]">
                            {meta.titleEn}
                          </span>
                          <span className="text-[11px] leading-snug text-[var(--rex-muted)]">{meta.oneLine}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      title={PRESET_UI.custom.tooltip}
                      onClick={() => setPreset("custom")}
                      className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        preset === "custom"
                          ? "border-violet-500/45 bg-violet-500/10 shadow-[0_0_20px_-8px_rgba(167,139,250,0.35)]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="text-[13px] font-semibold text-[var(--rex-text)]">
                        {PRESET_UI.custom.titleRu}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--rex-muted)]">
                        {PRESET_UI.custom.titleEn}
                      </span>
                      <span className="text-[11px] leading-snug text-[var(--rex-muted)]">
                        {PRESET_UI.custom.oneLine}
                      </span>
                    </button>
                  </div>
                  <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--rex-muted)]">
                    <span className="font-medium text-cyan-200/90">Активно:</span>{" "}
                    <span className="text-[var(--rex-text)]">{PRESET_UI[preset].titleRu}</span> ({PRESET_UI[preset].titleEn}) —{" "}
                    {PRESET_UI[preset].oneLine}
                    <span className="text-[var(--rex-muted)]"> · Наведите на карточку для полной подсказки.</span>
                  </p>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[var(--rex-muted)]">
                  <input
                    type="checkbox"
                    checked={persistSnapshots}
                    onChange={(e) => setPersistSnapshots(e.target.checked)}
                    className="rounded border-white/20 bg-transparent"
                  />
                  Сохранять снимок на сервер (persistent disk)
                </label>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--rex-muted)]">
                  OHLCV с Binance дополнительно кладётся в{" "}
                  <strong className="font-medium text-[var(--rex-text)]">IndexedDB</strong> этого браузера
                  (ключ: пара + таймфрейм + глубина лет). После перезагрузки или деплоя на сервере данные
                  подставляются снова без повторной загрузки с биржи, пока вы не нажмёте «Загрузить OHLCV»
                  заново.
                </p>

                {busy && !candles.length && (
                  <div className="mt-4 space-y-2">
                    <SkeletonBlock className="h-3 w-full" />
                    <SkeletonBlock className="h-3 w-2/3" />
                  </div>
                )}
                {loadMsg && <p className="mt-3 text-xs text-cyan-400">{loadMsg}</p>}
                {dataNote && <p className="mt-2 text-sm text-[var(--rex-muted)]">{dataNote}</p>}
              </GlassCard>

              <div className="mt-6 lg:sticky lg:top-24 lg:mt-0">
                <DataQualityPanel
                  report={dataQualityReport}
                  sourceLabel={source === "binance" ? "Binance Spot" : "CSV"}
                  interval={interval}
                />
              </div>
            </div>

            <div className="lg:sticky lg:top-[5.5rem] lg:z-10 lg:-mx-2 lg:rounded-2xl lg:border lg:border-white/[0.06] lg:bg-[var(--rex-bg)]/95 lg:p-4 lg:backdrop-blur-md">
              <BacktestSettingsForm settings={settings} onChange={setSettings} />
            </div>
          </div>
        )}

        {researchTab === "results" && (
          <div className="space-y-6">
            <InterpretationPanel items={interpretation} />
            <BacktestResults m={metrics} />
            {metrics && advancedMetrics && (
              <ExtendedKpiGrid m={metrics} adv={advancedMetrics} />
            )}
            {!result && (
              <EmptyState
                title="Нет результатов"
                hint="Загрузите OHLCV во вкладке Strategy Setup и запустите бэктест."
              />
            )}
            {result && (
              <>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--rex-muted)]">
                  Equity & цена
                </h3>
                <GlassCard className="p-4">
                  <EquityCurve data={result.equity} liquidations={liqMarkers} height={300} />
                </GlassCard>
                <GlassCard className="p-4">
                  <PriceChart candles={result.candles} trades={result.trades} />
                </GlassCard>
              </>
            )}
          </div>
        )}

        {researchTab === "risk" && (
          <div className="space-y-6">
            {!result || !metrics ? (
              <EmptyState title="Сначала выполните бэктест" hint="Нужна кривая эквити и сделки." />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <GlassCard className="p-4">
                    <div className="mb-2 text-xs font-semibold uppercase text-[var(--rex-muted)]">
                      Equity curve
                    </div>
                    <EquityCurve data={result.equity} liquidations={liqMarkers} height={260} />
                  </GlassCard>
                  <GlassCard className="p-4">
                    <div className="mb-2 text-xs font-semibold uppercase text-[var(--rex-muted)]">
                      Underwater (drawdown %)
                    </div>
                    <UnderwaterChart equity={result.equity} height={260} />
                  </GlassCard>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile
                    label="Загрузка депозита (средн.)"
                    value={`${metrics.avgDepositLoadPct.toFixed(1)}%`}
                  />
                  <MetricTile
                    label="Загрузка депозита (max)"
                    value={`${metrics.maxDepositLoadPct.toFixed(1)}%`}
                    tooltip="Прокси для маржи в упрощённой модели."
                  />
                  <MetricTile
                    label="Max DD equity"
                    value={`${metrics.maxEquityDrawdownPct.toFixed(2)}%`}
                    trend="down"
                  />
                  <MetricTile
                    label="Ulcer (est.)"
                    value={
                      advancedMetrics?.ulcerIndex != null
                        ? advancedMetrics.ulcerIndex.toFixed(2)
                        : "—"
                    }
                  />
                </div>
                <GlassCard className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--rex-text)]">
                      Расширенный риск-анализ
                    </span>
                    <NeonBadge variant="warn">Частично stub</NeonBadge>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--rex-muted)]">
                    Распределение просадок, stress по окнам, ликвидационная близость и полный Monte
                    Carlo margin path — в модулях riskEngine / liquidationEngine (worker). Здесь —
                    базовые метрики из текущего бэктеста без изменения движка.
                  </p>
                </GlassCard>
              </>
            )}
          </div>
        )}

        {researchTab === "trades" && (
          <div>
            {!result ? (
              <EmptyState title="Нет сделок" hint="Запустите бэктест после загрузки данных." />
            ) : (
              <TradeAnalyticsSection
                trades={result.trades}
                onSelect={setSelected}
                onOpenChart={openTradeOnChart}
              />
            )}
          </div>
        )}

        {researchTab === "dca" && (
          <div>
            {!result || !metrics ? (
              <EmptyState title="Нет данных сетки" />
            ) : (
              <DcaGridSection
                trades={result.trades}
                avgDcaPerTrade={metrics.avgDcaOrdersPerTrade}
                maxDcaInTrade={metrics.maxDcaOrdersInTrade}
                fullGridHits={metrics.fullGridHits}
              />
            )}
          </div>
        )}

        {researchTab === "optimize" && (
          <div className="space-y-4">
            <LabStubPanel
              title="Optimization Lab"
              description="Перебор сетки TP, overlap, leverage и порогов индикатора с ранжированием по Sharpe / DD / profit factor и защитой от переобучения."
              architectureNote="optimizationEngine в Web Worker: batch runBacktest по комбинациям, агрегация метрик, флаг overfitting по деградации на hold-out."
            />
            {optimizationStub.warning && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                {optimizationStub.warning}
              </p>
            )}
          </div>
        )}

        {researchTab === "walkforward" && (
          <div className="space-y-4">
            <LabStubPanel
              title="Walk-forward analysis"
              description="In-sample оптимизация и out-of-sample проверка по rolling окнам; стабильность параметров и деградация доходности."
              architectureNote="walkForwardEngine: нарезка candles по времени, оптимизация на train, фикс параметров на test, таблица окон + equity."
            />
            {walkForwardStub.warning && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                {walkForwardStub.warning}
              </p>
            )}
          </div>
        )}

        {researchTab === "montecarlo" && (
          <div className="space-y-4">
            <LabStubPanel
              title="Monte Carlo"
              description="Перестановки и bootstrap сделок, случайный slippage/fees, оценка хвостовых рисков и fan-chart эквити."
              architectureNote="monteCarloEngine: симуляции на векторе PnL + параметры исполнения; вывод перцентилей и вероятностей."
            />
            <GlassCard className="p-4 font-mono text-xs text-[var(--rex-muted)]">
              status: {monteCarloStub.status} · sims: {monteCarloStub.simulations}
            </GlassCard>
          </div>
        )}

        {researchTab === "stress" && (
          <div className="space-y-4">
            <LabStubPanel
              title="Stress testing"
              description="Сценарии комиссий, гэпов, flash crash, длительный chop — сравнение выживаемости и запаса капитала."
              architectureNote="stressTestEngine: клонирование settings с множителями, повторный прогон backtestEngine."
            />
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-[11px] uppercase text-[var(--rex-muted)]">
                  <tr>
                    <th className="px-3 py-2">Сценарий</th>
                    <th className="px-3 py-2">Survived</th>
                    <th className="px-3 py-2">Max DD %</th>
                    <th className="px-3 py-2">Ликвидация</th>
                    <th className="px-3 py-2">Risk score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {stressStub.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">{s.label}</td>
                      <td className="px-3 py-2">{s.survived ? "yes" : "no"}</td>
                      <td className="px-3 py-2 font-mono">{s.maxDrawdownPct.toFixed(2)}</td>
                      <td className="px-3 py-2">{s.liquidated ? "yes" : "no"}</td>
                      <td className="px-3 py-2 font-mono">{s.riskScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {researchTab === "benchmark" && (
          <div className="space-y-6">
            {!candles.length ? (
              <EmptyState title="Нужны свечи" hint="Загрузите OHLCV для расчёта Buy & Hold." />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <GlassCard className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-[var(--rex-muted)]">
                        Стратегия (equity)
                      </span>
                      {metrics && (
                        <NeonBadge variant="ok">
                          Return {metrics.totalReturnPct.toFixed(2)}%
                        </NeonBadge>
                      )}
                    </div>
                    {result ? (
                      <EquityCurve data={result.equity} liquidations={liqMarkers} height={240} />
                    ) : (
                      <p className="text-sm text-[var(--rex-muted)]">Запустите бэктест.</p>
                    )}
                  </GlassCard>
                  <GlassCard className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-[var(--rex-muted)]">
                        Buy & Hold (stub close-only)
                      </span>
                      {benchmarkStub[0] && (
                        <NeonBadge>
                          Return {benchmarkStub[0].totalReturnPct.toFixed(2)}%
                        </NeonBadge>
                      )}
                    </div>
                    {benchmarkStub[0] ? (
                      <EquityCurve data={benchmarkStub[0].equity} height={240} />
                    ) : null}
                  </GlassCard>
                </div>
                <GlassCard className="overflow-hidden p-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/[0.03] text-[11px] uppercase text-[var(--rex-muted)]">
                      <tr>
                        <th className="px-4 py-2 text-left">Вариант</th>
                        <th className="px-4 py-2">Total return %</th>
                        <th className="px-4 py-2">Max DD %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      <tr>
                        <td className="px-4 py-2">DCA strategy</td>
                        <td className="px-4 py-2 font-mono">
                          {metrics ? metrics.totalReturnPct.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {metrics ? metrics.maxEquityDrawdownPct.toFixed(2) : "—"}
                        </td>
                      </tr>
                      {benchmarkStub.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-2">{b.label}</td>
                          <td className="px-4 py-2 font-mono">{b.totalReturnPct.toFixed(2)}</td>
                          <td className="px-4 py-2 font-mono">{b.maxDrawdownPct.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GlassCard>
              </>
            )}
          </div>
        )}

        {researchTab === "data" && (
          <DataQualityPanel
            report={dataQualityReport}
            sourceLabel={source === "binance" ? "Binance Spot" : "CSV"}
            interval={interval}
          />
        )}

        {researchTab === "reports" && (
          <ReportingPanel
            trades={result?.trades ?? []}
            equity={result?.equity ?? []}
            settings={settings}
            symbol={effectiveSymbol}
            interval={interval}
            onImportSettings={mergeImportedSettings}
          />
        )}
      </ResearchShell>

      <TradeDetailsModal
        trade={selected}
        candles={result?.candles ?? candles}
        interval={interval}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
