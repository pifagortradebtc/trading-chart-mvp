"use client";

import { useCallback, useMemo, useState } from "react";
import type { Candle } from "@/types/candle";
import { loadOhlcvBinance, parseOhlcvCsv } from "@/lib/backtest/dataProvider";
import { runBacktest } from "@/lib/backtest/backtestEngine";
import { computeMetrics, type MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestSettings } from "@/lib/backtest/types";
import { DEFAULT_BACKTEST } from "@/lib/backtest/backtestDefaults";
import { BacktestSettingsForm } from "./BacktestSettings";
import { BacktestResults } from "./BacktestResults";
import { TradeTable } from "./TradeTable";
import { TradeDetailsModal } from "./TradeDetailsModal";
import { EquityCurve } from "./charts/EquityCurve";
import { PriceChart } from "./charts/PriceChart";
import type { TradeRecord } from "@/lib/backtest/types";
import type { BacktestSnapshotFile } from "@/lib/backtest/snapshotTypes";

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

type PresetName = "conservative" | "balanced" | "aggressive" | "custom";

function presetSettings(name: Exclude<PresetName, "custom">): Partial<BacktestSettings> {
  if (name === "conservative") {
    return {
      dca: {
        ...DEFAULT_BACKTEST.dca,
        leverage: 4,
        ordersCount: 7,
        priceOverlapPct: 25,
        priceFactor: 1.6,
        volumeFactor: 1.2,
        takeProfitPct: 0.6,
        mode: "long",
        allowLong: true,
        allowShort: false,
      },
    };
  }
  if (name === "balanced") {
    return {
      dca: {
        ...DEFAULT_BACKTEST.dca,
        leverage: 6,
        ordersCount: 8,
        priceOverlapPct: 30,
        priceFactor: 1.45,
        volumeFactor: 1.35,
        takeProfitPct: 0.55,
      },
    };
  }
  return {
    dca: {
      ...DEFAULT_BACKTEST.dca,
      leverage: 10,
      ordersCount: 10,
      priceOverlapPct: 40,
      priceFactor: 1.35,
      volumeFactor: 1.5,
      takeProfitPct: 0.45,
    },
  };
}

export function BacktestPage() {
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

  const [result, setResult] = useState<ReturnType<typeof runBacktest> | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [selected, setSelected] = useState<TradeRecord | null>(null);
  /** Сохранять результат бэктеста в файлы на persistent disk (через API). */
  const [persistSnapshots, setPersistSnapshots] = useState(true);

  const effectiveSymbol = useMemo(() => {
    const c = customPair.trim().toUpperCase().replace("/", "");
    return c.length >= 6 ? c : symbol;
  }, [customPair, symbol]);

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

  const loadData = async () => {
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
    const res = runBacktest(candles, effectiveSymbol, settings, startMs);
    setResult(res);
    const m = computeMetrics(res.trades, res.equity, settings.dca.startDepositUsdt);
    setMetrics(m);

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

  return (
    <div className="min-h-screen bg-[#0c0e14] pb-16 text-[#d1d4dc]">
      <header className="border-b border-[#2e3241] bg-[#131722]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#d1d4dc]">
              DCA Backtest · V2_ЧайкКельт
            </h1>
            <p className="text-sm text-[#787b86]">
              Первый вход только по сигналу индикатора, затем факторная DCA-сетка.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !candles.length}
              onClick={() => void run()}
              className="rounded-xl bg-[#2962ff] px-6 py-2.5 font-semibold text-white shadow-lg hover:bg-[#1e55f5] disabled:opacity-40"
            >
              Запустить бэктест
            </button>
            <button
              type="button"
              onClick={() => void restoreFromServer()}
              className="rounded-xl border border-sky-600/50 bg-sky-950/40 px-4 py-2.5 text-sm text-sky-200 hover:bg-sky-950/70"
            >
              Восстановить снимок с сервера
            </button>
            <button
              type="button"
              onClick={() => {
                setSettings(DEFAULT_BACKTEST);
                setPreset("conservative");
              }}
              className="rounded-xl border border-[#2e3241] px-4 py-2.5 text-sm hover:bg-[#1e222d]"
            >
              Сбросить настройки
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-8">
        <section className="rounded-2xl border border-[#2e3241] bg-[#131722] p-6 shadow-xl">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#787b86]">Пара</span>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 font-mono"
              >
                {PAIRS.map((p) => (
                  <option key={p} value={p}>
                    {p.replace("USDT", "/USDT")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#787b86]">Другая пара (USDT)</span>
              <input
                placeholder="Напр. LINKUSDT"
                value={customPair}
                onChange={(e) => setCustomPair(e.target.value)}
                className="w-44 rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#787b86]">Таймфрейм</span>
              <select
                value={interval}
                onChange={(e) =>
                  setInterval(e.target.value as (typeof INTERVALS)[number])
                }
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2"
              >
                {INTERVALS.map((iv) => (
                  <option key={iv} value={iv}>
                    {iv}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#787b86]">Глубина (лет)</span>
              <input
                type="number"
                min={1}
                max={12}
                value={yearsBack}
                onChange={(e) => setYearsBack(Number(e.target.value))}
                className="w-24 rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#787b86]">Источник</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as "binance" | "csv")}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2"
              >
                <option value="binance">Binance Spot</option>
                <option value="csv">CSV файл</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || source !== "binance"}
              onClick={loadData}
              className="rounded-xl bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              Загрузить OHLCV
            </button>
          </div>

          {source === "csv" && (
            <div className="mt-4 flex items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[#787b86]"
              />
              {csvName && <span className="text-xs text-sky-400">{csvName}</span>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs uppercase text-[#787b86]">Пресеты:</span>
            {(["conservative", "balanced", "aggressive"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                  preset === p
                    ? "bg-[#2962ff] text-white"
                    : "bg-[#1e222d] text-[#9ca3af] hover:bg-[#2e3241]"
                }`}
              >
                {p === "conservative"
                  ? "Conservative"
                  : p === "balanced"
                    ? "Balanced"
                    : "Aggressive"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset("custom")}
              className={`rounded-lg px-3 py-1 text-xs ${
                preset === "custom" ? "bg-[#2962ff] text-white" : "bg-[#1e222d] text-[#9ca3af]"
              }`}
            >
              Custom
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#9ca3af]">
            <input
              type="checkbox"
              checked={persistSnapshots}
              onChange={(e) => setPersistSnapshots(e.target.checked)}
              className="rounded border-[#2e3241]"
            />
            Сохранять результаты бэктеста на диск сервера (persistent disk на Render)
          </label>

          {loadMsg && <p className="mt-3 text-xs text-sky-400">{loadMsg}</p>}
          {dataNote && <p className="mt-2 text-sm text-[#9ca3af]">{dataNote}</p>}
          {warning && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {warning}
            </p>
          )}
        </section>

        <BacktestSettingsForm settings={settings} onChange={setSettings} />

        <section>
          <h2 className="mb-4 text-lg font-semibold text-[#d1d4dc]">Результаты</h2>
          <BacktestResults m={metrics} />
        </section>

        {result && (
          <>
            <section>
              <h2 className="mb-4 text-lg font-semibold">Equity curve</h2>
              <EquityCurve data={result.equity} liquidations={liqMarkers} />
            </section>
            <section>
              <h2 className="mb-4 text-lg font-semibold">Цена и входы</h2>
              <PriceChart candles={result.candles} trades={result.trades} />
            </section>
            <section>
              <h2 className="mb-4 text-lg font-semibold">Сделки</h2>
              <TradeTable trades={result.trades} onSelect={setSelected} />
            </section>
          </>
        )}

        <TradeDetailsModal
          trade={selected}
          candles={result?.candles ?? candles}
          onClose={() => setSelected(null)}
        />
      </main>
    </div>
  );
}
