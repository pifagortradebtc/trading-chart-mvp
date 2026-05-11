/**
 * Общие типы для движка бэктеста DCA и индикатора V2_ЧайкКельт.
 */

import type { Candle } from "@/types/candle";

export type TradeDirection = "long" | "short";
export type DirectionMode = "long" | "short" | "auto";
export type ExecutionOrder = "conservative" | "optimistic";
export type EntryTiming = "next_open" | "signal_close";
export type MarketRegime = "range" | "trend";

/** Режим индикатора по полю direction (Auto / Long / Short в Pine). */
export type IndicatorDirectionFilter = "auto" | "long_only" | "short_only";

export interface ChaikKeltSettings {
  /** Фильтр направления на уровне Pine direction */
  directionFilter: IndicatorDirectionFilter;
  chaikinFast: number;
  chaikinSlow: number;
  rangeBars: number;
  rangeMaxPctLong: number;
  rangeMinPctShort: number;
  adxLength: number;
  adxThreshold: number;
  emaPullbackLen: number;
  pullbackPct: number;
  divLookback: number;
  rsiEnabled: boolean;
  rsiLen: number;
  rsiRangeThresholdLong: number;
  rsiTrendThresholdLong: number;
  rsiRangeThresholdShort: number;
  rsiTrendThresholdShort: number;
  keltnerEmaLen: number;
  keltnerAtrLen: number;
  keltnerMult: number;
  cooldownBars: number;
  crossMode: boolean;
}

export interface DcaBotSettings {
  startDepositUsdt: number;
  /** Доля депозита на первый ордер сетки, % (например 1 = 1%). */
  firstOrderDepositPct: number;
  leverage: number;
  ordersCount: number;
  priceOverlapPct: number;
  priceFactor: number;
  volumeFactor: number;
  takeProfitPct: number;
  stopLossPct: number | null;
  feePctPerSide: number;
  /** Упрощённо: доля от номинала позиции за период удержания (0 = выкл). */
  fundingPctPer8h: number;
  allowLong: boolean;
  allowShort: boolean;
  mode: DirectionMode;
}

export interface BacktestSettings {
  entryTiming: EntryTiming;
  executionOrder: ExecutionOrder;
  indicator: ChaikKeltSettings;
  dca: DcaBotSettings;
}

export interface DcaGridRow {
  orderIndex: number;
  price: number;
  orderUsdt: number;
  qtyCoin: number;
  cumNotionalUsdt: number;
  avgPrice: number;
  takeProfitPrice: number;
  approxLiquidationPrice: number;
  drawdownFromFirstPct: number;
  marginUsedUsdt: number;
}

export interface DcaGridResult {
  side: TradeDirection;
  firstEntryPrice: number;
  rows: DcaGridRow[];
}

export interface SignalBarState {
  longRange: boolean;
  longTrend: boolean;
  shortRange: boolean;
  shortTrend: boolean;
  regime: MarketRegime | null;
  reasonLong: string;
  reasonShort: string;
}

export interface TradeRecord {
  id: number;
  symbol: string;
  side: TradeDirection;
  regime: MarketRegime;
  entrySignalTime: number;
  entryTime: number;
  exitTime: number;
  firstEntryPrice: number;
  avgEntryPrice: number;
  exitPrice: number;
  maxDcaIndex: number;
  /** Уровней в полной сетке (для метрик «вся сетка»). */
  totalGridOrders: number;
  maxDrawdownPct: number;
  pnlUsdt: number;
  pnlPctOnMargin: number;
  feesUsdt: number;
  exitReason: "tp" | "sl" | "liquidation" | "end_of_test";
  durationMs: number;
  comment: string;
  /** Снимки для отладки / модалки */
  dcaGrid: DcaGridResult;
  equityAfterClose: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdownPct: number;
  peakEquity: number;
}

export interface BacktestResult {
  candles: Candle[];
  signals: (boolean | null)[];
  signalMeta: (SignalBarState | null)[];
  trades: TradeRecord[];
  equity: EquityPoint[];
  warning?: string;
  dataRange: { fromMs: number; toMs: number; requestedFromMs: number };
}

export interface FetchProgress {
  loadedBars: number;
  phase: "cache" | "network" | "done";
  message: string;
}
