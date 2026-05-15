/**
 * ALTS-канал Pifagor (aaa1 и line_aaa1) для оверлея на графике — как в Pine.
 */

import type { Time } from "lightweight-charts";
import type { Candle } from "@/types/candle";
import { DEFAULT_PIFAGOR_ALTS } from "./backtestDefaults";
import {
  buildOverlayDayIndexContext,
  computePifagorSeries,
} from "./pifagorAltsIndicators";

/** Pine: line_aaa1 = aaa1 / math.sqrt(1.618) */
export const ALTS_LOWER_FACTOR = 1 / Math.sqrt(1.618);

export interface AltsChartLinePoint {
  time: Time;
  value: number;
}

export interface AltsChartLineData {
  upper: AltsChartLinePoint[];
  lower: AltsChartLinePoint[];
}

export function buildAltsChartLineData(
  candles: Candle[],
  symbol: string,
): AltsChartLineData {
  const upper: AltsChartLinePoint[] = [];
  const lower: AltsChartLinePoint[] = [];
  if (candles.length < 100) return { upper, lower };

  const daily = buildOverlayDayIndexContext(candles);
  const series = computePifagorSeries(candles, symbol, DEFAULT_PIFAGOR_ALTS, daily);

  for (let i = 0; i < candles.length; i++) {
    const a = series.aaa1[i]!;
    if (!Number.isFinite(a)) continue;
    const t = candles[i]!.time as Time;
    upper.push({ time: t, value: a });
    lower.push({ time: t, value: a * ALTS_LOWER_FACTOR });
  }

  return { upper, lower };
}

/** Цвета из Pine Pifagor_ALTS 3.7 (C_WARN / C_PRIMARY). */
export const ALTS_CHART_COLORS = {
  upper: "rgba(255, 214, 10, 0.85)",
  lowerGlow: "rgba(0, 210, 106, 0.35)",
  lowerCore: "rgba(255, 214, 10, 0.95)",
} as const;
