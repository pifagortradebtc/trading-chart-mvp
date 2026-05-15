"use client";

import { useEffect, useRef } from "react";
import { consumeBacktestChartHandoff } from "@/lib/chart/openBacktestChart";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { useMarketStore } from "@/store/useMarketStore";

/** В новой вкладке `/chart` восстанавливает разметку сделок из localStorage. */
export function BacktestChartHandoffBootstrap() {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const handoff = consumeBacktestChartHandoff();
    if (!handoff) return;
    applied.current = true;

    useBacktestOverlayStore.setState({
      levels: [],
      sessionTrades: handoff.sessionTrades,
      fetchParams: handoff.fetchParams,
      metaTitle: handoff.metaTitle,
      cleanChartUi: handoff.cleanChartUi,
    });

    if (handoff.candles?.length) {
      useMarketStore
        .getState()
        .hydrateFromBacktest(handoff.candles, handoff.symbol, handoff.timeframe);
    }
  }, []);

  return null;
}
