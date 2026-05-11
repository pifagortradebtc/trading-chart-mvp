/**
 * Запуск бэктеста в Web Worker (только браузер).
 */

import type { Candle } from "@/types/candle";
import type { BacktestResult, BacktestSettings } from "./types";

type WorkerSuccess = { ok: true; result: Omit<BacktestResult, "candles"> };
type WorkerFail = { ok: false; error: string };

export function runBacktestOffMainThread(
  candles: Candle[],
  symbol: string,
  settings: BacktestSettings,
  startMs: number,
): Promise<BacktestResult> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Web Workers недоступны в этой среде"));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/backtest.worker.ts", import.meta.url));
    const fail = (err: Error) => {
      worker.terminate();
      reject(err);
    };

    worker.onmessage = (ev: MessageEvent<WorkerSuccess | WorkerFail>) => {
      worker.terminate();
      const data = ev.data;
      if (data.ok) {
        resolve({
          ...data.result,
          candles,
        });
      } else {
        reject(new Error(data.error));
      }
    };

    worker.onerror = (e) => {
      fail(new Error(e.message || "Worker error"));
    };

    worker.postMessage({ candles, symbol, settings, startMs });
  });
}
