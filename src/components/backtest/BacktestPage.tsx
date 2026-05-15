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
import type { BacktestResult, BacktestSettings, TradeRecord } from "@/lib/backtest/types";
import { DEFAULT_BACKTEST, migrateBacktestSettings } from "@/lib/backtest/backtestDefaults";
import { BacktestSettingsForm } from "./BacktestSettings";
import { BacktestResults } from "./BacktestResults";
import { BacktestStrategyDashboard } from "./BacktestStrategyDashboard";
import { TradeDetailsModal } from "./TradeDetailsModal";
import { EquityCurve } from "./charts/EquityCurve";
import { PriceChart } from "./charts/PriceChart";
import type { BacktestSnapshotFile } from "@/lib/backtest/snapshotTypes";
import { intervalToChartTimeframe } from "@/lib/chart/intervalToChartTimeframe";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { useMarketStore } from "@/store/useMarketStore";
import { useBacktestLastRunStore } from "@/store/useBacktestLastRunStore";
import { computeAdvancedResearchMetrics } from "@/lib/research/advancedMetrics";
import { analyzeDataQuality } from "@/lib/research/dataQuality";
import { buildInterpretation } from "@/lib/research/interpretationRules";
import { computeBenchmarksStub } from "@/lib/research/engines";
import type { OptimizationRow, StressScenarioResult } from "@/lib/research/engines/types";
import { runMonteCarloTradeOrderShuffle } from "@/lib/research/monteCarloTrades";
import { runMiniTpOverlapGrid } from "@/lib/research/miniOptimization";
import { runStressSuiteClient } from "@/lib/research/stressRunner";
import { ResearchShell } from "@/components/research/ResearchShell";
import type { ResearchTabId } from "@/components/research/types";
import { EmptyState, GlassCard, MetricTile, NeonBadge, SkeletonBlock } from "@/components/research/ui";
import { UnderwaterChart } from "@/components/research/charts/UnderwaterChart";
import { ExtendedKpiGrid } from "@/components/research/panels/ExtendedKpiGrid";
import { InterpretationPanel } from "@/components/research/panels/InterpretationPanel";
import { DataQualityPanel } from "@/components/research/panels/DataQualityPanel";
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

const INTERVALS = ["15m", "1h", "4h", "1d", "3d"] as const;

/** Информационное сообщение dataProvider/API — не показываем как глобальный алерт на всех вкладках. */
const OHLCV_PARTIAL_HISTORY_PREFIX = "Биржа отдала данные только с";

const inp =
  "rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-[var(--rex-text)] outline-none ring-cyan-500/0 transition-shadow focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20";

export function BacktestPage() {
  const router = useRouter();
  const [researchTab, setResearchTab] = useState<ResearchTabId>("strategy");
  const [settings, setSettings] = useState<BacktestSettings>(DEFAULT_BACKTEST);
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [customPair, setCustomPair] = useState("");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>("15m");
  const [yearsBack, setYearsBack] = useState(8);
  const [source, setSource] = useState<"binance" | "csv">("binance");
  /** Включите, чтобы игнорировать IndexedDB и заново тянуть полный ряд (редко нужно). */
  const [forceOhlcvRefresh, setForceOhlcvRefresh] = useState(false);
  const [csvName, setCsvName] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadMsg, setLoadMsg] = useState("");
  const [warning, setWarning] = useState<string | undefined>();
  /** Неполная история Binance — только вкладка «Стратегия», не глобальный баннер. */
  const [ohlcvCoverageHint, setOhlcvCoverageHint] = useState<string | undefined>();
  const [dataNote, setDataNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Фоновая автозагрузка OHLCV при открытии страницы или восстановлении снимка (не ручная кнопка). */
  const [autoOhlcvBusy, setAutoOhlcvBusy] = useState(false);

  const [result, setResult] = useState<Awaited<ReturnType<typeof runBacktestOffMainThread>> | null>(
    null,
  );
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [selected, setSelected] = useState<TradeRecord | null>(null);
  const [persistSnapshots, setPersistSnapshots] = useState(true);
  const [runProgress, setRunProgress] = useState<number | null>(null);
  /** Сбрасывает незавершённое восстановление OHLCV из IndexedDB, если пользователь нажал «Загрузить». */
  const ohlcvRestoreGeneration = useRef(0);

  const [optRows, setOptRows] = useState<OptimizationRow[] | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optProgress, setOptProgress] = useState("");
  const [stressRows, setStressRows] = useState<StressScenarioResult[] | null>(null);
  const [stressLoading, setStressLoading] = useState(false);

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

  const monteCarloSummary = useMemo(() => {
    const pnls = result?.trades.map((t) => t.pnlUsdt) ?? [];
    return runMonteCarloTradeOrderShuffle(pnls, settings.dca.startDepositUsdt, 800);
  }, [result?.trades, settings.dca.startDepositUsdt]);

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

  /** Только служебное «неполная история» → локальная подсказка; остальное — глобальный warning. */
  const applyOhlcvWarning = useCallback((w: string | undefined) => {
    if (!w) {
      setOhlcvCoverageHint(undefined);
      return;
    }
    if (w.startsWith(OHLCV_PARTIAL_HISTORY_PREFIX)) {
      setOhlcvCoverageHint(w);
      return;
    }
    setOhlcvCoverageHint(undefined);
    setWarning(w);
  }, []);

  /** После возврата с `/chart` восстанавливаем прогон из памяти — иначе `result` теряется при размонтировании страницы. */
  useEffect(() => {
    const { lastResult, lastMetrics } = useBacktestLastRunStore.getState();
    if (!lastResult?.trades?.length) return;
    setResult({
      ...lastResult,
      openPositionAtDataEnd: lastResult.openPositionAtDataEnd ?? null,
      lastBarAtrKelt: lastResult.lastBarAtrKelt,
    });
    if (lastMetrics) setMetrics(lastMetrics);
    if (lastResult.candles?.length) {
      setCandles(lastResult.candles);
      const first = lastResult.candles[0]!;
      const last = lastResult.candles[lastResult.candles.length - 1]!;
      setDataNote(
        `Прогон восстановлен (${lastResult.candles.length} баров): ${new Date(first.time * 1000).toISOString().slice(0, 10)} — ${new Date(last.time * 1000).toISOString().slice(0, 10)}`,
      );
    }
  }, []);

  /**
   * При смене пары/ТФ/глубины: сначала IndexedDB, иначе автоматическая загрузка (серверный диск / Binance).
   * Не перезаписывает активную ручную загрузку (см. ohlcvRestoreGeneration).
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
        applyOhlcvWarning(hit.warning);
        return;
      }

      setAutoOhlcvBusy(true);
      setLoadMsg("Автозагрузка OHLCV (кеш сервера или биржа)…");
      try {
        const { candles: data, warning: w } = await loadOhlcvBinance({
          symbol: effectiveSymbol,
          interval,
          startMs,
          endMs,
          yearsBack,
          forceRefresh: false,
          useCache: true,
          onProgress: (p) =>
            setLoadMsg(`${p.phase}: ${p.message} (${p.loadedBars} баров)`),
        });
        if (cancelled || genAtStart !== ohlcvRestoreGeneration.current) {
          return;
        }
        if (data.length) {
          setCandles(data);
          applyOhlcvWarning(w);
          setDataNote(
            `Данные подставлены автоматически: ${new Date(data[0]!.time * 1000).toISOString().slice(0, 10)} — ${new Date(data[data.length - 1]!.time * 1000).toISOString().slice(0, 10)} · ${data.length} баров`,
          );
        } else {
          setCandles([]);
          setDataNote("");
          applyOhlcvWarning(undefined);
        }
      } catch {
        if (!cancelled && genAtStart === ohlcvRestoreGeneration.current) {
          setCandles([]);
          setDataNote("");
          applyOhlcvWarning(undefined);
        }
      } finally {
        /** Не опираемся на cancelled: при смене глубины cleanup отменяет задачу, иначе finally не сбрасывал busy → кнопки «мертвые». */
        if (genAtStart === ohlcvRestoreGeneration.current) {
          setAutoOhlcvBusy(false);
          setLoadMsg("");
        }
      }
    })();
    return () => {
      cancelled = true;
      setAutoOhlcvBusy(false);
      setLoadMsg("");
    };
  }, [source, effectiveSymbol, interval, yearsBack, applyOhlcvWarning]);

  const openTradeOnChart = useCallback(
    (t: TradeRecord) => {
      const tf = intervalToChartTimeframe(interval);
      if (result?.candles?.length) {
        useMarketStore.getState().hydrateFromBacktest(result.candles, effectiveSymbol, tf);
      }
      useBacktestOverlayStore.getState().openTradeOnChart(t, effectiveSymbol, interval);
      router.push("/chart");
    },
    [effectiveSymbol, interval, router, result],
  );

  const openSessionOnChart = useCallback(() => {
    if (!result?.trades.length) return;
    const tf = intervalToChartTimeframe(interval);
    if (result.candles?.length) {
      useMarketStore.getState().hydrateFromBacktest(result.candles, effectiveSymbol, tf);
    }
    useBacktestOverlayStore.getState().openSessionOnChart(
      result.trades,
      effectiveSymbol,
      interval,
      result.dataRange.fromMs,
      result.dataRange.toMs,
    );
    router.push("/chart");
  }, [result, effectiveSymbol, interval, router]);

  const mergeImportedSettings = useCallback((s: BacktestSettings) => {
    setSettings(migrateBacktestSettings(s));
  }, []);

  const runMiniOptimization = useCallback(async () => {
    if (!candles.length) {
      setWarning("Сначала загрузите OHLCV.");
      return;
    }
    setOptLoading(true);
    setOptProgress("…");
    try {
      const startMs = candles[0]!.time * 1000;
      const rows = await runMiniTpOverlapGrid(
        candles,
        effectiveSymbol,
        settings,
        startMs,
        (done, total) => setOptProgress(`${done} / ${total}`),
      );
      setOptRows(rows);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      setOptLoading(false);
      setOptProgress("");
    }
  }, [candles, effectiveSymbol, settings]);

  const runStressTests = useCallback(async () => {
    if (!candles.length) {
      setWarning("Сначала загрузите OHLCV.");
      return;
    }
    setStressLoading(true);
    try {
      const startMs = candles[0]!.time * 1000;
      const rows = await runStressSuiteClient(candles, effectiveSymbol, settings, startMs);
      setStressRows(rows);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      setStressLoading(false);
    }
  }, [candles, effectiveSymbol, settings]);

  const loadData = async () => {
    ohlcvRestoreGeneration.current += 1;
    setAutoOhlcvBusy(false);
    setBusy(true);
    setWarning(undefined);
    setOhlcvCoverageHint(undefined);
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
        forceRefresh: forceOhlcvRefresh,
        useCache: true,
        onProgress: (p) =>
          setLoadMsg(`${p.phase}: ${p.message} (${p.loadedBars} баров)`),
      });
      setCandles(data);
      applyOhlcvWarning(w);
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
      setOhlcvCoverageHint(undefined);
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
      useBacktestLastRunStore.getState().setLastRun(res, m);
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
    setOhlcvCoverageHint(undefined);
    try {
      const r = await fetch("/api/backtest/snapshot");
      const j = (await r.json()) as { snapshot: BacktestSnapshotFile | null };
      if (!j.snapshot) {
        setWarning("На сервере пока нет сохранённого бэктеста.");
        return;
      }
      const snap = j.snapshot;

      const iv = (INTERVALS as readonly string[]).includes(snap.interval)
        ? (snap.interval as (typeof INTERVALS)[number])
        : "15m";
      const yb = snap.yearsBack || 8;
      const snapSym = snap.symbol.replace("/", "").toUpperCase();
      const endMs = Date.now();
      const startMs = endMs - yb * 365.25 * 24 * 3600 * 1000;

      ohlcvRestoreGeneration.current += 1;
      const genAtRestore = ohlcvRestoreGeneration.current;

      setAutoOhlcvBusy(true);
      setLoadMsg("Восстановление снимка: загрузка OHLCV…");

      let loaded: Candle[] = [];
      let loadWarning: string | undefined;
      try {
        const res = await loadOhlcvBinance({
          symbol: snapSym,
          interval: iv,
          startMs,
          endMs,
          yearsBack: yb,
          forceRefresh: false,
          useCache: true,
          onProgress: (p) =>
            setLoadMsg(`Снимок: ${p.phase} — ${p.message} (${p.loadedBars})`),
        });
        loaded = res.candles;
        loadWarning = res.warning;
      } finally {
        setAutoOhlcvBusy(false);
        setLoadMsg("");
      }

      if (genAtRestore !== ohlcvRestoreGeneration.current) return;

      setSettings(migrateBacktestSettings(snap.settings));
      if ((PAIRS as readonly string[]).includes(snap.symbol)) {
        setSymbol(snap.symbol);
        setCustomPair("");
      } else {
        setSymbol("ETHUSDT");
        setCustomPair(snap.symbol);
      }
      setInterval(iv);
      setYearsBack(yb);
      setMetrics(snap.metrics);

      setCandles(loaded);
      applyOhlcvWarning(loadWarning);
      setDataNote(
        loaded.length
          ? `Данные: ${new Date(loaded[0]!.time * 1000).toISOString().slice(0, 10)} — ${new Date(loaded[loaded.length - 1]!.time * 1000).toISOString().slice(0, 10)} · ${loaded.length} баров · снимок сервера`
          : "Нет данных",
      );

      if (!loaded.length) {
        setResult(null);
        useBacktestLastRunStore.getState().clearLastRun();
        setOhlcvCoverageHint(undefined);
        setWarning(
          "Настройки из снимка применены, но OHLCV не удалось загрузить. Проверьте сеть или нажмите «Загрузить OHLCV».",
        );
        return;
      }

      if (loaded.length !== snap.candleCount) {
        setResult(null);
        useBacktestLastRunStore.getState().clearLastRun();
        setOhlcvCoverageHint(undefined);
        setWarning(
          `Загружено ${loaded.length} баров, в снимке было ${snap.candleCount}. Кривая и сделки из снимка не восстановлены — запустите бэктест заново при необходимости.`,
        );
        return;
      }

      const t0 = loaded[0]!.time * 1000;
      const t1 = loaded[loaded.length - 1]!.time * 1000;
      const restored: BacktestResult = {
        candles: loaded,
        trades: snap.trades,
        equity: snap.equity,
        signals: new Array(loaded.length).fill(null),
        signalMeta: new Array(loaded.length).fill(null),
        dataRange: {
          fromMs: t0,
          toMs: t1,
          requestedFromMs: t0,
        },
        openPositionAtDataEnd: null,
        lastBarAtrKelt: undefined,
      };
      setResult(restored);
      useBacktestLastRunStore.getState().setLastRun(restored, snap.metrics);
      setDataNote(
        `Данные: ${new Date(loaded[0]!.time * 1000).toISOString().slice(0, 10)} — ${new Date(loaded[loaded.length - 1]!.time * 1000).toISOString().slice(0, 10)} · ${loaded.length} баров · снимок сервера (бэктест восстановлен)`,
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
        disabled={busy || autoOhlcvBusy || !candles.length || runProgress != null}
        onClick={() => void run()}
        className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 disabled:opacity-40"
      >
        Запустить бэктест
      </button>
      <button
        type="button"
        disabled={!result?.trades.length}
        onClick={() => openSessionOnChart()}
        title="Открыть график той же пары и ТФ со всеми сделками прогона"
        className="rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
      >
        График со сделками
      </button>
      <button
        type="button"
        onClick={() => {
          setSettings(DEFAULT_BACKTEST);
        }}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm hover:bg-white/[0.08]"
      >
        Сбросить настройки
      </button>
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
            {ohlcvCoverageHint && (
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="min-w-0 flex-1 leading-snug">{ohlcvCoverageHint}</p>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-amber-400/35 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/15"
                  onClick={() => setOhlcvCoverageHint(undefined)}
                >
                  Скрыть
                </button>
              </div>
            )}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
              <GlassCard glow="cyan" className="p-6">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[var(--rex-muted)]">Пара</span>
                    <select
                      value={symbol}
                      onChange={(e) => {
                        setSymbol(e.target.value);
                        /** Иначе старый текст в «Другая пара» перекрывает выбор из списка. */
                        setCustomPair("");
                      }}
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
                      title="Если указано непустое значение (от 6 символов), оно заменяет пару из списка слева — оставьте пустым для ETH/BTC из выпадающего списка."
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
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--rex-muted)]">
                    <input
                      type="checkbox"
                      className="rounded border-white/20"
                      checked={forceOhlcvRefresh}
                      disabled={source !== "binance"}
                      onChange={(e) => setForceOhlcvRefresh(e.target.checked)}
                    />
                    <span title="Иначе подтягиваются только новые бары поверх сохранённых">
                      Полная перезагрузка (без кеша)
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={busy || autoOhlcvBusy || source !== "binance"}
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

                <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-[var(--rex-muted)]">
                  <input
                    type="checkbox"
                    checked={persistSnapshots}
                    onChange={(e) => setPersistSnapshots(e.target.checked)}
                    className="rounded border-white/20 bg-transparent"
                  />
                  Сохранять снимок на сервер (persistent disk)
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    disabled={busy || autoOhlcvBusy}
                    title="Подставляет последний сохранённый бэктест (настройки, сделки, кривая)"
                    onClick={() => void restoreFromServer()}
                    className="text-left text-[11px] text-sky-300/90 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Восстановить последний бэктест с сервера (сделки и equity)
                  </button>
                </div>

                {(busy || autoOhlcvBusy) && !candles.length && (
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
            <BacktestResults m={metrics} />
            {result && metrics ? (
              <BacktestStrategyDashboard result={result} settings={settings} interval={interval} />
            ) : null}
            <InterpretationPanel items={interpretation} />
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
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-[var(--rex-text)]">Optimization Lab</h3>
              <p className="mt-2 text-sm text-[var(--rex-muted)]">
                Мини-сетка по текущим данным: TP [0.5, 0.55, 0.6] × overlap [20, 25, 30] —{" "}
                <strong className="text-[var(--rex-text)]">9 прогонов</strong> бэктеста в worker (может занять
                время на длинной истории). Остальные параметры — из ваших настроек DCA и индикатора.
              </p>
              <div className="mt-3">
                <NeonBadge variant="warn">
                  Без out-of-sample — колонка overfitting = «medium»; не принимайте топ-1 как истину.
                </NeonBadge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!candles.length || optLoading}
                  onClick={() => void runMiniOptimization()}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {optLoading ? `Считаю… ${optProgress}` : "Запустить мини-сетку (9×)"}
                </button>
                {!candles.length && (
                  <span className="text-xs text-amber-200/90">Нужны загруженные свечи.</span>
                )}
              </div>
            </GlassCard>
            {optRows && optRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/[0.03] text-[11px] uppercase text-[var(--rex-muted)]">
                    <tr>
                      <th className="px-3 py-2">TP %</th>
                      <th className="px-3 py-2">Overlap %</th>
                      <th className="px-3 py-2">Return %</th>
                      <th className="px-3 py-2">Max DD %</th>
                      <th className="px-3 py-2">PF</th>
                      <th className="px-3 py-2">Sharpe~</th>
                      <th className="px-3 py-2">Liq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {optRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono">{r.params.dca?.takeProfitPct ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{r.params.dca?.priceOverlapPct ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{r.totalReturnPct.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">{r.maxDrawdownPct.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">{r.profitFactor.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">
                          {r.sharpeApprox != null ? r.sharpeApprox.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2">{r.liquidations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {researchTab === "walkforward" && (
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-[var(--rex-text)]">Walk-forward analysis</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--rex-muted)]">
              Здесь появится разбиение выборки на окна, оптимизация на train и проверка на out-of-sample.
              Это отдельный модуль с множеством прогонов — пока не подключён; основной бэктест и вкладки Results /
              Risk работают как обычно.
            </p>
          </GlassCard>
        )}

        {researchTab === "montecarlo" && (
          <div className="space-y-4">
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-[var(--rex-text)]">Monte Carlo</h3>
              <p className="mt-2 text-sm text-[var(--rex-muted)]">
                Перестановки <strong className="text-[var(--rex-text)]">порядка сделок</strong> при том же наборе
                PnL (~800 симуляций). Оцениваются финальная эквити и хвост просадки по пути — после того как есть
                результат бэктеста.
              </p>
            </GlassCard>
            {!result?.trades?.length ? (
              <EmptyState
                title="Нет сделок для симуляции"
                hint="Сначала загрузите OHLCV и выполните бэктест во вкладке Strategy Setup."
              />
            ) : (
              <GlassCard glow="cyan" className="p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile
                    label="Симуляций"
                    value={String(monteCarloSummary.simulations)}
                  />
                  <MetricTile
                    label="Медиана equity"
                    value={monteCarloSummary.medianEquity.toFixed(2)}
                  />
                  <MetricTile label="5-й перцентиль" value={monteCarloSummary.p5Equity.toFixed(2)} />
                  <MetricTile label="95-й перцентиль" value={monteCarloSummary.p95Equity.toFixed(2)} />
                  <MetricTile
                    label="P(final &lt; депозит)"
                    value={`${(monteCarloSummary.probLoss * 100).toFixed(1)}%`}
                  />
                  {monteCarloSummary.probDdOver50Pct != null && (
                    <MetricTile
                      label="P(max DD пути &gt; 50%)"
                      value={`${(monteCarloSummary.probDdOver50Pct * 100).toFixed(1)}%`}
                    />
                  )}
                </div>
                {monteCarloSummary.note && (
                  <p className="mt-4 text-xs text-[var(--rex-muted)]">{monteCarloSummary.note}</p>
                )}
              </GlassCard>
            )}
          </div>
        )}

        {researchTab === "stress" && (
          <div className="space-y-4">
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-[var(--rex-text)]">Stress testing</h3>
              <p className="mt-2 text-sm text-[var(--rex-muted)]">
                Четыре сценария с изменёнными комиссиями и funding — каждый полный прогон бэктеста в worker.
                Нажмите кнопку после загрузки свечей (долго на больших выборках).
              </p>
              <button
                type="button"
                disabled={!candles.length || stressLoading}
                onClick={() => void runStressTests()}
                className="mt-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {stressLoading ? "Считаю стресс-сценарии…" : "Запустить стресс-тесты (4×)"}
              </button>
            </GlassCard>
            {stressRows && stressRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/[0.03] text-[11px] uppercase text-[var(--rex-muted)]">
                    <tr>
                      <th className="px-3 py-2">Сценарий</th>
                      <th className="px-3 py-2">Final equity</th>
                      <th className="px-3 py-2">Max DD %</th>
                      <th className="px-3 py-2">Ликвидации</th>
                      <th className="px-3 py-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {stressRows.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2">{s.label}</td>
                        <td className="px-3 py-2 font-mono">{s.finalEquity.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">{s.maxDrawdownPct.toFixed(2)}</td>
                        <td className="px-3 py-2">{s.liquidated ? "да" : "нет"}</td>
                        <td className="px-3 py-2 font-mono">{s.riskScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {researchTab === "benchmark" && (
          <div className="space-y-6">
            {!candles.length ? (
              <div className="space-y-4">
                <EmptyState
                  title="Нужны свечи"
                  hint="Загрузите OHLCV во вкладке Strategy Setup — Buy & Hold строится по тем же барам."
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setResearchTab("strategy")}
                    className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
                  >
                    Перейти к загрузке данных
                  </button>
                </div>
              </div>
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
