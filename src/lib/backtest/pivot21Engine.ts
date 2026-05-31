/**
 * Бэктест «Pifagor 21 str» (P-magnets) — порт Pine стратегии.
 *
 * Алгоритм по бару:
 *   1) На переходе нового периода `pivotTf` создаём магнит = (H+L+C)/3 предыдущего периода.
 *   2) Пока магнит не созрел (age < minMagnetAge): если low ≤ pivot ≤ high — он становится pre-invalid (gray, не торгуется).
 *   3) При flat: для каждого валидного зрелого магнита ставится лимит — LONG на магните ниже close, SHORT на магните выше close.
 *      На баре: проверяем заполнение лимита по [low..high]; при fill — открываем позицию, остальные ордера снимаются.
 *   4) Позиция: TP = entry × (1 ± tp%), SL = entry × (1 ∓ sl%). Conflict resolution (TP+SL на одном баре) — по executionOrder.
 *   5) Reversal: если в позиции и на баре коснулся магнит противоположной стороны (для LONG — pv > entry; для SHORT — pv < entry),
 *      выбираем самый ближний к entry («farthest»: для LONG — наименьший pv > entry; для SHORT — наибольший pv < entry; см. pine `bestRevShortPv`/`bestRevLongPv`),
 *      закрываем текущую позицию по pv и открываем reversal с TP/SL от pv.
 *   6) Martingale: после STOP (или после reversal-«стопа» — закрытие против рынка тоже считается; см. Pine `lastPnL <= 0 → +1`)
 *      consecutiveLosses += 1; после прибыли — сброс на 0. Размер = min(base + step×losses, max) × equity / entryPrice.
 *
 * Без lookahead: магнит на новом периоде Pi становится доступен только когда период t уже закрыт (т.е. на следующем баре после смены периода).
 * В реализации используем `prev period close` → магнит публикуется на баре N (первом баре нового периода) — соответствует Pine `lookahead_on`
 * c `request.security(... [high[1], low[1], close[1]], lookahead_on)`.
 */

import type { Candle } from "@/types/candle";
import type {
  BacktestResult,
  EquityPoint,
  ExecutionOrder,
  MarketRegime,
  OpenPositionSnapshot,
  SignalBarState,
  TradeDirection,
  TradeRecord,
} from "./types";
import type { Pivot21Settings } from "./pivot21Types";
import { binanceIntervalToMs } from "./ohlcvUtils";

/** Pine `pivotTf` → длительность бара в мс. Поддерживает 'D'/'W' и Binance-стиль (15m, 1h, 4h, 1d, 1w). */
export function pivotTfToMs(tf: string): number {
  const norm = String(tf || "").trim().toLowerCase();
  // Pine-style alias
  if (norm === "d") return 24 * 3600_000;
  if (norm === "w") return 7 * 24 * 3600_000;
  if (norm === "m") return 30 * 24 * 3600_000;
  // Allow capital D/W from Pine (`pivotTf='D'`)
  if (norm === "1d" || norm === "1day" || norm === "day") return 24 * 3600_000;
  if (norm === "1w" || norm === "1week" || norm === "week") return 7 * 24 * 3600_000;
  return binanceIntervalToMs(norm);
}

/** Бакет (период `pivotTf`) для метки времени `tMs`. */
function periodIndex(tMs: number, pivotMs: number): number {
  if (!Number.isFinite(pivotMs) || pivotMs <= 0) return 0;
  return Math.floor(tMs / pivotMs);
}

/**
 * Накопление агрегата периода + публикация pivot предыдущего периода на первом баре нового.
 * Возвращает на каждом баре: pivot (или null), флаг `isNewPeriod`.
 */
export interface PivotEvent {
  /** Pivot предыдущего периода — публикуется на первом баре нового. */
  pivot: number | null;
  /** Время появления (мс) — используется для id магнита. */
  createdAtMs: number;
}

export function computePivotEvents(candles: Candle[], pivotMs: number): PivotEvent[] {
  const n = candles.length;
  const events: PivotEvent[] = new Array(n).fill(null).map(() => ({ pivot: null, createdAtMs: 0 }));
  if (n === 0 || pivotMs <= 0) return events;

  // Аккумулятор текущего периода
  let curIdx = periodIndex(candles[0]!.time * 1000, pivotMs);
  let curHigh = -Infinity;
  let curLow = Infinity;
  let curClose = NaN;
  let prevPivot: number | null = null;

  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const tMs = c.time * 1000;
    const idx = periodIndex(tMs, pivotMs);
    if (idx !== curIdx) {
      // Период сменился: pivot прошлого периода вычислен по curHigh/curLow/curClose.
      if (Number.isFinite(curHigh) && Number.isFinite(curLow) && Number.isFinite(curClose)) {
        prevPivot = (curHigh + curLow + curClose) / 3;
      }
      // Reset на новый период
      curIdx = idx;
      curHigh = c.high;
      curLow = c.low;
      curClose = c.close;
      // Публикуем pivot предыдущего периода на этом (первом баре нового периода)
      events[i] = { pivot: prevPivot, createdAtMs: tMs };
    } else {
      curHigh = Math.max(curHigh, c.high);
      curLow = Math.min(curLow, c.low);
      curClose = c.close;
    }
  }
  // Самый первый бар — barstate.isfirst (Pine) — нет «предыдущего периода», pivot=null. Не публикуем.
  return events;
}

/** Состояние одного магнита (порт Pine arrays). */
interface Magnet {
  value: number;
  barIdx: number;
  createdAtMs: number;
  tested: boolean;
  preInvalidated: boolean;
}

interface OpenState {
  id: number;
  side: TradeDirection;
  entryPrice: number;
  entryBar: number;
  entryTimeMs: number;
  qty: number;
  feesUsdt: number;
  maxDrawdownPct: number;
  comment: string;
  /** Магнит, на котором открыт вход (для id трейда / комментариев). */
  magnetCreatedAtMs: number;
}

interface FinalizeArgs {
  exit: TradeRecord["exitReason"];
  exitPrice: number;
  exitTimeMs: number;
  exitBarIndex: number;
  /** Override для расчёта PnL/мартингейла. */
  isStop?: boolean;
  isTakeProfit?: boolean;
  /** end_of_test — запись для графика, equity не трогаем. См. backtestEngine.ts. */
  isOpenPosition?: boolean;
}

export function runPivot21Backtest(
  candles: Candle[],
  settings: Pivot21Settings,
  options: { executionOrder: ExecutionOrder; symbol: string; interval: string },
): BacktestResult {
  const n = candles.length;
  const { executionOrder, symbol, interval } = options;
  const pivotMs = pivotTfToMs(settings.pivotTf);
  // Если пользователь указал тот же tf, что и интервал графика — pivots всё равно строятся по событиям бара (correct).
  void interval;

  const signalsOut: (boolean | null)[] = new Array(n).fill(null);
  const metaOut: (SignalBarState | null)[] = new Array(n).fill(null);

  const tpPctFrac = settings.tpPct / 100;
  const slPctFrac = settings.slPct / 100;
  const baseRiskFrac = settings.baseRiskPct / 100;
  const maxRiskFrac = settings.maxRiskPct / 100;
  const stepRiskFrac = settings.stepRiskPct / 100;
  const feeFrac = settings.feePctPerSide / 100;

  const pivotEvents = computePivotEvents(candles, pivotMs);

  const magnets: Magnet[] = [];

  let equity = settings.initialCapitalUsdt;
  const equityCurve: EquityPoint[] = [];
  let peak = equity;
  const trades: TradeRecord[] = [];

  let tradeSeq = 1;
  let open: OpenState | null = null;
  let consecutiveLosses = 0;
  let openPositionAtDataEnd: OpenPositionSnapshot | null = null;

  const pushEquity = (tMs: number) => {
    const eqMark = markEquity();
    const dd = peak > 0 ? ((peak - eqMark) / peak) * 100 : 0;
    equityCurve.push({ time: tMs, equity: eqMark, drawdownPct: dd, peakEquity: peak });
  };

  /**
   * Equity to-market: realized + (mark - entry) × qty × sign.
   * Если позиции нет — просто realized equity.
   */
  function markEquity(): number {
    if (!open) return equity;
    const last = candles[Math.min(candles.length - 1, currentBar)];
    if (!last) return equity;
    const mark = last.close;
    const gross = open.side === "long" ? (mark - open.entryPrice) * open.qty : (open.entryPrice - mark) * open.qty;
    return equity + gross;
  }

  function currentPositionFraction(): number {
    return Math.min(baseRiskFrac + stepRiskFrac * consecutiveLosses, maxRiskFrac);
  }

  /** Рассчитать qty при заданной entry-цене и доле equity. */
  function qtyForEntry(entryPrice: number): number {
    if (entryPrice <= 0) return 0;
    const frac = currentPositionFraction();
    return (equity * frac) / entryPrice;
  }

  function openPosition(
    side: TradeDirection,
    entryPrice: number,
    barIdx: number,
    tMs: number,
    magnetCreatedAtMs: number,
    reasonComment: string,
  ): void {
    const qty = qtyForEntry(entryPrice);
    if (qty <= 0 || !Number.isFinite(qty)) return;
    const notional = qty * entryPrice;
    const fee = notional * feeFrac;
    equity -= fee;
    open = {
      id: tradeSeq++,
      side,
      entryPrice,
      entryBar: barIdx,
      entryTimeMs: tMs,
      qty,
      feesUsdt: fee,
      maxDrawdownPct: 0,
      comment: reasonComment,
      magnetCreatedAtMs,
    };
  }

  function finalizeTrade(args: FinalizeArgs): void {
    if (!open) return;
    const { exit, exitPrice, exitTimeMs, exitBarIndex, isOpenPosition = false } = args;
    const tr = open;
    const grossPerCoin = tr.side === "long" ? exitPrice - tr.entryPrice : tr.entryPrice - exitPrice;
    const gross = grossPerCoin * tr.qty;
    const exitFee = isOpenPosition ? 0 : exitPrice * tr.qty * feeFrac;
    const totalFees = tr.feesUsdt + exitFee;
    const pnl = gross - exitFee;
    if (!isOpenPosition) {
      equity += pnl;
      if (equity > peak) peak = equity;
      // Мартингейл: при убытке consecutiveLosses++; при прибыли — сброс.
      if (pnl > 0) consecutiveLosses = 0;
      else consecutiveLosses += 1;
    }

    const notional = tr.entryPrice * tr.qty;
    const grid = {
      side: tr.side,
      firstEntryPrice: tr.entryPrice,
      rows: [
        {
          orderIndex: 1,
          price: tr.entryPrice,
          orderUsdt: notional,
          qtyCoin: tr.qty,
          cumNotionalUsdt: notional,
          avgPrice: tr.entryPrice,
          takeProfitPrice:
            tr.side === "long"
              ? tr.entryPrice * (1 + tpPctFrac)
              : tr.entryPrice * (1 - tpPctFrac),
          approxLiquidationPrice: 0,
          drawdownFromFirstPct: 0,
          marginUsedUsdt: notional,
        },
      ],
    };

    trades.push({
      id: tr.id,
      symbol,
      side: tr.side,
      marginMode: "isolated",
      regime: "range" as MarketRegime,
      entrySignalTime: tr.entryTimeMs,
      entryTime: tr.entryTimeMs,
      exitTime: exitTimeMs,
      entryBarIndex: tr.entryBar,
      exitBarIndex,
      firstEntryPrice: tr.entryPrice,
      avgEntryPrice: tr.entryPrice,
      exitPrice,
      maxDcaIndex: 1,
      totalGridOrders: 1,
      maxDrawdownPct: tr.maxDrawdownPct,
      pnlUsdt: pnl,
      pnlPctOnMargin: notional > 0 ? (pnl / notional) * 100 : 0,
      feesUsdt: totalFees,
      firstEntryKind: "limit",
      exitReason: exit,
      durationMs: exitTimeMs - tr.entryTimeMs,
      comment: tr.comment,
      dcaGrid: grid,
      dcaFillTimesMs: [tr.entryTimeMs],
      equityAfterClose: equity,
    });

    open = null;
  }

  let currentBar = 0;
  if (n > 0) pushEquity(candles[0]!.time * 1000);

  for (let i = 0; i < n; i++) {
    currentBar = i;
    const c = candles[i]!;
    const tMs = c.time * 1000;

    // 1. Создаём магнит на смене периода
    const ev = pivotEvents[i];
    if (ev && ev.pivot != null && Number.isFinite(ev.pivot)) {
      magnets.push({
        value: ev.pivot,
        barIdx: i,
        createdAtMs: ev.createdAtMs,
        tested: false,
        preInvalidated: false,
      });
      // Trim до keepP
      while (magnets.length > settings.keepP) {
        magnets.shift();
      }
    }

    // 2. Обновляем pre-invalidation на молодых магнитах
    for (let m = 0; m < magnets.length; m++) {
      const mg = magnets[m]!;
      if (mg.tested || mg.preInvalidated) continue;
      const age = i - mg.barIdx;
      if (age < settings.minMagnetAge) {
        // Касание ДО созревания
        if (c.low <= mg.value && mg.value <= c.high) {
          mg.preInvalidated = true;
        }
      }
    }

    // 3. Если позиция открыта — обработать TP/SL и reversal на этом баре
    if (open) {
      const tr: OpenState = open;
      const tpPrice = tr.side === "long" ? tr.entryPrice * (1 + tpPctFrac) : tr.entryPrice * (1 - tpPctFrac);
      const slPrice = tr.side === "long" ? tr.entryPrice * (1 - slPctFrac) : tr.entryPrice * (1 + slPctFrac);

      // Проверяем касания TP/SL за этот бар (intrabar). Не на баре открытия (Pine исполняет TP/SL на след. барах после fill).
      // Однако реальный Pine с `use_bar_magnifier` исполняет даже на том же баре. Будем строги: проверяем со следующего бара
      // после открытия — это даёт детерминированную семантику без peeking на цене лимит-входа.
      if (i > tr.entryBar) {
        const lowTouchSL = tr.side === "long" ? c.low <= slPrice : c.high >= slPrice;
        const highTouchTP = tr.side === "long" ? c.high >= tpPrice : c.low <= tpPrice;

        // Conflict resolution: оба касания на одном баре
        if (lowTouchSL && highTouchTP) {
          if (executionOrder === "conservative") {
            finalizeTrade({
              exit: "sl",
              exitPrice: slPrice,
              exitTimeMs: tMs,
              exitBarIndex: i,
              isStop: true,
            });
          } else {
            finalizeTrade({
              exit: "tp",
              exitPrice: tpPrice,
              exitTimeMs: tMs,
              exitBarIndex: i,
              isTakeProfit: true,
            });
          }
        } else if (lowTouchSL) {
          finalizeTrade({
            exit: "sl",
            exitPrice: slPrice,
            exitTimeMs: tMs,
            exitBarIndex: i,
            isStop: true,
          });
        } else if (highTouchTP) {
          finalizeTrade({
            exit: "tp",
            exitPrice: tpPrice,
            exitTimeMs: tMs,
            exitBarIndex: i,
            isTakeProfit: true,
          });
        } else {
          // Просадка
          const adverse =
            tr.side === "long" ? (tr.entryPrice - c.low) / tr.entryPrice : (c.high - tr.entryPrice) / tr.entryPrice;
          tr.maxDrawdownPct = Math.max(tr.maxDrawdownPct, adverse * 100);
        }
      }
    }

    // 4. Reversal: ищем кандидата (если позиция открыта). Pine: bestRevShortPv = магнит выше entry, к которому подошли снизу.
    //    Делаем это ДО mark-as-tested, чтобы магнит был доступен для reverse-входа.
    let bestRevShortPv: number | null = null; // для LONG → reversal в SHORT
    let bestRevLongPv: number | null = null; // для SHORT → reversal в LONG

    if (open) {
      const cur: OpenState = open;
      for (let m = 0; m < magnets.length; m++) {
        const mg = magnets[m]!;
        if (mg.tested || mg.preInvalidated) continue;
        const age = i - mg.barIdx;
        if (age < 1 || age < settings.minMagnetAge) continue;
        if (!(c.low <= mg.value && mg.value <= c.high)) continue;
        // Mag коснулся на этом баре — кандидат для reversal
        const entryPx = cur.entryPrice;
        if (cur.side === "long" && mg.value > entryPx && c.open < mg.value) {
          // Pine: bestRevShortPv = na or pv < bestRevShortPv  → ближайший ВЫШЕ entry (минимальный pv > entry)
          if (bestRevShortPv == null || mg.value < bestRevShortPv) bestRevShortPv = mg.value;
        }
        if (cur.side === "short" && mg.value < entryPx && c.open > mg.value) {
          // Pine: bestRevLongPv = na or pv > bestRevLongPv → ближайший НИЖЕ entry (максимальный pv < entry)
          if (bestRevLongPv == null || mg.value > bestRevLongPv) bestRevLongPv = mg.value;
        }
      }
    }

    // 5. Reversal execution
    if (open) {
      if (bestRevShortPv != null && settings.allowShort) {
        finalizeTrade({
          exit: "signal",
          exitPrice: bestRevShortPv,
          exitTimeMs: tMs,
          exitBarIndex: i,
        });
        openPosition("short", bestRevShortPv, i, tMs, 0, "Pivot21 · reversal SHORT");
      } else if (bestRevLongPv != null && settings.allowLong) {
        finalizeTrade({
          exit: "signal",
          exitPrice: bestRevLongPv,
          exitTimeMs: tMs,
          exitBarIndex: i,
        });
        openPosition("long", bestRevLongPv, i, tMs, 0, "Pivot21 · reversal LONG");
      }
    }

    // 6. Если flat — пробуем заполнить лимит-ордера. Pine: лимиты ставятся на close[i-1] и проверяются на [low,high] бара i.
    if (!open) {
      // Pine: при множестве магнитов лимиты ставятся на всех, выбираем первый сработавший «в пользу стратегии».
      // На одном баре может «фитнуть» несколько лимитов. Pine отрабатывает по принципу: первый исполнившийся → отмена остальных.
      // Семантика «первый»: в Pine это зависит от порядка — мы используем порядок появления магнитов (старые → новые)
      // и выбираем тот, который ближе к open бара (минимальное расстояние).
      const fills: Array<{ side: TradeDirection; pv: number; createdAtMs: number; distance: number }> = [];
      for (let m = 0; m < magnets.length; m++) {
        const mg = magnets[m]!;
        if (mg.tested || mg.preInvalidated) continue;
        const age = i - mg.barIdx;
        if (age < settings.minMagnetAge) continue;
        const prev = i > 0 ? candles[i - 1]! : null;
        if (!prev) continue;
        const prevClose = prev.close;
        // Решение об ордере по close[i-1]
        if (mg.value < prevClose && settings.allowLong) {
          // LONG limit at pv. Fill: low ≤ pv (touch from above)
          if (c.low <= mg.value) {
            fills.push({
              side: "long",
              pv: mg.value,
              createdAtMs: mg.createdAtMs,
              distance: Math.abs(c.open - mg.value),
            });
          }
        } else if (mg.value > prevClose && settings.allowShort) {
          // SHORT limit at pv. Fill: high ≥ pv
          if (c.high >= mg.value) {
            fills.push({
              side: "short",
              pv: mg.value,
              createdAtMs: mg.createdAtMs,
              distance: Math.abs(mg.value - c.open),
            });
          }
        }
      }

      if (fills.length > 0) {
        // Выбираем ближайший к open — это эквивалентно «первый сработавший лимит при движении из open»
        fills.sort((a, b) => a.distance - b.distance);
        const fill = fills[0]!;
        signalsOut[i] = true;
        metaOut[i] = {
          longRange: fill.side === "long",
          longTrend: false,
          shortRange: fill.side === "short",
          shortTrend: false,
          regime: "range",
          reasonLong: fill.side === "long" ? "Pivot21 · LONG limit fill" : "",
          reasonShort: fill.side === "short" ? "Pivot21 · SHORT limit fill" : "",
        };
        openPosition(
          fill.side,
          fill.pv,
          i,
          tMs,
          fill.createdAtMs,
          fill.side === "long" ? "Pivot21 · LONG @ pivot" : "Pivot21 · SHORT @ pivot",
        );
      }
    }

    // 7. Mark всех валидных магнитов, которых коснулась цена на этом баре, как tested
    // (после того, как они получили шанс на entry/reverse). Pine: магнит «отработал» после touch.
    for (let m = 0; m < magnets.length; m++) {
      const mg = magnets[m]!;
      if (mg.tested || mg.preInvalidated) continue;
      const age = i - mg.barIdx;
      if (age < 1 || age < settings.minMagnetAge) continue;
      if (c.low <= mg.value && mg.value <= c.high) {
        mg.tested = true;
      }
    }

    pushEquity(tMs);
    if (equity > peak) peak = equity;
  }

  // Закрытие открытой позиции в конце выборки
  if (open && n > 0) {
    const tr: OpenState = open;
    const cLast = candles[n - 1]!;
    const tMsEnd = cLast.time * 1000;
    const barIdx = n - 1;
    const notional = tr.entryPrice * tr.qty;
    const marginUsed = notional;
    const gross =
      tr.side === "long" ? tr.qty * (cLast.close - tr.entryPrice) : tr.qty * (tr.entryPrice - cLast.close);
    const unrealizedPnlPctOnMargin = marginUsed > 0 ? (gross / marginUsed) * 100 : 0;
    const tpTarget = tr.side === "long" ? tr.entryPrice * (1 + tpPctFrac) : tr.entryPrice * (1 - tpPctFrac);
    let distanceToTpPct = 0;
    if (cLast.close > 0) {
      distanceToTpPct =
        tr.side === "long" ? ((tpTarget - cLast.close) / cLast.close) * 100 : ((cLast.close - tpTarget) / cLast.close) * 100;
    }
    openPositionAtDataEnd = {
      symbol,
      side: tr.side,
      regime: "range",
      avgEntryPrice: tr.entryPrice,
      takeProfitPrice: tpTarget,
      markPrice: cLast.close,
      filledLevels: 1,
      totalGridOrders: 1,
      unrealizedPnlPctOnMargin,
      distanceToTpPct,
      openedAtMs: tr.entryTimeMs,
      lastBarAtMs: tMsEnd,
      durationMs: Math.max(0, tMsEnd - tr.entryTimeMs),
      maxDrawdownPct: tr.maxDrawdownPct,
      firstEntryKind: "limit",
      cumNotionalUsdt: notional,
      leverage: 1,
      durationBars: Math.max(1, barIdx - tr.entryBar + 1),
    };
    /** Запись для графика; equity и мартингейл не двигаем (isOpenPosition). */
    finalizeTrade({
      exit: "end_of_test",
      exitPrice: cLast.close,
      exitTimeMs: tMsEnd,
      exitBarIndex: barIdx,
      isOpenPosition: true,
    });
  }

  const fromMs = n ? candles[0]!.time * 1000 : 0;
  const toMs = n ? candles[n - 1]!.time * 1000 : 0;

  return {
    candles,
    signals: signalsOut,
    signalMeta: metaOut,
    trades,
    equity: equityCurve,
    dataRange: { fromMs, toMs, requestedFromMs: fromMs },
    lastBarAtrKelt: undefined,
    openPositionAtDataEnd,
  };
}
