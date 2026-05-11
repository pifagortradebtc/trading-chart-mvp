/**
 * Логика индикатора V2_ЧайкКельт (перенос с Pine): RANGE / TREND, LONG / SHORT / AUTO.
 * Сигнал на баре i использует только данные до close[i] включительно (без lookahead).
 */

import type { Candle } from "@/types/candle";
import {
  adxDi,
  chaikinOscillator,
  emaFromSeries,
  highestHigh,
  keltnerChannel,
  lowestLow,
  rsi,
} from "./indicators";
import type {
  ChaikKeltSettings,
  IndicatorDirectionFilter,
  MarketRegime,
  SignalBarState,
  TradeDirection,
} from "./types";

export interface ChaikComputedSeries {
  chOsc: number[];
  adx: number[];
  diPlus: number[];
  diMinus: number[];
  rsiVal: number[];
  emaPullback: number[];
  kUpper: number[];
  kLower: number[];
  rangeHigh: number[];
  rangeLow: number[];
  rangePosPct: number[];
}

export function computeChaikSeries(candles: Candle[], cfg: ChaikKeltSettings): ChaikComputedSeries {
  const n = candles.length;
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const vol = candles.map((c) => c.volume ?? 0);

  const chOsc = chaikinOscillator(high, low, close, vol, cfg.chaikinFast, cfg.chaikinSlow);
  const { adx, diPlus, diMinus } = adxDi(high, low, close, cfg.adxLength);
  const rsiVal = cfg.rsiEnabled ? rsi(close, cfg.rsiLen) : close.map(() => 50);
  const emaPullback = emaFromSeries(close, cfg.emaPullbackLen);
  const { upper: kUpper, lower: kLower } = keltnerChannel(
    close,
    high,
    low,
    cfg.keltnerEmaLen,
    cfg.keltnerAtrLen,
    cfg.keltnerMult,
  );
  const rangeHigh = highestHigh(high, cfg.rangeBars);
  const rangeLow = lowestLow(low, cfg.rangeBars);
  const rangePosPct = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const rh = rangeHigh[i];
    const rl = rangeLow[i];
    if (!Number.isFinite(rh) || !Number.isFinite(rl) || rh === rl) continue;
    rangePosPct[i] = ((close[i] - rl) / (rh - rl)) * 100;
  }

  return { chOsc, adx, diPlus, diMinus, rsiVal, emaPullback, kUpper, kLower, rangeHigh, rangeLow, rangePosPct };
}

function dirAllowed(filter: IndicatorDirectionFilter, side: TradeDirection): boolean {
  if (filter === "auto") return true;
  if (filter === "long_only") return side === "long";
  return side === "short";
}

function cooldownOk(lastSignalBar: number, i: number, cooldownBars: number): boolean {
  if (lastSignalBar < 0) return true;
  return i - lastSignalBar > cooldownBars;
}

/** Pine: cross_mode выкл → достаточно ch>0; вкл → только бар пересечения нуля снизу вверх. */
function chaikinBullish(cfg: ChaikKeltSettings, chOsc: number[], i: number): boolean {
  const ch = chOsc[i];
  if (!Number.isFinite(ch) || ch <= 0) return false;
  if (!cfg.crossMode) return true;
  if (i === 0) return false;
  const prev = chOsc[i - 1];
  return Number.isFinite(prev) && prev <= 0;
}

/** Pine: cross_mode выкл → ch<0; вкл → пересечение сверху вниз. */
function chaikinBearish(cfg: ChaikKeltSettings, chOsc: number[], i: number): boolean {
  const ch = chOsc[i];
  if (!Number.isFinite(ch) || ch >= 0) return false;
  if (!cfg.crossMode) return true;
  if (i === 0) return false;
  const prev = chOsc[i - 1];
  return Number.isFinite(prev) && prev >= 0;
}

/** LONG RANGE */
function longRange(
  i: number,
  series: ChaikComputedSeries,
  cfg: ChaikKeltSettings,
): { ok: boolean; reason: string } {
  const { chOsc, adx, diPlus, diMinus, rsiVal, rangePosPct } = series;
  const adxv = adx[i];
  if (!chaikinBullish(cfg, chOsc, i))
    return {
      ok: false,
      reason: cfg.crossMode ? "Нет пересечения Чайкина в лонг" : "Chaikin ≤ 0",
    };
  if (!Number.isFinite(adxv) || adxv > cfg.adxThreshold) return { ok: false, reason: "Не боковик (ADX)" };
  const rp = rangePosPct[i];
  if (!Number.isFinite(rp) || rp >= cfg.rangeMaxPctLong) return { ok: false, reason: "Позиция в диапазоне ≥ max%" };
  if (cfg.rsiEnabled) {
    const r = rsiVal[i];
    if (!Number.isFinite(r) || r >= cfg.rsiRangeThresholdLong) return { ok: false, reason: "RSI range" };
  }
  const dp = diPlus[i];
  const dm = diMinus[i];
  if (!Number.isFinite(dp) || !Number.isFinite(dm) || dp <= dm) return { ok: false, reason: "DI+ ≤ DI−" };
  return { ok: true, reason: "LONG RANGE: условия выполнены" };
}

/** LONG TREND */
function longTrend(
  i: number,
  candles: Candle[],
  series: ChaikComputedSeries,
  cfg: ChaikKeltSettings,
): { ok: boolean; reason: string } {
  const lb = cfg.divLookback;
  const { chOsc, adx, diPlus, diMinus, rsiVal, emaPullback, kUpper } = series;
  const ch = chOsc[i];
  const adxv = adx[i];
  if (!chaikinBullish(cfg, chOsc, i))
    return {
      ok: false,
      reason: cfg.crossMode ? "Нет пересечения Чайкина в лонг" : "Chaikin ≤ 0",
    };
  if (!Number.isFinite(adxv) || adxv <= cfg.adxThreshold) return { ok: false, reason: "Нет тренда (ADX)" };
  const ema = emaPullback[i];
  if (!Number.isFinite(ema)) return { ok: false, reason: "EMA нет" };
  const pullMul = 1 + cfg.pullbackPct / 100;
  const lo = candles[i]!.low;
  const cl = candles[i]!.close;
  if (!(lo <= ema * pullMul && cl > ema)) return { ok: false, reason: "Нет отката к EMA" };
  if (cfg.rsiEnabled) {
    const r = rsiVal[i];
    if (!Number.isFinite(r) || r >= cfg.rsiTrendThresholdLong) return { ok: false, reason: "RSI trend" };
  }
  const i3 = i - lb;
  if (i3 < 0) return { ok: false, reason: "Мало истории (lookback)" };
  const ch3 = chOsc[i3];
  const dp3 = diPlus[i3];
  if (!Number.isFinite(ch3) || !(ch > ch3)) return { ok: false, reason: "Chaikin не растёт" };
  const dp = diPlus[i];
  if (!Number.isFinite(dp3) || !(dp > dp3)) return { ok: false, reason: "DI+ не растёт" };
  const ku = kUpper[i];
  if (!Number.isFinite(ku) || !(cl < ku)) return { ok: false, reason: "Выше Keltner upper" };
  const dm = diMinus[i];
  if (!Number.isFinite(dp) || !Number.isFinite(dm) || dp <= dm) return { ok: false, reason: "DI+ ≤ DI−" };
  return { ok: true, reason: "LONG TREND: условия выполнены" };
}

/** SHORT RANGE (зеркально) */
function shortRange(
  i: number,
  series: ChaikComputedSeries,
  cfg: ChaikKeltSettings,
): { ok: boolean; reason: string } {
  const { chOsc, adx, diPlus, diMinus, rsiVal, rangePosPct } = series;
  const adxv = adx[i];
  if (!chaikinBearish(cfg, chOsc, i))
    return {
      ok: false,
      reason: cfg.crossMode ? "Нет пересечения Чайкина в шорт" : "Chaikin ≥ 0",
    };
  if (!Number.isFinite(adxv) || adxv > cfg.adxThreshold) return { ok: false, reason: "Не боковик (ADX)" };
  const rp = rangePosPct[i];
  if (!Number.isFinite(rp) || rp <= cfg.rangeMinPctShort) return { ok: false, reason: "Позиция в диапазоне ≤ min%" };
  if (cfg.rsiEnabled) {
    const r = rsiVal[i];
    if (!Number.isFinite(r) || r <= cfg.rsiRangeThresholdShort) return { ok: false, reason: "RSI range (short)" };
  }
  const dp = diPlus[i];
  const dm = diMinus[i];
  if (!Number.isFinite(dp) || !Number.isFinite(dm) || dm <= dp) return { ok: false, reason: "DI− ≤ DI+" };
  return { ok: true, reason: "SHORT RANGE: условия выполнены" };
}

/** SHORT TREND (зеркально LONG TREND) */
function shortTrend(
  i: number,
  candles: Candle[],
  series: ChaikComputedSeries,
  cfg: ChaikKeltSettings,
): { ok: boolean; reason: string } {
  const lb = cfg.divLookback;
  const { chOsc, adx, diPlus, diMinus, rsiVal, emaPullback, kLower } = series;
  const ch = chOsc[i];
  const adxv = adx[i];
  if (!chaikinBearish(cfg, chOsc, i))
    return {
      ok: false,
      reason: cfg.crossMode ? "Нет пересечения Чайкина в шорт" : "Chaikin ≥ 0",
    };
  if (!Number.isFinite(adxv) || adxv <= cfg.adxThreshold) return { ok: false, reason: "Нет тренда (ADX)" };
  const ema = emaPullback[i];
  if (!Number.isFinite(ema)) return { ok: false, reason: "EMA нет" };
  const pullMul = 1 - cfg.pullbackPct / 100;
  /** Откат к EMA снизу: high касается зоны над EMA, close ниже EMA */
  const hi = candles[i]!.high;
  const cl = candles[i]!.close;
  if (!(hi >= ema * pullMul && cl < ema)) return { ok: false, reason: "Нет отката к EMA (short)" };
  if (cfg.rsiEnabled) {
    const r = rsiVal[i];
    if (!Number.isFinite(r) || r <= cfg.rsiTrendThresholdShort) return { ok: false, reason: "RSI trend (short)" };
  }
  const i3 = i - lb;
  if (i3 < 0) return { ok: false, reason: "Мало истории (lookback)" };
  const ch3 = chOsc[i3];
  const dm3 = diMinus[i3];
  if (!Number.isFinite(ch3) || !(ch < ch3)) return { ok: false, reason: "Chaikin не падает" };
  const dm = diMinus[i];
  if (!Number.isFinite(dm3) || !(dm > dm3)) return { ok: false, reason: "DI− не растёт" };
  const kl = kLower[i];
  if (!Number.isFinite(kl) || !(cl > kl)) return { ok: false, reason: "Ниже Keltner lower" };
  const dp = diPlus[i];
  if (!Number.isFinite(dm) || !Number.isFinite(dp) || dm <= dp) return { ok: false, reason: "DI− ≤ DI+" };
  return { ok: true, reason: "SHORT TREND: условия выполнены" };
}

/**
 * Расчёт сигналов по всем барам. Массивы совпадают по длине с candles.
 */
export function computeChaikSignals(
  candles: Candle[],
  cfg: ChaikKeltSettings,
): {
  series: ChaikComputedSeries;
  longActive: boolean[];
  shortActive: boolean[];
  regime: (MarketRegime | null)[];
  meta: SignalBarState[];
  lastSignalBar: number;
} {
  const n = candles.length;
  const series = computeChaikSeries(candles, cfg);
  const longActive = new Array(n).fill(false);
  const shortActive = new Array(n).fill(false);
  const regime = new Array(n).fill(null) as (MarketRegime | null)[];
  const meta: SignalBarState[] = [];
  for (let k = 0; k < n; k++) {
    meta.push({
      longRange: false,
      longTrend: false,
      shortRange: false,
      shortTrend: false,
      regime: null,
      reasonLong: "",
      reasonShort: "",
    });
  }

  let lastSignalBar = -1;

  for (let i = 0; i < n; i++) {
    const lr = longRange(i, series, cfg);
    const lt = longTrend(i, candles, series, cfg);
    const sr = shortRange(i, series, cfg);
    const st = shortTrend(i, candles, series, cfg);

    meta[i].longRange = lr.ok;
    meta[i].longTrend = lt.ok;
    meta[i].shortRange = sr.ok;
    meta[i].shortTrend = st.ok;

    let longFires = false;
    let shortFires = false;
    let reg: MarketRegime | null = null;
    let reasonL = "";
    let reasonS = "";

    if (lt.ok) {
      longFires = true;
      reg = "trend";
      reasonL = lt.reason;
    } else if (lr.ok) {
      longFires = true;
      reg = "range";
      reasonL = lr.reason;
    }

    if (st.ok) {
      shortFires = true;
      reg = "trend";
      reasonS = st.reason;
    } else if (sr.ok) {
      shortFires = true;
      reg = "range";
      reasonS = sr.reason;
    }

    meta[i].regime = reg;

    if (longFires) meta[i].reasonLong = reasonL;
    if (shortFires) meta[i].reasonShort = reasonS;

    if (!cooldownOk(lastSignalBar, i, cfg.cooldownBars)) {
      longActive[i] = false;
      shortActive[i] = false;
      continue;
    }

    const allowL = dirAllowed(cfg.directionFilter, "long");
    const allowS = dirAllowed(cfg.directionFilter, "short");

    if (longFires && shortFires && cfg.directionFilter === "auto") {
      /** AUTO: при конфликте приоритет знака Chaikin */
      const ch = series.chOsc[i];
      if (Number.isFinite(ch)) {
        if (ch > 0 && allowL) {
          shortFires = false;
        } else if (ch < 0 && allowS) {
          longFires = false;
        } else if (ch === 0) {
          longFires = false;
          shortFires = false;
        }
      }
    }

    if (longFires && allowL) {
      longActive[i] = true;
      lastSignalBar = i;
    }
    if (shortFires && allowS) {
      shortActive[i] = true;
      lastSignalBar = i;
    }
    /** если одновременно оба после фильтра — приоритет long для простоты MVP */
    if (longActive[i] && shortActive[i]) shortActive[i] = false;
  }

  return { series, longActive, shortActive, regime, meta, lastSignalBar };
}
