/**
 * Общие типы для движка бэктеста DCA и индикатора V2_ЧайкКельт.
 */

import type { Candle } from "@/types/candle";
import type { PifagorAltsSettings } from "./pifagorAltsTypes";
import type { Pivot21Settings } from "./pivot21Types";
import type {
  BuyForceSettings,
  SellForceSettings,
} from "./buyForceSellForceSignals";

/**
 * Внимание: `"chaik_dca"` (V2_ЧайкКельт) формально остался в enum для
 * type-safety старых снимков снапшотов и условий по коду, но **снят с
 * UI dropdown и engine**: при попытке запустить runBacktest с этим
 * kind движок бросит ошибку. Миграция: `normalizeStrategyKind()`
 * автоматически переводит `chaik_dca` → `buyforce_dca`.
 *
 * `composite` — новый режим, объединяет несколько сигнал-генераторов
 * (chaik / buyforce / sellforce) через AND / OR / N-of-M. ALTS и Pivot21
 * остаются отдельными strategyKind — у них собственное управление позицией,
 * в композит не входят.
 */
export type BacktestStrategyKind =
  | "chaik_dca"
  | "buyforce_dca"
  | "sellforce_dca"
  | "composite"
  | "pifagor_alts"
  | "pivot21";

/** Стратегии, которые могут быть слотом в composite (только сигнал-генераторы). */
export type CompositeStrategyKind = "chaik_dca" | "buyforce_dca" | "sellforce_dca";

/**
 * Один слот в composite: тип стратегии и её собственные параметры.
 * Хранятся inline — у каждого слота свой набор настроек (можно иметь
 * BuyForce #1 с zeroLevel=0 и BuyForce #2 с zeroLevel=0.1 в одном composite).
 */
export interface StrategySlot {
  id: string;
  kind: CompositeStrategyKind;
  /** Заполняется только когда kind === "chaik_dca". */
  chaikKelt?: ChaikKeltSettings;
  /** Заполняется только когда kind === "buyforce_dca". */
  buyForce?: BuyForceSettings;
  /** Заполняется только когда kind === "sellforce_dca". */
  sellForce?: SellForceSettings;
}

/** Правило объединения сигналов от нескольких слотов. */
export type CompositeRule = "and" | "any" | "majority";

export interface CompositeStrategyConfig {
  slots: StrategySlot[];
  /**
   * AND — все слоты должны дать сигнал в окне; ANY — хотя бы один;
   * MAJORITY — не менее `minSignalCount` слотов (по умолчанию >= половина).
   */
  rule: CompositeRule;
  /** Используется только при rule === "majority". null = round(N/2) от количества слотов. */
  minSignalCount: number | null;
  /**
   * Окно подтверждения: сигналы от разных стратегий редко приходят на одном баре.
   * На каждом баре i считаем «есть ли сигнал у этой стратегии в [i-window..i]».
   * 0 = строго один и тот же бар (почти никогда не сработает), 5 — мягко, 20 — очень мягко.
   */
  confirmWindowBars: number;
}

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
  /** Таймфрейм Чайкина в Pine (`request.security`); в веб-бэктесте осциллятор считается по загруженным свечам — для совпадения с TV задайте тот же ТФ графика. */
  chaikinTf: string;
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
  /** Pine «С ОТКАТОМ БЭК V2»: лимитный первый вход в боковике (цена = close − ATR×k). */
  useLimitRange: boolean;
  limitRangeAtr: number;
  /** Лимитный первый вход в тренде. */
  useLimitTrend: boolean;
  limitTrendAtr: number;
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
  /**
   * Сумма номиналов всех ордеров сетки в USDT (Pine `marginPerTrade`).
   * Если не задано, используется `startDepositUsdt`.
   */
  gridTotalNotionalUsdt?: number;
  /** Как в Pine: TP при достижении цели по **close** бара (`close >= avg×(1+tp%)`). Если false — по high (агрессивнее). */
  takeProfitOnClose: boolean;
}

export interface BacktestSettings {
  /** Какой движок бэктеста запускать. */
  strategyKind: BacktestStrategyKind;
  /**
   * Портфельный бэктест top-альтов (Pifagor ALTS): один прогон по списку CMC,
   * общая статистика на весь депозит. Только при strategyKind === "pifagor_alts".
   */
  portfolioAltsMode: boolean;
  entryTiming: EntryTiming;
  executionOrder: ExecutionOrder;
  indicator: ChaikKeltSettings;
  dca: DcaBotSettings;
  /** Учитывается при strategyKind === "pifagor_alts". */
  pifagorAlts: PifagorAltsSettings;
  /** Учитывается при strategyKind === "pivot21". */
  pivot21: Pivot21Settings;
  /** Учитывается при strategyKind === "buyforce_dca". RO пересекает zero_level ↑ → long. */
  buyForce: BuyForceSettings;
  /** Учитывается при strategyKind === "sellforce_dca". RO пересекает zero_level ↑ → short. */
  sellForce: SellForceSettings;
  /** Учитывается при strategyKind === "composite". Multi-strategy с правилом объединения. */
  composite: CompositeStrategyConfig;
  /** Таймфрейм depth-данных для buyforce/sellforce. Должен совпадать с интервалом OHLCV. */
  depthInterval: "1m" | "5m" | "15m" | "1h";
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

/** Первый ордер сетки: лимит (цена уровня) или маркет (open следующего бара и т.п.). */
export type FirstEntryKind = "limit" | "market";

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
  /** Индекс бара первого исполненного входа (0-based). У старых снимков может отсутствовать. */
  entryBarIndex?: number;
  /** Индекс бара выхода. У старых снимков может отсутствовать. */
  exitBarIndex?: number;
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
  /** Тип первого входа (для статистики Lim/Mkt). У старых снимков — неизвестно. */
  firstEntryKind?: FirstEntryKind;
  exitReason: "tp" | "sl" | "liquidation" | "end_of_test" | "signal";
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

/**
 * Состояние открытой позиции на последнем баре выборки (до принудительного закрытия в движке).
 * Позволяет показать в UI блок «Позиция» как в Pine, даже если сделка затем записана как end_of_test.
 */
export interface OpenPositionSnapshot {
  symbol: string;
  side: TradeDirection;
  regime: MarketRegime;
  avgEntryPrice: number;
  takeProfitPrice: number;
  markPrice: number;
  filledLevels: number;
  totalGridOrders: number;
  /** Нереализованный PnL % от использованной маржи (без комиссии выхода). */
  unrealizedPnlPctOnMargin: number;
  /** Расстояние от mark до TP в % к mark (лонг: вверх до TP). */
  distanceToTpPct: number;
  openedAtMs: number;
  lastBarAtMs: number;
  durationMs: number;
  maxDrawdownPct: number;
  firstEntryKind: FirstEntryKind;
  cumNotionalUsdt: number;
  leverage: number;
  /** Баров от первого входа до последнего бара выборки (включительно). */
  durationBars: number;
}

export interface BacktestResult {
  candles: Candle[];
  signals: (boolean | null)[];
  signalMeta: (SignalBarState | null)[];
  trades: TradeRecord[];
  equity: EquityPoint[];
  warning?: string;
  dataRange: { fromMs: number; toMs: number; requestedFromMs: number };
  /** ATR Кельтнера на последнем баре (для панели настроек как в Pine). */
  lastBarAtrKelt?: number;
  /** Снимок позиции перед закрытием на конце данных; `null` — позиции не было. */
  openPositionAtDataEnd: OpenPositionSnapshot | null;
}

export interface FetchProgress {
  loadedBars: number;
  phase: "cache" | "network" | "done";
  message: string;
}
