"use client";

import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { createContext, useContext } from "react";

export interface ChartRuntimeValue {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
}

export const ChartRuntimeContext = createContext<ChartRuntimeValue>({
  chart: null,
  candleSeries: null,
});

export function useChartRuntime() {
  return useContext(ChartRuntimeContext);
}
