/** OHLCV bar — `time` is Unix seconds (Lightweight Charts convention). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W";

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "4h", label: "4h" },
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
];
