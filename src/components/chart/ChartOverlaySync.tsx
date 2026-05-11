"use client";

import { useEffect } from "react";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { useMarketStore } from "@/store/useMarketStore";
import { intervalToChartTimeframe } from "@/lib/chart/intervalToChartTimeframe";

/**
 * После «Открыть на графике» подгружает те же OHLCV с `/api/ohlcv`, чтобы цены совпадали с уровнями DCA.
 */
export function ChartOverlaySync() {
  const fetchParams = useBacktestOverlayStore((s) => s.fetchParams);
  const hydrateFromBacktest = useMarketStore((s) => s.hydrateFromBacktest);

  useEffect(() => {
    if (!fetchParams) return;
    let cancelled = false;
    const { symbolBinance, interval, startMs, endMs } = fetchParams;

    void (async () => {
      try {
        const qs = new URLSearchParams({
          symbol: symbolBinance,
          interval,
          startMs: String(startMs),
          endMs: String(endMs),
        });
        const res = await fetch(`/api/ohlcv?${qs}`);
        const data = (await res.json()) as {
          candles?: import("@/types/candle").Candle[];
          error?: string;
        };
        if (cancelled || data.error || !data.candles?.length) return;
        const tf = intervalToChartTimeframe(interval);
        hydrateFromBacktest(data.candles, symbolBinance, tf);
      } catch (e) {
        console.error("ChartOverlaySync:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchParams, hydrateFromBacktest]);

  return null;
}
