/**
 * Движок бэктеста DCA: первый вход по сигналу V2_ЧайкКельт, затем сетка.
 * Без lookahead: решения на баре i после формирования OHLC[i].
 *
 * Правило позиционирования: одновременно не более одной открытой сетки — пока раунд не закрыт,
 * новые сигналы игнорируются (см. ветку «Новый сигнал»: условие `!open`).
 */

import type { Candle } from "@/types/candle";
import { computeChaikSignals, type ChaikComputedSeries } from "./chaikKeltSignal";
import {
  computeBuyForceSignals,
  computeSellForceSignals,
} from "./buyForceSellForceSignals";
import { combineCompositeSignals } from "./compositeSignal";
import type { DepthBar } from "./depthTypes";
import { buildDcaGrid } from "./dcaGrid";
import { runPifagorAltsBacktest } from "./pifagorAltsEngine";
import { runPivot21Backtest } from "./pivot21Engine";
import type {
  BacktestResult,
  BacktestSettings,
  EquityPoint,
  FirstEntryKind,
  MarketRegime,
  OpenPositionSnapshot,
  SignalBarState,
  TradeDirection,
  TradeRecord,
} from "./types";
import { approxLiquidationPrice, effectiveLiquidationLeverage, maxMarginAvailableUsdt } from "./risk";

interface WorkingTrade {
  id: number;
  symbol: string;
  side: TradeDirection;
  regime: MarketRegime;
  signalBar: number;
  entryBar: number;
  /** Первый бар, на котором применяется симуляция OHLC (без lookahead). */
  simulationFromBar: number;
  firstPrice: number;
  filledLevels: number;
  qty: number;
  cumNotional: number;
  avgPrice: number;
  feesUsdt: number;
  fundingUsdt: number;
  grid: ReturnType<typeof buildDcaGrid>;
  comment: string;
  maxDrawdownPct: number;
  maxDcaReached: number;
  /** Время исполнения каждого уровня (первая точка — первый вход). */
  dcaFillTimesMs: number[];
  signalSnapshot: SignalBarState | null;
  firstEntryKind: FirstEntryKind;
}

/** Отложенный вход в лонг по правилам Pine ОТКАТОМ: лимит на якоре или маркет на open следующего бара. */
type PendingLongOpen =
  | {
      kind: "limit_first";
      signalBar: number;
      grid: ReturnType<typeof buildDcaGrid>;
      meta: SignalBarState | null;
    }
  | {
      kind: "market_next_open";
      signalBar: number;
      grid: ReturnType<typeof buildDcaGrid>;
      meta: SignalBarState | null;
    };

/** Тейк-профит от средней позиции `avg`, не от первого входа. Пересчитывается после каждого DCA. */
function tpPrice(side: TradeDirection, avg: number, tpPct: number): number {
  return side === "long"
    ? avg * (1 + tpPct / 100)
    : avg * (1 - tpPct / 100);
}

function slPrice(side: TradeDirection, avg: number, slPct: number): number {
  return side === "long"
    ? avg * (1 - slPct / 100)
    : avg * (1 + slPct / 100);
}

function resolveDirection(
  i: number,
  longActive: boolean[],
  shortActive: boolean[],
  settings: BacktestSettings,
): TradeDirection | null {
  const { mode, allowLong, allowShort } = settings.dca;
  const l = longActive[i] && allowLong && (mode === "long" || mode === "auto");
  const s = shortActive[i] && allowShort && (mode === "short" || mode === "auto");
  if (l && !s) return "long";
  if (s && !l) return "short";
  if (l && s) {
    /** индикатор уже разрулил AUTO; если оба true — приоритет long */
    return "long";
  }
  return null;
}

function firstEntryPriceAtBar(
  candles: Candle[],
  signalBar: number,
  timing: BacktestSettings["entryTiming"],
): number | null {
  if (timing === "next_open") {
    const b = signalBar + 1;
    if (b >= candles.length || b < 0) return null;
    return candles[b].open;
  }
  if (signalBar >= candles.length || signalBar < 0) return null;
  return candles[signalBar].close;
}

/**
 * Первый бар, на котором симулируем high/low (избегая lookahead на сигнальной свече при signal_close).
 */
function firstSimulationBar(signalBar: number, timing: BacktestSettings["entryTiming"]): number {
  return timing === "next_open" ? signalBar + 1 : signalBar + 1;
}

/** Обработка одного бара для открытой LONG-позиции. */
function processLongBar(
  candles: Candle[],
  i: number,
  tr: WorkingTrade,
  settings: BacktestSettings,
): "tp" | "sl" | "liquidation" | "none" {
  const c = candles[i];
  const low = c.low;
  const { dca, executionOrder } = settings;

  const applyFillsDown = () => {
    let changed = true;
    while (changed) {
      changed = false;
      const nextIdx = tr.filledLevels;
      if (nextIdx >= tr.grid.rows.length) break;
      const row = tr.grid.rows[nextIdx];
      if (!row) break;
      if (low <= row.price) {
        const fillUsd = row.orderUsdt;
        const fillQty = fillUsd / row.price;
        tr.qty += fillQty;
        tr.cumNotional += fillUsd;
        tr.avgPrice = tr.cumNotional / tr.qty;
        tr.feesUsdt += (fillUsd * dca.feePctPerSide) / 100;
        tr.filledLevels++;
        tr.maxDcaReached = Math.max(tr.maxDcaReached, tr.filledLevels);
        tr.dcaFillTimesMs.push(c.time * 1000);
        changed = true;
      } else break;
    }
  };

  const liqNow = () =>
    approxLiquidationPrice("long", tr.avgPrice, effectiveLiquidationLeverage(dca));
  const tpNow = () => tpPrice("long", tr.avgPrice, dca.takeProfitPct);
  const tpHit = () => {
    if (tr.qty <= 0) return false;
    const t = tpNow();
    return dca.takeProfitOnClose ? c.close >= t : c.high >= t;
  };
  const slNow = () =>
    dca.stopLossPct != null ? slPrice("long", tr.avgPrice, dca.stopLossPct) : null;

  applyFillsDown();
  if (tr.qty <= 0) return "none";

  if (executionOrder === "conservative") {
    const liqP = liqNow();
    if (
      dca.marginMode !== "cross" &&
      Number.isFinite(liqP) &&
      low <= liqP
    ) {
      return "liquidation";
    }
    const slP = slNow();
    if (slP != null && low <= slP) return "sl";
    if (tpHit()) return "tp";
  } else {
    if (tpHit()) return "tp";
    const liqP = liqNow();
    if (
      dca.marginMode !== "cross" &&
      Number.isFinite(liqP) &&
      low <= liqP
    ) {
      return "liquidation";
    }
    const slP = slNow();
    if (slP != null && low <= slP) return "sl";
  }

  /** Просадка внутри сделки */
  const uHigh = (tr.firstPrice - low) / tr.firstPrice;
  tr.maxDrawdownPct = Math.max(tr.maxDrawdownPct, uHigh * 100);

  return "none";
}

function processShortBar(
  candles: Candle[],
  i: number,
  tr: WorkingTrade,
  settings: BacktestSettings,
): "tp" | "sl" | "liquidation" | "none" {
  const c = candles[i];
  const high = c.high;
  const { dca, executionOrder } = settings;

  const applyFillsUp = () => {
    let changed = true;
    while (changed) {
      changed = false;
      const nextIdx = tr.filledLevels;
      if (nextIdx >= tr.grid.rows.length) break;
      const row = tr.grid.rows[nextIdx];
      if (!row) break;
      if (high >= row.price) {
        const fillUsd = row.orderUsdt;
        const fillQty = fillUsd / row.price;
        tr.qty += fillQty;
        tr.cumNotional += fillUsd;
        tr.avgPrice = tr.cumNotional / tr.qty;
        tr.feesUsdt += (fillUsd * dca.feePctPerSide) / 100;
        tr.filledLevels++;
        tr.maxDcaReached = Math.max(tr.maxDcaReached, tr.filledLevels);
        tr.dcaFillTimesMs.push(c.time * 1000);
        changed = true;
      } else break;
    }
  };

  const liqNow = () =>
    approxLiquidationPrice("short", tr.avgPrice, effectiveLiquidationLeverage(dca));
  const tpNow = () => tpPrice("short", tr.avgPrice, dca.takeProfitPct);
  const tpHit = () => {
    if (tr.qty <= 0) return false;
    const t = tpNow();
    return dca.takeProfitOnClose ? c.close <= t : c.low <= t;
  };
  const slNow = () =>
    dca.stopLossPct != null ? slPrice("short", tr.avgPrice, dca.stopLossPct) : null;

  applyFillsUp();
  if (tr.qty <= 0) return "none";

  if (executionOrder === "conservative") {
    const liqP = liqNow();
    if (
      dca.marginMode !== "cross" &&
      Number.isFinite(liqP) &&
      high >= liqP
    ) {
      return "liquidation";
    }
    const slP = slNow();
    if (slP != null && high >= slP) return "sl";
    if (tpHit()) return "tp";
  } else {
    if (tpHit()) return "tp";
    const liqP = liqNow();
    if (
      dca.marginMode !== "cross" &&
      Number.isFinite(liqP) &&
      high >= liqP
    ) {
      return "liquidation";
    }
    const slP = slNow();
    if (slP != null && high >= slP) return "sl";
  }

  const uHigh = (high - tr.firstPrice) / tr.firstPrice;
  tr.maxDrawdownPct = Math.max(tr.maxDrawdownPct, uHigh * 100);

  return "none";
}

function detectRegime(snapshot: SignalBarState | null, side: TradeDirection): MarketRegime {
  if (!snapshot) return "range";
  if (side === "long") {
    if (snapshot.longTrend) return "trend";
    return "range";
  }
  if (snapshot.shortTrend) return "trend";
  return "range";
}

function buildOpenPositionSnapshot(
  tr: WorkingTrade,
  markPrice: number,
  openedAtMs: number,
  lastBarAtMs: number,
  exitBarIndex: number,
  settings: BacktestSettings,
): OpenPositionSnapshot {
  const dca = settings.dca;
  const avg = tr.avgPrice;
  const qty = tr.qty;
  const tpTarget = tpPrice(tr.side, avg, dca.takeProfitPct);
  const marginUsed = tr.cumNotional > 0 ? tr.cumNotional / dca.leverage : 0;
  const gross =
    tr.side === "long" ? qty * (markPrice - avg) : qty * (avg - markPrice);
  const unrealizedPnlPctOnMargin = marginUsed > 0 ? (gross / marginUsed) * 100 : 0;

  let distanceToTpPct = 0;
  if (markPrice > 0) {
    if (tr.side === "long") {
      distanceToTpPct = ((tpTarget - markPrice) / markPrice) * 100;
    } else {
      distanceToTpPct = ((markPrice - tpTarget) / markPrice) * 100;
    }
  }

  return {
    symbol: tr.symbol,
    side: tr.side,
    regime: tr.regime,
    avgEntryPrice: avg,
    takeProfitPrice: tpTarget,
    markPrice,
    filledLevels: tr.filledLevels,
    totalGridOrders: tr.grid.rows.length,
    unrealizedPnlPctOnMargin,
    distanceToTpPct,
    openedAtMs,
    lastBarAtMs,
    durationMs: Math.max(0, lastBarAtMs - openedAtMs),
    maxDrawdownPct: tr.maxDrawdownPct,
    firstEntryKind: tr.firstEntryKind,
    cumNotionalUsdt: tr.cumNotional,
    leverage: dca.leverage,
    durationBars: Math.max(1, exitBarIndex - tr.entryBar + 1),
  };
}

function createOpenTrade(
  params: {
    id: number;
    symbol: string;
    dir: TradeDirection;
    signalBar: number;
    settings: BacktestSettings;
    meta: SignalBarState | null;
    grid: ReturnType<typeof buildDcaGrid>;
    entryBar: number;
    simulationFromBar: number;
    firstPrice: number;
    /** Время исполнения первого ордера сетки (мс). */
    firstFillTimeMs: number;
    /**
     * Фактическая цена исполнения первого ордера (маркет — open следующего бара; лимит — цена уровня).
     * По умолчанию = `firstPrice` (якорь сетки).
     */
    firstFillPrice?: number;
    /** Позиция открыта, но первый ордер ещё не исполнен (лимитный вход в ожидании). */
    emptyPosition?: boolean;
    firstEntryKind?: FirstEntryKind;
  },
): WorkingTrade | null {
  const {
    grid,
    settings,
    dir,
    meta,
    id,
    symbol,
    signalBar,
    entryBar,
    simulationFromBar,
    firstPrice,
    firstFillTimeMs,
    firstFillPrice: firstFillPriceParam,
    emptyPosition,
    firstEntryKind = "market",
  } =
    params;
  if (grid.rows.length === 0) return null;
  const firstRow = grid.rows[0]!;
  const marginForFirst = firstRow.orderUsdt / settings.dca.leverage;
  /** Маржа первого ордера не должна превышать equity — проверяется снаружи */
  if (!Number.isFinite(marginForFirst)) return null;

  const regime = detectRegime(meta, dir);
  const comment =
    dir === "long" ? meta?.reasonLong ?? "LONG сигнал" : meta?.reasonShort ?? "SHORT сигнал";

  if (emptyPosition) {
    return {
      id,
      symbol,
      side: dir,
      regime,
      signalBar,
      entryBar,
      simulationFromBar,
      firstPrice: firstRow.price,
      filledLevels: 0,
      qty: 0,
      cumNotional: 0,
      avgPrice: firstRow.price,
      feesUsdt: 0,
      fundingUsdt: 0,
      grid,
      comment,
      maxDrawdownPct: 0,
      maxDcaReached: 0,
      dcaFillTimesMs: [],
      signalSnapshot: meta,
      firstEntryKind,
    };
  }

  const fillPx = firstFillPriceParam ?? firstPrice;
  const qty0 = firstRow.orderUsdt / fillPx;
  const avg0 = fillPx;

  return {
    id,
    symbol,
    side: dir,
    regime,
    signalBar,
    entryBar,
    simulationFromBar,
    firstPrice: fillPx,
    filledLevels: 1,
    qty: qty0,
    cumNotional: firstRow.orderUsdt,
    avgPrice: avg0,
    feesUsdt: (firstRow.orderUsdt * settings.dca.feePctPerSide) / 100,
    fundingUsdt: 0,
    grid,
    comment,
    maxDrawdownPct: 0,
    maxDcaReached: 1,
    dcaFillTimesMs: [firstFillTimeMs],
    signalSnapshot: meta,
    firstEntryKind,
  };
}

/**
 * Мок ChaikComputedSeries для стратегий, которые не используют Chaikin/Keltner
 * (buyforce_dca / sellforce_dca). Все массивы — NaN: `Number.isFinite(atrKelt[i])`
 * вернёт false → лимитного входа нет → market entry на open следующего бара.
 */
function makeEmptySeries(n: number): ChaikComputedSeries {
  const arr = () => new Array<number>(n).fill(Number.NaN);
  return {
    chOsc: arr(),
    adx: arr(),
    diPlus: arr(),
    diMinus: arr(),
    rsiVal: arr(),
    emaPullback: arr(),
    kUpper: arr(),
    kLower: arr(),
    rangeHigh: arr(),
    rangeLow: arr(),
    rangePosPct: arr(),
    atrKelt: arr(),
  };
}

export function runBacktest(
  candles: Candle[],
  symbol: string,
  settings: BacktestSettings,
  requestedFromMs: number,
  dailyCandles?: Candle[],
  chartIntervalMs?: number,
  /** Интервал графика в Binance-формате (15m, 1h, ...) — Pifagor 21 использует его как fallback `pivotTf`. */
  intervalLabel?: string,
  /** Order-book depth-серия для стратегий `buyforce_dca` / `sellforce_dca`. */
  depthBars?: DepthBar[],
): BacktestResult {
  if (settings.strategyKind === "pifagor_alts") {
    if (!dailyCandles?.length || chartIntervalMs == null) {
      throw new Error(
        "Pifagor ALTS: передайте dailyCandles (1d) и chartIntervalMs — daily_multiple считается на дневном ТF, как в Pine.",
      );
    }
    return runPifagorAltsBacktest(
      candles,
      symbol,
      settings,
      requestedFromMs,
      dailyCandles,
      chartIntervalMs,
    );
  }

  if (settings.strategyKind === "pivot21") {
    const res = runPivot21Backtest(candles, settings.pivot21, {
      executionOrder: settings.executionOrder,
      symbol,
      interval: intervalLabel ?? "",
    });
    // Подменим requestedFromMs (движок не знает его) — синхронизировано с шаблоном Pifagor ALTS.
    return {
      ...res,
      dataRange: { ...res.dataRange, requestedFromMs },
    };
  }

  const n = candles.length;
  const signalsOut: (boolean | null)[] = new Array(n).fill(null);
  const metaOut: (SignalBarState | null)[] = new Array(n).fill(null);

  /**
   * Универсальный слой сигналов: какая бы стратегия ни была (chaik_dca / buyforce_dca /
   * sellforce_dca), на этом шаге получаем longActive[], shortActive[], meta[] и series.
   * Дальнейшая DCA-логика — общая.
   *
   * Для buyforce/sellforce — `series` это мок с массивами NaN (ATR Кельтнера не считается,
   * лимитного входа нет → market entry на open следующего бара).
   */
  let longActive: boolean[];
  let shortActive: boolean[];
  let meta: (SignalBarState | null)[];
  let series: ChaikComputedSeries;

  if (settings.strategyKind === "buyforce_dca") {
    if (!depthBars?.length) {
      throw new Error(
        "BuyForce: передайте depthBars (order-book depth серия). Включите load в BacktestPage.",
      );
    }
    const r = computeBuyForceSignals(candles, depthBars, settings.buyForce);
    longActive = r.active;
    shortActive = new Array<boolean>(n).fill(false);
    meta = new Array<SignalBarState | null>(n).fill(null);
    series = makeEmptySeries(n);
  } else if (settings.strategyKind === "sellforce_dca") {
    if (!depthBars?.length) {
      throw new Error(
        "SellForce: передайте depthBars (order-book depth серия). Включите load в BacktestPage.",
      );
    }
    const r = computeSellForceSignals(candles, depthBars, settings.sellForce);
    longActive = new Array<boolean>(n).fill(false);
    shortActive = r.active;
    meta = new Array<SignalBarState | null>(n).fill(null);
    series = makeEmptySeries(n);
  } else if (settings.strategyKind === "composite") {
    /**
     * Composite: считаем сигналы для каждого слота отдельно и сводим
     * combineCompositeSignals (правило + окно подтверждения). Бот ниже работает
     * как обычно — он не знает о слотах, только об агрегированных longActive/shortActive.
     */
    const config = settings.composite;
    if (!config.slots.length) {
      throw new Error("Composite: добавьте хотя бы одну стратегию в стек.");
    }
    const needsDepth = config.slots.some(
      (s) => s.kind === "buyforce_dca" || s.kind === "sellforce_dca",
    );
    if (needsDepth && !depthBars?.length) {
      throw new Error(
        "Composite: один из слотов — BuyForce/SellForce, нужны depthBars. Включите load в BacktestPage.",
      );
    }
    /** Для лимитного входа chaik (если есть chaik-слот) — серия с ATR от ПЕРВОГО chaik-слота. */
    let chaikSeries: ChaikComputedSeries | null = null;
    let chaikMeta: (SignalBarState | null)[] | null = null;
    const slotSignals = config.slots.map((slot) => {
      if (slot.kind === "buyforce_dca") {
        const r = computeBuyForceSignals(
          candles,
          depthBars ?? [],
          slot.buyForce ?? settings.buyForce,
        );
        return { long: r.active, short: new Array<boolean>(n).fill(false) };
      }
      if (slot.kind === "sellforce_dca") {
        const r = computeSellForceSignals(
          candles,
          depthBars ?? [],
          slot.sellForce ?? settings.sellForce,
        );
        return { long: new Array<boolean>(n).fill(false), short: r.active };
      }
      // chaik_dca
      const r = computeChaikSignals(candles, slot.chaikKelt ?? settings.indicator);
      if (chaikSeries == null) {
        chaikSeries = r.series;
        chaikMeta = r.meta;
      }
      return { long: r.longActive, short: r.shortActive };
    });
    const combined = combineCompositeSignals(
      slotSignals,
      config.rule,
      config.confirmWindowBars,
      config.minSignalCount,
      n,
    );
    longActive = combined.longActive;
    shortActive = combined.shortActive;
    meta = chaikMeta ?? new Array<SignalBarState | null>(n).fill(null);
    series = chaikSeries ?? makeEmptySeries(n);
  } else {
    // chaik_dca (V2_ЧайкКельт) — default дефолт для legacy/новых юзеров.
    const r = computeChaikSignals(candles, settings.indicator);
    longActive = r.longActive;
    shortActive = r.shortActive;
    meta = r.meta;
    series = r.series;
  }

  let equity = settings.dca.startDepositUsdt;
  const equityCurve: EquityPoint[] = [];
  let peak = equity;
  const trades: TradeRecord[] = [];

  let open: WorkingTrade | null = null;
  let pendingLongOpen: PendingLongOpen | null = null;
  let pendingSignalBar: number | null = null;
  let pendingDir: TradeDirection | null = null;
  let tradeSeq = 1;
  let openPositionAtDataEnd: OpenPositionSnapshot | null = null;

  const pushEquity = (tMs: number) => {
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    equityCurve.push({ time: tMs, equity, drawdownPct: dd, peakEquity: peak });
  };

  const finalizeTrade = (
    tr: WorkingTrade,
    exit: TradeRecord["exitReason"],
    exitPrice: number,
    tMs: number,
    barIndex: number,
    /**
     * Для end_of_test (открытая позиция на конце выборки): записываем сделку
     * только для отрисовки на графике (DCA-сетка, AVG, TP), но НЕ обновляем
     * equity и не пушим точку — иначе нереализованный убыток засоряет кривую.
     * Метрики такие сделки тоже отфильтровывают (см. computeMetrics).
     */
    isOpenPosition = false,
  ) => {
    const gross =
      tr.side === "long"
        ? tr.qty * (exitPrice - tr.avgPrice)
        : tr.qty * (tr.avgPrice - exitPrice);
    const exitNotional = exitPrice * tr.qty;
    const exitFee = (exitNotional * settings.dca.feePctPerSide) / 100;
    if (!isOpenPosition) tr.feesUsdt += exitFee;
    const pnl = gross - tr.feesUsdt - tr.fundingUsdt;
    if (!isOpenPosition) {
      equity += pnl;
      if (equity > peak) peak = equity;
      pushEquity(tMs);
    }

    const entryT = candles[tr.entryBar]?.time ?? candles[tr.signalBar]?.time ?? 0;
    trades.push({
      id: tr.id,
      symbol: tr.symbol,
      side: tr.side,
      marginMode: settings.dca.marginMode,
      regime: tr.regime,
      entrySignalTime: (candles[tr.signalBar]?.time ?? Math.floor(tMs / 1000)) * 1000,
      entryTime: entryT * 1000,
      exitTime: tMs,
      entryBarIndex: tr.entryBar,
      exitBarIndex: barIndex,
      firstEntryPrice: tr.firstPrice,
      avgEntryPrice: tr.avgPrice,
      exitPrice,
      maxDcaIndex: tr.maxDcaReached,
      totalGridOrders: tr.grid.rows.length,
      maxDrawdownPct: tr.maxDrawdownPct,
      pnlUsdt: pnl,
      pnlPctOnMargin:
        tr.cumNotional > 0 ? (pnl / (tr.cumNotional / settings.dca.leverage)) * 100 : 0,
      feesUsdt: tr.feesUsdt,
      firstEntryKind: tr.firstEntryKind,
      exitReason: exit,
      durationMs: tMs - entryT * 1000,
      comment: tr.comment,
      dcaGrid: {
        side: tr.side,
        firstEntryPrice: tr.firstPrice,
        rows: tr.grid.rows,
      },
      dcaFillTimesMs: tr.dcaFillTimesMs,
      equityAfterClose: equity,
    });
    open = null;
  };

  if (n > 0) pushEquity(candles[0]!.time * 1000);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const tMs = c.time * 1000;
    metaOut[i] = meta[i] ?? null;

    /** Funding */
    if (open && settings.dca.fundingPctPer8h > 0 && i > 0) {
      const prev = candles[i - 1]!;
      const dtMs = (c.time - prev.time) * 1000;
      const fundingFee =
        open.cumNotional * (settings.dca.fundingPctPer8h / 100) * (dtMs / (8 * 3600 * 1000));
      open.fundingUsdt += fundingFee;
      equity -= fundingFee;
    }

    const runPositionStep = () => {
      if (!open || i < open.simulationFromBar) return;
      const exit =
        open.side === "long"
          ? processLongBar(candles, i, open, settings)
          : processShortBar(candles, i, open, settings);

      if (exit !== "none") {
        const exitPrice =
          exit === "tp" && settings.dca.takeProfitOnClose
            ? c.close
            : exit === "tp"
            ? tpPrice(open.side, open.avgPrice, settings.dca.takeProfitPct)
            : exit === "sl" && settings.dca.stopLossPct != null
              ? slPrice(open.side, open.avgPrice, settings.dca.stopLossPct)
              : exit === "liquidation"
                ? approxLiquidationPrice(
                  open.side,
                  open.avgPrice,
                  effectiveLiquidationLeverage(settings.dca),
                )
                : c.close;
        finalizeTrade(open, exit, exitPrice, tMs, i);
      }
    };

    /** Pine long: маркет — первый fill по open следующего бара после сигнала. */
    if (!open && pendingLongOpen?.kind === "market_next_open" && i === pendingLongOpen.signalBar + 1) {
      const grid = pendingLongOpen.grid;
      const firstRow = grid.rows[0]!;
      const fillPx = c.open;
      const marginOk =
        firstRow.orderUsdt / settings.dca.leverage <=
        maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
      if (marginOk) {
        const o = createOpenTrade({
          id: tradeSeq++,
          symbol,
          dir: "long",
          signalBar: pendingLongOpen.signalBar,
          settings,
          meta: pendingLongOpen.meta,
          grid,
          entryBar: i,
          simulationFromBar: i,
          firstPrice: grid.firstEntryPrice,
          firstFillPrice: fillPx,
          firstFillTimeMs: c.time * 1000,
          firstEntryKind: "market",
        });
        if (o) open = o;
      }
      pendingLongOpen = null;
    }

    /** Pine long: лимит — первый fill при low <= цены первого уровня сетки. */
    if (!open && pendingLongOpen?.kind === "limit_first") {
      const grid = pendingLongOpen.grid;
      const firstRow = grid.rows[0]!;
      if (c.low <= firstRow.price) {
        const marginOk =
          firstRow.orderUsdt / settings.dca.leverage <=
          maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
        if (marginOk) {
          const o = createOpenTrade({
            id: tradeSeq++,
            symbol,
            dir: "long",
            signalBar: pendingLongOpen.signalBar,
            settings,
            meta: pendingLongOpen.meta,
            grid,
            entryBar: i,
            simulationFromBar: i,
            firstPrice: grid.firstEntryPrice,
            firstFillPrice: firstRow.price,
            firstFillTimeMs: c.time * 1000,
            firstEntryKind: "limit",
          });
          if (o) open = o;
        }
        pendingLongOpen = null;
      }
    }

    runPositionStep();

    /**
     * Отложенный вход по open следующей свечи — только если сейчас нет открытого раунда (open === null).
     * Инвариант: пока сетка DCA не закрыта (TP / SL / ликвидация / конец теста), новый вход не ставится.
     */
    if (
      !open &&
      pendingSignalBar !== null &&
      pendingDir &&
      pendingLongOpen === null &&
      settings.entryTiming === "next_open"
    ) {
      if (i === pendingSignalBar + 1) {
        const ePx = firstEntryPriceAtBar(candles, pendingSignalBar, "next_open");
        if (ePx != null) {
          const grid = buildDcaGrid(pendingDir, ePx, settings.dca);
          const firstRow = grid.rows[0];
          const marginOk =
            firstRow &&
            firstRow.orderUsdt / settings.dca.leverage <=
              maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
          if (marginOk) {
            const o = createOpenTrade({
              id: tradeSeq++,
              symbol,
              dir: pendingDir,
              signalBar: pendingSignalBar,
              settings,
              meta: meta[pendingSignalBar] ?? null,
              grid,
              entryBar: i,
              simulationFromBar: i,
              firstPrice: ePx,
              firstFillTimeMs: c.time * 1000,
              firstEntryKind: "market",
            });
            if (o) open = o;
          }
        }
        pendingSignalBar = null;
        pendingDir = null;
      }
    }

    runPositionStep();

    /**
     * Новый сигнал индикатора: принимается только при отсутствии активной позиции и отложенного входа.
     * Одновременно может существовать не больше одного «раунда» (одна сетка до полного закрытия).
     */
    if (!open && pendingSignalBar === null && pendingLongOpen === null) {
      const dir = resolveDirection(i, longActive, shortActive, settings);
      if (dir === "long") {
        signalsOut[i] = true;
        const snap: SignalBarState | null = meta[i] ?? null;
        const ind = settings.indicator;
        const atrv = series.atrKelt[i] ?? NaN;
        const useLimitNow =
          Number.isFinite(atrv) &&
          atrv > 0 &&
          snap !== null &&
          ((snap.longRange && ind.useLimitRange) || (snap.longTrend && ind.useLimitTrend));
        const limitPull =
          snap !== null && snap.longTrend && ind.useLimitTrend
            ? ind.limitTrendAtr
            : ind.limitRangeAtr;
        const anchor = useLimitNow ? c.close - limitPull * atrv : c.close;
        if (Number.isFinite(anchor) && anchor > 0) {
          const grid = buildDcaGrid("long", anchor, settings.dca);
          const firstRow = grid.rows[0];
          const marginOk =
            firstRow &&
            firstRow.orderUsdt / settings.dca.leverage <=
              maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
          if (marginOk) {
            if (useLimitNow) {
              if (c.low <= firstRow!.price) {
                const o = createOpenTrade({
                  id: tradeSeq++,
                  symbol,
                  dir: "long",
                  signalBar: i,
                  settings,
                  meta: snap,
                  grid,
                  entryBar: i,
                  simulationFromBar: i,
                  firstPrice: grid.firstEntryPrice,
                  firstFillPrice: firstRow!.price,
                  firstFillTimeMs: c.time * 1000,
                  firstEntryKind: "limit",
                });
                if (o) open = o;
              } else {
                pendingLongOpen = { kind: "limit_first", signalBar: i, grid, meta: snap };
              }
            } else if (i + 1 < n) {
              pendingLongOpen = { kind: "market_next_open", signalBar: i, grid, meta: snap };
            }
          }
        }
      } else if (dir === "short") {
        signalsOut[i] = true;
        if (settings.entryTiming === "next_open") {
          if (i + 1 < n) {
            pendingSignalBar = i;
            pendingDir = "short";
          }
        } else {
          const ePx = firstEntryPriceAtBar(candles, i, "signal_close");
          const simFrom = firstSimulationBar(i, "signal_close");
          if (ePx != null && simFrom < n) {
            const grid = buildDcaGrid("short", ePx, settings.dca);
            const firstRow = grid.rows[0];
            const marginOk =
              firstRow &&
              firstRow.orderUsdt / settings.dca.leverage <=
                maxMarginAvailableUsdt(settings.dca, equity) + 1e-9;
            if (marginOk) {
              const o = createOpenTrade({
                id: tradeSeq++,
                symbol,
                dir: "short",
                signalBar: i,
                settings,
                meta: meta[i] ?? null,
                grid,
                entryBar: i,
                simulationFromBar: simFrom,
                firstPrice: ePx,
                firstFillTimeMs: c.time * 1000,
                firstEntryKind: "market",
              });
              if (o) open = o;
            }
          }
        }
      } else {
        signalsOut[i] = longActive[i] || shortActive[i] ? false : null;
      }
    }

    runPositionStep();

    pushEquity(tMs);
    if (equity > peak) peak = equity;
  }

  let lastBarAtrKelt: number | undefined;
  if (n > 0) {
    const ax = series.atrKelt[n - 1];
    if (typeof ax === "number" && Number.isFinite(ax)) lastBarAtrKelt = ax;
  }

  if (open && n > 0) {
    const cLast = candles[n - 1]!;
    const tMsEnd = cLast.time * 1000;
    const barIdx = n - 1;
    const openedAtMs = (candles[open.entryBar]?.time ?? 0) * 1000;
    openPositionAtDataEnd = buildOpenPositionSnapshot(
      open,
      cLast.close,
      openedAtMs,
      tMsEnd,
      barIdx,
      settings,
    );
    /**
     * Финализируем как end_of_test, но с isOpenPosition=true:
     *   • trades[] получает запись с dcaGrid/fills/AVG/TP — нужно для отрисовки
     *     открытой позиции на графике (метки DCA, линии AVG/TP до последнего бара)
     *   • equity НЕ меняется — нереализованный убыток в кривую не попадает
     *   • метрики (worst, PnL, winRate) фильтруют end_of_test — см. computeMetrics
     */
    finalizeTrade(open, "end_of_test", cLast.close, tMsEnd, barIdx, true);
  }

  const fromMs = n ? candles[0]!.time * 1000 : 0;
  const toMs = n ? candles[n - 1]!.time * 1000 : 0;

  return {
    candles,
    signals: signalsOut,
    signalMeta: metaOut,
    trades,
    equity: equityCurve,
    dataRange: { fromMs, toMs, requestedFromMs },
    lastBarAtrKelt,
    openPositionAtDataEnd,
  };
}
