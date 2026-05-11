/** Registered indicator plugin id — extend via registry. */
export type BuiltinIndicatorId = "sma" | "ema" | "rsi" | "volume";

export interface IndicatorInstanceState {
  id: string;
  pluginId: BuiltinIndicatorId;
  visible: boolean;
  /** Numeric params (period, etc.) — extensible. */
  params: Record<string, number | undefined>;
}
