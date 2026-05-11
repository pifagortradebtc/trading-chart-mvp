/**
 * Web Worker: тяжёлый runBacktest не блокирует UI-поток.
 */

import type { Candle } from "../types/candle";
import { runBacktest } from "../lib/backtest/backtestEngine";
import type { BacktestResult, BacktestSettings } from "../lib/backtest/types";

type BacktestWorkerPayload = {
  candles: Candle[];
  symbol: string;
  settings: BacktestSettings;
  startMs: number;
};

self.onmessage = (ev: MessageEvent<BacktestWorkerPayload>) => {
  const { candles, symbol, settings, startMs } = ev.data;
  try {
    const full = runBacktest(candles, symbol, settings, startMs);
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
