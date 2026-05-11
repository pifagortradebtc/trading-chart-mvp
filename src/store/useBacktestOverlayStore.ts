"use client";

import { create } from "zustand";
import type { TradeRecord } from "@/lib/backtest/types";
import type { ChartOverlayLevel } from "@/lib/backtest/chartOverlayLevels";

export interface ChartFetchParams {
  symbolBinance: string;
  interval: string;
  startMs: number;
  endMs: number;
}

interface BacktestOverlayState {
  levels: ChartOverlayLevel[];
  /** Сделки для маркеров на графике (одна или все из прогона). */
  sessionTrades: TradeRecord[];
  fetchParams: ChartFetchParams | null;
  metaTitle: string;
  /** Убрать watchlist, объём, RSI, инструменты рисования — только свечи и сделки. */
  cleanChartUi: boolean;
  /** Одна сделка: маркеры сигнала/TP и отрезки уровней DCA (без бесконечных горизонталей). */
  openTradeOnChart: (
    trade: TradeRecord,
    symbolBinance: string,
    interval: string,
    padMs?: number,
  ) => void;
  /** Весь прогон: маркеры и отрезки сетки DCA по сделкам (уровни из стора не используются). */
  openSessionOnChart: (
    trades: TradeRecord[],
    symbolBinance: string,
    interval: string,
    fromMs: number,
    toMs: number,
    padMs?: number,
  ) => void;
  clear: () => void;
}

const PAD_DEFAULT_MS = 14 * 24 * 3600 * 1000;

export const useBacktestOverlayStore = create<BacktestOverlayState>((set) => ({
  levels: [],
  sessionTrades: [],
  fetchParams: null,
  metaTitle: "",
  cleanChartUi: false,

  openTradeOnChart: (trade, symbolBinance, interval, padMs = PAD_DEFAULT_MS) => {
    const startMs = Math.max(0, trade.entrySignalTime - padMs);
    const endMs = trade.exitTime + padMs;
    const sym = symbolBinance.replace("/", "").toUpperCase();
    set({
      levels: [],
      sessionTrades: [trade],
      fetchParams: {
        symbolBinance: sym,
        interval,
        startMs,
        endMs,
      },
      metaTitle: `Сделка #${trade.id} · ${sym} · ${interval} · ${trade.side.toUpperCase()} · ${trade.regime}`,
      cleanChartUi: true,
    });
  },

  openSessionOnChart: (trades, symbolBinance, interval, fromMs, toMs, padMs = PAD_DEFAULT_MS) => {
    const sym = symbolBinance.replace("/", "").toUpperCase();
    const startMs = Math.max(0, fromMs - padMs);
    const endMs = toMs + padMs;
    set({
      levels: [],
      sessionTrades: trades,
      fetchParams: {
        symbolBinance: sym,
        interval,
        startMs,
        endMs,
      },
      metaTitle: `Бэктест · ${sym} · ${interval} · ${trades.length} сделок`,
      cleanChartUi: true,
    });
  },

  clear: () =>
    set({
      levels: [],
      sessionTrades: [],
      fetchParams: null,
      metaTitle: "",
      cleanChartUi: false,
    }),
}));
