"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Candle, Timeframe } from "@/types/candle";
import { generateMockCandles } from "@/lib/mockData";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

interface MarketState {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  logScale: boolean;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setLogScale: (v: boolean) => void;
  /** Reload mock stream — swap for API fetch later. */
  loadData: () => void;
  /** Свечи с бэктеста / API без mock (для совпадения цен с уровнями DCA). */
  hydrateFromBacktest: (candles: Candle[], symbol: string, timeframe: Timeframe) => void;
}

export const useMarketStore = create<MarketState>()(
  immer((set, get) => ({
    symbol: "BTC-USD",
    timeframe: "1h",
    candles: generateMockCandles("BTC-USD", "1h", 800),
    logScale: false,

    setSymbol: (symbol) => {
      useBacktestOverlayStore.getState().clear();
      set((s) => {
        s.symbol = symbol.trim().toUpperCase() || "BTC-USD";
      });
      get().loadData();
    },

    setTimeframe: (timeframe) => {
      useBacktestOverlayStore.getState().clear();
      set((s) => {
        s.timeframe = timeframe;
      });
      get().loadData();
    },

    setLogScale: (logScale) =>
      set((s) => {
        s.logScale = logScale;
      }),

    loadData: () =>
      set((st) => {
        st.candles = generateMockCandles(st.symbol, st.timeframe, 800);
      }),

    hydrateFromBacktest: (candles, symbol, timeframe) =>
      set((st) => {
        st.candles = candles;
        st.symbol = symbol.trim().toUpperCase() || st.symbol;
        st.timeframe = timeframe;
      }),
  })),
);
