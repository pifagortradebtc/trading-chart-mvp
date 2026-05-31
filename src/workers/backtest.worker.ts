/**
 * Web Worker: тяжёлый runBacktest не блокирует UI-поток.
 */

import type { Candle } from "../types/candle";
import { runBacktest } from "../lib/backtest/backtestEngine";
import type { DepthBar } from "../lib/backtest/depthTypes";
import type { BacktestResult, BacktestSettings } from "../lib/backtest/types";

type BacktestWorkerPayload = {
  candles: Candle[];
  dailyCandles?: Candle[];
  chartIntervalMs?: number;
  symbol: string;
  settings: BacktestSettings;
  startMs: number;
  /** Binance-формат таймфрейма (15m, 1h, ...) — для Pifagor 21 опц. fallback. */
  intervalLabel?: string;
  /** Order-book depth серия для стратегий buyforce_dca / sellforce_dca. */
  depthBars?: DepthBar[];
};

self.onmessage = (ev: MessageEvent<BacktestWorkerPayload>) => {
  const { candles, dailyCandles, chartIntervalMs, symbol, settings, startMs, intervalLabel, depthBars } = ev.data;
  try {
    const full = runBacktest(
      candles,
      symbol,
      settings,
      startMs,
      dailyCandles,
      chartIntervalMs,
      intervalLabel,
      depthBars,
    );
    const { candles: candlesOut, ...rest } = full;
    void candlesOut;
    const msg:
      | { ok: true; result: Omit<BacktestResult, "candles"> }
      | { ok: false; error: string } = {
      ok: true,
      result: rest,
    };
    self.postMessage(msg);
  } catch (e) {
    const msg: { ok: false; error: string } = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(msg);
  }
};
