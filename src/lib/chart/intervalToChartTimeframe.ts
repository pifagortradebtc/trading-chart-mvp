import type { Timeframe } from "@/types/candle";

const VALID_TF = new Set<string>(["1m", "5m", "15m", "1h", "4h", "1D", "3D", "1W"]);

/** Интервал Binance (`15m`, `1d`, `3d`, …) → ключ таймфрейма в UI графика / market store. */
export function intervalToChartTimeframe(interval: string): Timeframe {
  const i = interval.trim();
  if (VALID_TF.has(i)) return i as Timeframe;
  if (i === "1d") return "1D";
  if (i === "3d") return "3D";
  if (i === "1w") return "1W";
  return "15m";
}
