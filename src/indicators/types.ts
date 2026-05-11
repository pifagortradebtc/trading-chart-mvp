/**
 * Future-facing plugin API: register compute + attach/detach to Lightweight Charts.
 * ChartHost currently wires SMA/EMA/RSI/Volume inline — migrate consumers here gradually.
 */
import type { Candle } from "@/types/candle";
import type { IChartApi } from "lightweight-charts";

export interface IndicatorComputeResult {
  /** Overlay line on main pane */
  line?: { time: number; value: number }[];
  /** Separate pane (e.g. RSI 0–100) — optional second chart sync */
  paneLine?: { time: number; value: number }[];
}

export interface IndicatorPlugin<TParams extends Record<string, number | undefined>> {
  id: string;
  defaultParams: TParams;
  compute: (candles: Candle[], params: TParams) => IndicatorComputeResult;
  /** Apply visual layers — optional; ChartHost can own attachment during migration */
  attach?: (chart: IChartApi, result: IndicatorComputeResult) => () => void;
}
