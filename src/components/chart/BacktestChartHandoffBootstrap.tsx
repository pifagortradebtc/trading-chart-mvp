"use client";

import { useEffect, useRef } from "react";
import { consumeBacktestChartHandoff } from "@/lib/chart/openBacktestChart";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { useMarketStore } from "@/store/useMarketStore";
import type { Candle } from "@/types/candle";

const HISTORY_PAD_YEARS = 1; // нам всегда нужно немного больше окна сделки

/**
 * В новой вкладке `/chart` восстанавливает разметку сделок из localStorage.
 * Если в handoff пришли candles — сразу hydrate'им store. Если их нет
 * (например, бэктест-сессия имела большой объём и мы не положили их в
 * localStorage), идём в `/api/ohlcv` по `fetchParams` и подтягиваем
 * реальные котировки. Без этого fallback'а пользователь видел бы дефолтный
 * mock «BTC-USD 100→110», а не реальный график своего бэктеста.
 */
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
      return;
    }

    // Fallback: fetch с API, чтобы не показывать дефолтный mock.
    void fetchFromApi(handoff)
      .then((candles) => {
        if (candles.length) {
          useMarketStore
            .getState()
            .hydrateFromBacktest(candles, handoff.symbol, handoff.timeframe);
        } else {
          console.warn("BacktestChartHandoff: API не вернул свечей");
        }
      })
      .catch((e) => {
        console.error("BacktestChartHandoff: fetch failed", e);
      });
  }, []);

  return null;
}

async function fetchFromApi(handoff: ReturnType<typeof consumeBacktestChartHandoff>): Promise<Candle[]> {
  if (!handoff) return [];
  const { fetchParams } = handoff;
  const yearsBack = Math.max(
    HISTORY_PAD_YEARS,
    Math.ceil((fetchParams.endMs - fetchParams.startMs) / (365 * 24 * 3600 * 1000)),
  );
  const url = new URL("/api/ohlcv", window.location.origin);
  url.searchParams.set("symbol", fetchParams.symbolBinance);
  url.searchParams.set("interval", fetchParams.interval);
  url.searchParams.set("startMs", String(fetchParams.startMs));
  url.searchParams.set("endMs", String(fetchParams.endMs));
  url.searchParams.set("yearsBack", String(Math.min(12, yearsBack)));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    console.warn(`BacktestChartHandoff: /api/ohlcv → HTTP ${res.status}`);
    return [];
  }
  const json = (await res.json()) as { candles?: Candle[] };
  return Array.isArray(json.candles) ? json.candles : [];
}
