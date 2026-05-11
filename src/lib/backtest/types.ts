/**
 * Общие типы для движка бэктеста DCA и индикатора V2_ЧайкКельт.
 */

import type { Candle } from "@/types/candle";

export type TradeDirection = "long" | "short";
export type DirectionMode = "long" | "short" | "auto";
export type ExecutionOrder = "conservative" | "optimistic";
export type EntryTiming = "next_open" | "signal_close";
/** Изолированная — маржа только из торгового депозита; кросс — полный баланс кошелька для оценки ликвидации и лимита маржи. */
export type MarginMode = "isolated" | "cross";
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
  /** Торговый депозит (USDT): капитал, участвующий в расчёте сетки; первый ордер — % от этого значения. */
  startDepositUsdt: number;
  /**
   * Полный баланс кошелька (USDT): торговый депозит + поддерживающая маржа / залог на счёте.
   * Для кросс-маржи в бэктесте ликвидация и лимит маржи первого ордера масштабируются отношением к торговому депозиту.
   * При изолированной марже не используется.
   */
  walletBalanceUsdt: number;
  marginMode: MarginMode;
  /** Доля торгового депозита на первый ордер сетки, % (например 7 = 7%). */
  firstOrderDepositPct: number;
  leverage: number;
  ordersCount: number;
  priceOverlapPct: number;
  priceFactor: number;
  volumeFactor: number;
  /**
   * Цель тейк-профита в % от **текущей средней цены позиции** (после каждого исполнения DCA),
   * не от цены первого входа. В движке: `avgPrice * (1 ± takeProfitPct/100)`.
   */
  takeProfitPct: number;
  /**
   * Стоп в % от **текущей средней** (как TP). `null` — без стопа в симуляции.
   */
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
  /** TP при гипотетическом исполнении ордеров 1…N: средняя после этих входов + takeProfitPct%. */
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
  /** Маржа на момент сделки (для графика / совместимость). У старых снимков может отсутствовать. */
  marginMode?: MarginMode;
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
  /**
   * Полная лимитная сетка на входе (все уровни из настроек DCA).
   * Факт исполнения уровня: orderIndex <= maxDcaIndex.
   */
  dcaGrid: DcaGridResult;
  /** Время исполнения каждого заполненного уровня сетки (мс), длина = maxDcaIndex. У старых снимков может не быть. */
  dcaFillTimesMs?: number[];
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
