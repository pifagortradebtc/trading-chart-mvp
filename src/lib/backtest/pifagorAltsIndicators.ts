/**
 * Индикаторная часть Pifagor ALTS (порт логики Pine v6, без lookahead на сигналах).
 */

import type { Candle } from "@/types/candle";
import { emaFromSeries } from "./indicators";
import type { PifagorAltsSettings } from "./pifagorAltsTypes";

export interface PifagorDailyContext {
  /** Индекс дня от первого бара (0 = день первой свечи, UTC). */
  dayIndex: number[];
  /** «Текущий» дневной close как в Pine request.security(D, close) на внутридневке. */
  dayCloseAsOf: number[];
  /** daily_multiple из Pine. */
  dailyMultiple: number[];
}

/** UTC-полночь в секундах. */
export function utcDayStartSec(tsSec: number): number {
  const d = new Date(tsSec * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

function smaAt(arr: number[], endInclusive: number, len: number): number {
  if (len <= 0 || endInclusive < len - 1) return NaN;
  let s = 0;
  for (let k = endInclusive - len + 1; k <= endInclusive; k++) {
    const v = arr[k];
    if (!Number.isFinite(v)) return NaN;
    s += v;
  }
  return s / len;
}

/** Pine ta.percentile_nearest_rank: rank 0–100, окно length. */
export function percentileNearestRank(
  values: number[],
  endIdx: number,
  length: number,
  rankPct: number,
): number {
  if (length <= 0 || endIdx < length - 1) return NaN;
  const slice: number[] = [];
  for (let k = endIdx - length + 1; k <= endIdx; k++) {
    const v = values[k];
    if (!Number.isFinite(v)) return NaN;
    slice.push(v);
  }
  slice.sort((a, b) => a - b);
  const n = slice.length;
  if (n === 0) return NaN;
  const ordinal = Math.min(n, Math.max(1, Math.ceil((rankPct / 100) * n)));
  return slice[ordinal - 1]!;
}

function vwmaSeries(src: number[], vol: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    if (i < len - 1) continue;
    let num = 0;
    let den = 0;
    for (let k = i - len + 1; k <= i; k++) {
      num += src[k]! * (vol[k] ?? 0);
      den += vol[k] ?? 0;
    }
    out[i] = den > 0 ? num / den : NaN;
  }
  return out;
}

function qxrfAt(low: number[], idx: number, qlength: number): number {
  if (qlength < 1 || idx < 0) return NaN;
  let qrVal = NaN;
  for (let i = 0; i <= qlength; i++) {
    const j = idx - i;
    if (j < 0) continue;
    const v = low[j];
    if (Number.isFinite(v)) {
      qrVal = v;
    }
  }
  return qrVal;
}

/** Pine `qxsa`: nz(qsumf[1]) − nz(qsrc[qlen]) + qsrc; qma только когда qsrc[qlen] не na. */
function qxsaSeries(qsrc: number[], qlen: number, qwei: number): number[] {
  const out = new Array(qsrc.length).fill(NaN);
  let qsumfPrev = 0;
  let qoutPrev = NaN;
  for (let i = 0; i < qsrc.length; i++) {
    const qsrcNow = qsrc[i]!;
    const qsrcOld = i >= qlen ? qsrc[i - qlen]! : NaN;
    const qsumf = qsumfPrev - (Number.isFinite(qsrcOld) ? qsrcOld : 0) + qsrcNow;
    const qma = Number.isFinite(qsrcOld) ? qsumf / qlen : NaN;
    const qout = Number.isNaN(qoutPrev) ? qma : (qsrcNow * qwei + qoutPrev * (qlen - qwei)) / qlen;
    out[i] = qout;
    qsumfPrev = qsumf;
    qoutPrev = qout;
  }
  return out;
}

/** Pine `ta.ema`: при na на входе удерживает предыдущее значение. */
function emaFromSeriesPine(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = prev ?? NaN;
      continue;
    }
    if (prev === null) {
      if (i < period - 1) continue;
      let s = 0;
      for (let j = 0; j < period; j++) s += values[i - j]!;
      prev = s / period;
      out[i] = prev;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function qvar2FromQx(qxNum: number, qxDen: number): number {
  if (!Number.isFinite(qxNum) || !Number.isFinite(qxDen)) return NaN;
  if (qxDen === 0) return NaN;
  return (qxNum / qxDen) * 100;
}

function lowestLow(low: number[], len: number): number[] {
  const out = new Array(low.length).fill(NaN);
  for (let i = 0; i < low.length; i++) {
    if (i < len - 1) continue;
    let mn = low[i - len + 1]!;
    for (let k = i - len + 2; k <= i; k++) mn = Math.min(mn, low[k]!);
    out[i] = mn;
  }
  return out;
}

function highestHigh(high: number[], len: number): number[] {
  const out = new Array(high.length).fill(NaN);
  for (let i = 0; i < high.length; i++) {
    if (i < len - 1) continue;
    let mx = high[i - len + 1]!;
    for (let k = i - len + 2; k <= i; k++) mx = Math.max(mx, high[k]!);
    out[i] = mx;
  }
  return out;
}

export function isExcludedBtcEthSymbol(symbol: string): boolean {
  const u = symbol.toUpperCase().replace("/", "");
  return u === "BLX" || u.startsWith("BTC") || u.startsWith("ETH");
}

export function buildPifagorDailyContext(candles: Candle[]): PifagorDailyContext {
  const n = candles.length;
  const dayIndex = new Array(n).fill(0);
  const dayCloseAsOf = new Array(n).fill(NaN);
  const dailyMultiple = new Array(n).fill(NaN);

  const firstDay = utcDayStartSec(candles[0]!.time);
  const startMs = candles[0]!.time * 1000;
  const closes = candles.map((c) => c.close);

  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const dayStart = utcDayStartSec(c.time);
    dayIndex[i] = Math.round((dayStart - firstDay) / 86400);
    dayCloseAsOf[i] = c.close;

    /** Как Pine: startbar = time[0], lll = days_enough > 200 ? 200 : round(days)+1 */
    const daysEnough = (c.time * 1000 - startMs) / 86400000;
    const leghtn = Math.round(daysEnough) + 1;
    const lll = daysEnough > 200 ? 200 : leghtn;
    const smaD = smaAt(closes, i, lll);
    dailyMultiple[i] =
      Number.isFinite(smaD) && smaD !== 0 ? c.close / smaD : NaN;
  }

  return { dayIndex, dayCloseAsOf, dailyMultiple };
}

const SMA_LEN = 10;
const MULT = 0.5;
const DATA_SAMPLE = 100;
const PCNT_BELOW = 33;
const PCT_RANK = 100 - PCNT_BELOW;

function ohlc4FromAgg(o: number, h: number, l: number, c: number): number {
  return (o + h + l + c) / 4;
}

/**
 * Дневной `ta.sma(ta.percentile_nearest_rank(ohlc4,100,…), 10)` по **закрытым** UTC-дням,
 * затем значение дня назначается всем барам этого дня. Упрощение относительно Pine
 * `request.security(D, …)` на внутридневке (там дневной ohlc4 ещё «плавает» внутри сессии).
 */
function buildDailyPercSmaClosedDays(candles: Candle[], dayIndex: number[]): number[] {
  const n = candles.length;
  const dailyOhlc4: number[] = [];
  let curD = -1;
  let o = 0;
  let h = 0;
  let l = 0;
  let c = 0;

  const flush = () => {
    if (curD >= 0) dailyOhlc4.push(ohlc4FromAgg(o, h, l, c));
  };

  for (let i = 0; i < n; i++) {
    const bar = candles[i]!;
    const d = dayIndex[i]!;
    if (d !== curD) {
      flush();
      curD = d;
      o = bar.open;
      h = bar.high;
      l = bar.low;
      c = bar.close;
    } else {
      h = Math.max(h, bar.high);
      l = Math.min(l, bar.low);
      c = bar.close;
    }
  }
  flush();

  const nd = dailyOhlc4.length;
  const percD = new Array(nd).fill(NaN);
  for (let d = 0; d < nd; d++) {
    if (d < DATA_SAMPLE - 1) continue;
    percD[d] = percentileNearestRank(dailyOhlc4, d, DATA_SAMPLE, PCT_RANK);
  }
  const percSmaD = new Array(nd).fill(NaN);
  for (let d = 0; d < nd; d++) {
    percSmaD[d] = smaAt(percD, d, SMA_LEN);
  }

  const lastBarOfDay = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const d = dayIndex[i]!;
    lastBarOfDay.set(d, i);
  }

  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const d = dayIndex[i]!;
    const last = lastBarOfDay.get(d) ?? i;
    const useD = i === last ? d : d - 1;
    if (useD < 0 || useD >= nd) continue;
    out[i] = percSmaD[useD]!;
  }
  return out;
}

export interface PifagorSignalDiagnostics {
  closeBelowAaa1: number;
  goodTime: number;
  whalePump: number;
  dailyMultLow: number;
  enterAll: number;
  maxWhalePump: number;
}

export interface PifagorComputedSeries {
  aaa1: number[];
  price: number[];
  diffPct: number[];
  qwhalepump: number[];
  enterRaw: boolean[];
  exitRuleRaw: boolean[];
  goodTime: boolean[];
  diagnostics: PifagorSignalDiagnostics;
}

export function computePifagorSeries(
  candles: Candle[],
  symbol: string,
  pif: PifagorAltsSettings,
  daily: PifagorDailyContext,
): PifagorComputedSeries {
  const n = candles.length;
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const vol = candles.map((c) => c.volume);
  const ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);

  const excluded = isExcludedBtcEthSymbol(symbol);

  const perc: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    perc[i] = percentileNearestRank(ohlc4, i, DATA_SAMPLE, PCT_RANK);
  }

  const percSma: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    percSma[i] = smaAt(perc, i, SMA_LEN);
  }

  const dailyPercSma = buildDailyPercSmaClosedDays(candles, daily.dayIndex);

  const vwLow = vwmaSeries(ohlc4, vol, 89);
  const aaa1_b = percSma.map((v) => (Number.isFinite(v) ? v * MULT : NaN));
  const aaa1_a = dailyPercSma.map((v) => (Number.isFinite(v) ? v * MULT : NaN));

  const aaa1: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = aaa1_a[i]!;
    const b = aaa1_b[i]!;
    const lw = vwLow[i]!;
    if (pif.lineRisk === "more" && !excluded) {
      aaa1[i] = a;
    } else if (excluded) {
      aaa1[i] = b;
    } else if (pif.lineRisk === "less") {
      aaa1[i] = Number.isFinite(lw) ? lw * 0.5 : NaN;
    } else {
      aaa1[i] = b;
    }
  }

  const price = emaFromSeries(low, 1);

  const diffPct: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const p = price[i]!;
    const a = aaa1[i]!;
    if (!Number.isFinite(p) || p === 0 || !Number.isFinite(a)) continue;
    diffPct[i] = ((p - a) / p) * 100;
  }

  const qvar1 = low.map((_, i) => qxrfAt(low, i, 1));
  const absLowMinus = low.map((v, i) => Math.abs(v - (qvar1[i] ?? NaN)));
  const maxLowMinus = low.map((v, i) => Math.max(v - (qvar1[i] ?? NaN), 0));
  const qx1 = qxsaSeries(absLowMinus, 3, 1);
  const qx2 = qxsaSeries(maxLowMinus, 3, 1);
  const qvar2 = qx1.map((v, i) => qvar2FromQx(v, qx2[i]!));
  const qvar3 = qvar2.map((v, i) => {
    const cl = close[i]!;
    return cl * 1.2 > 0 ? v * 10 : v / 10;
  });
  const qvar3Ema = emaFromSeriesPine(qvar3, 3);
  const qvar4 = lowestLow(low, 38);
  const qvar5 = highestHigh(qvar3Ema, 38);
  const lowest1 = lowestLow(low, 90);

  const innerArr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const qv3 = qvar3Ema[i]!;
    const q4 = qvar4[i]!;
    const q5 = qvar5[i]!;
    innerArr[i] = low[i]! <= q4 ? (qv3 + q5 * 2) / 2 : 0;
  }
  const innerEma = emaFromSeriesPine(innerArr, 3);
  const qwhalepump: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const l1 = lowest1[i]!;
    const q6 = l1 > 0 ? 1 : 0;
    const em = innerEma[i]!;
    qwhalepump[i] = Number.isFinite(em) ? (em / 999) * q6 : NaN;
  }

  const t0 = Math.floor(pif.dcaStartMs / 1000);
  const t1 = Math.floor(pif.dcaEndMs / 1000);
  const goodTime = candles.map((c) => c.time > t0 && c.time < t1);

  const enterRaw: boolean[] = new Array(n).fill(false);
  const exitRuleRaw: boolean[] = new Array(n).fill(false);
  let closeBelowAaa1 = 0;
  let goodTimeCount = 0;
  let whalePumpCount = 0;
  let dailyMultLowCount = 0;
  let enterAll = 0;
  let maxWhalePump = 0;

  for (let i = 0; i < n; i++) {
    const dm = daily.dailyMultiple[i]!;
    const qw = qwhalepump[i]!;
    const cl = close[i]!;
    const a = aaa1[i]!;
    const d = diffPct[i]!;
    const c1 = Number.isFinite(a) && cl < a;
    const c2 = goodTime[i]!;
    const c3 = Number.isFinite(qw) && qw > 2;
    const c4 = Number.isFinite(dm) && dm < 0.7;
    if (c1) closeBelowAaa1++;
    if (c2) goodTimeCount++;
    if (c3) whalePumpCount++;
    if (c4) dailyMultLowCount++;
    if (Number.isFinite(qw) && qw > maxWhalePump) maxWhalePump = qw;

    enterRaw[i] = c1 && c2 && c3 && c4;
    if (enterRaw[i]) enterAll++;
    exitRuleRaw[i] =
      (Number.isFinite(dm) && dm > 3.5) || (Number.isFinite(d) && d > 90);
  }

  return {
    aaa1,
    price,
    diffPct,
    qwhalepump,
    enterRaw,
    exitRuleRaw,
    goodTime,
    diagnostics: {
      closeBelowAaa1,
      goodTime: goodTimeCount,
      whalePump: whalePumpCount,
      dailyMultLow: dailyMultLowCount,
      enterAll,
      maxWhalePump,
    },
  };
}
