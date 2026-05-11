"use client";

import { create } from "zustand";
import type { TradeRecord } from "@/lib/backtest/types";
import {
  buildChartLevelsFromTrade,
  type ChartOverlayLevel,
} from "@/lib/backtest/chartOverlayLevels";

export interface ChartFetchParams {
  symbolBinance: string;
  interval: string;
  startMs: number;
  endMs: number;
}

interface BacktestOverlayState {
  levels: ChartOverlayLevel[];
  fetchParams: ChartFetchParams | null;
  metaTitle: string;
  /** Поставить уровни и диапазон загрузки свечей с графика бэктеста */
  openTradeOnChart: (
    trade: TradeRecord,
    symbolBinance: string,
    interval: string,
    padMs?: number,
  ) => void;
  clear: () => void;
}

const PAD_DEFAULT_MS = 14 * 24 * 3600 * 1000;

export const useBacktestOverlayStore = create<BacktestOverlayState>((set) => ({
  levels: [],
  fetchParams: null,
  metaTitle: "",

  openTradeOnChart: (trade, symbolBinance, interval, padMs = PAD_DEFAULT_MS) => {
    const levels = buildChartLevelsFromTrade(trade);
    const startMs = Math.max(0, trade.entrySignalTime - padMs);
    const endMs = trade.exitTime + padMs;
    set({
      levels,
      fetchParams: {
        symbolBinance: symbolBinance.replace("/", "").toUpperCase(),
        interval,
        startMs,
        endMs,
      },
      metaTitle: `Сделка #${trade.id} · ${trade.side.toUpperCase()} · ${trade.regime}`,
    });
  },

  clear: () =>
    set({
      levels: [],
      fetchParams: null,
      metaTitle: "",
    }),
}));
