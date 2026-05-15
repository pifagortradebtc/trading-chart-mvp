/**
 * Клиентский оркестратор портфельного бэктеста Pifagor ALTS.
 */

import { loadOhlcvBinance } from "./dataProvider";
import { applyPifagorTvDefaults } from "./backtestDefaults";
import {
  buildPortfolioBacktestResult,
  buildSymbolResultFromRun,
} from "./portfolioAltsAggregate";
import { PORTFOLIO_ALTS_SYMBOLS } from "./portfolioAltsSymbols";
import type { PortfolioBacktestResult, PortfolioRunProgress } from "./portfolioAltsTypes";
import { runBacktestOffMainThread } from "./runBacktestClient";
import type { BacktestSettings } from "./types";

const MIN_BARS = 120;

function perSymbolSettings(
  settings: BacktestSettings,
  depositPerSymbol: number,
): BacktestSettings {
  return applyPifagorTvDefaults(
    {
      ...settings,
      strategyKind: "pifagor_alts",
      pifagorAlts: {
        ...settings.pifagorAlts,
      },
      dca: {
        ...settings.dca,
        startDepositUsdt: depositPerSymbol,
        walletBalanceUsdt: depositPerSymbol,
      },
    },
    {
      startDepositUsdt: depositPerSymbol,
      entryNotionalUsdt: settings.pifagorAlts.entryNotionalUsdt,
    },
  );
}

export async function runPortfolioAltsBacktest(opts: {
  settings: BacktestSettings;
  interval: string;
  yearsBack: number;
  forceRefresh?: boolean;
  onProgress?: (p: PortfolioRunProgress) => void;
  signal?: AbortSignal;
}): Promise<PortfolioBacktestResult> {
  const { settings, interval, yearsBack, forceRefresh = false, onProgress, signal } = opts;
  const symbols = PORTFOLIO_ALTS_SYMBOLS;
  /** Полный депозит на каждый актив — как отдельный бэктест в TradingView. */
  const depositPerSymbol = settings.dca.startDepositUsdt;
  const endMs = Date.now();
  const startMs = endMs - yearsBack * 365.25 * 24 * 3600 * 1000;

  const rows: ReturnType<typeof buildSymbolResultFromRun>[] = [];

  for (let i = 0; i < symbols.length; i++) {
    if (signal?.aborted) {
      throw new Error("Портфельный бэктест отменён");
    }

    const { symbol, label } = symbols[i]!;
    onProgress?.({
      phase: "load",
      current: i + 1,
      total: symbols.length,
      symbol,
      message: `Загрузка OHLCV ${label}…`,
    });

    let candles: Awaited<ReturnType<typeof loadOhlcvBinance>>["candles"] = [];
    let loadWarning: string | undefined;
    try {
      const loaded = await loadOhlcvBinance({
        symbol,
        interval,
        startMs,
        endMs,
        yearsBack,
        forceRefresh,
        useCache: true,
        onProgress: (p) =>
          onProgress?.({
            phase: "load",
            current: i + 1,
            total: symbols.length,
            symbol,
            message: `${label}: ${p.message}`,
          }),
      });
      candles = loaded.candles;
      loadWarning = loaded.warning;
    } catch (e) {
      rows.push(
        buildSymbolResultFromRun({
          symbol,
          label,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          candleCount: 0,
          dataFromMs: null,
          dataToMs: null,
          allocatedDepositUsdt: depositPerSymbol,
          run: null,
        }),
      );
      continue;
    }

    if (candles.length < MIN_BARS) {
      rows.push(
        buildSymbolResultFromRun({
          symbol,
          label,
          status: "skipped",
          error: candles.length
            ? `Мало данных (${candles.length} баров)`
            : "Нет истории на Binance",
          warning: loadWarning,
          candleCount: candles.length,
          dataFromMs: candles[0] ? candles[0]!.time * 1000 : null,
          dataToMs: candles.length ? candles[candles.length - 1]!.time * 1000 : null,
          allocatedDepositUsdt: depositPerSymbol,
          run: null,
        }),
      );
      continue;
    }

    onProgress?.({
      phase: "run",
      current: i + 1,
      total: symbols.length,
      symbol,
      message: `Бэктест ${label}…`,
    });

    const runSettings = perSymbolSettings(settings, depositPerSymbol);
    const barStartMs = candles[0]!.time * 1000;

    try {
      const result = await runBacktestOffMainThread(
        candles,
        symbol,
        runSettings,
        barStartMs,
      );
      rows.push(
        buildSymbolResultFromRun({
          symbol,
          label,
          status: "ok",
          warning: loadWarning ?? result.warning,
          candleCount: candles.length,
          dataFromMs: barStartMs,
          dataToMs: candles[candles.length - 1]!.time * 1000,
          allocatedDepositUsdt: depositPerSymbol,
          run: {
            trades: result.trades,
            equity: result.equity,
            openPositionAtDataEnd: result.openPositionAtDataEnd,
            warning: result.warning,
          },
        }),
      );
    } catch (e) {
      rows.push(
        buildSymbolResultFromRun({
          symbol,
          label,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          warning: loadWarning,
          candleCount: candles.length,
          dataFromMs: barStartMs,
          dataToMs: candles[candles.length - 1]!.time * 1000,
          allocatedDepositUsdt: depositPerSymbol,
          run: null,
        }),
      );
    }
  }

  onProgress?.({
    phase: "aggregate",
    current: symbols.length,
    total: symbols.length,
    symbol: "",
    message: "Агрегация результатов…",
  });

  return buildPortfolioBacktestResult({
    settings,
    interval,
    yearsBack,
    depositPerSymbolUsdt: depositPerSymbol,
    entryNotionalPerSymbolUsdt: settings.pifagorAlts.entryNotionalUsdt,
    rows,
  });
}
