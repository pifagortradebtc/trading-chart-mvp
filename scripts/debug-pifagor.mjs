/** Standalone diagnostic — no TS imports */

async function fetchCandles() {
  let candles = [];
  let start = Date.parse("2018-05-16");
  while (candles.length < 3500) {
    const url = `https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=1000&startTime=${start}`;
    const rows = await fetch(url).then((r) => r.json());
    if (!rows.length) break;
    const chunk = rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
      volume: +r[5],
    }));
    candles = candles.concat(chunk);
    start = chunk[chunk.length - 1].time * 1000 + 86400000;
    if (chunk.length < 1000) break;
  }
  return candles;
}

function percentileNearestRank(values, endIdx, length, rankPct) {
  if (length <= 0 || endIdx < length - 1) return NaN;
  const slice = [];
  for (let k = endIdx - length + 1; k <= endIdx; k++) slice.push(values[k]);
  slice.sort((a, b) => a - b);
  const n = slice.length;
  const ordinal = Math.min(n, Math.max(1, Math.ceil((rankPct / 100) * n)));
  return slice[ordinal - 1];
}

function smaAt(arr, end, len) {
  if (end < len - 1) return NaN;
  let s = 0;
  for (let k = end - len + 1; k <= end; k++) s += arr[k];
  return s / len;
}

function emaFromSeries(values, period) {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (prev === null) {
      if (i < period - 1) continue;
      let s = 0;
      for (let j = 0; j < period; j++) s += values[i - j];
      prev = s / period;
      out[i] = prev;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function qxsaSeries(qsrc, qlen, qwei) {
  const out = new Array(qsrc.length).fill(NaN);
  let qsumfPrev = 0;
  let qoutPrev = NaN;
  for (let i = 0; i < qsrc.length; i++) {
    const qsrcNow = qsrc[i];
    const qsrcOld = i >= qlen ? qsrc[i - qlen] : NaN;
    const qsumf = (Number.isFinite(qsumfPrev) ? qsumfPrev : 0) - (Number.isFinite(qsrcOld) ? qsrcOld : 0) + qsrcNow;
    const qma = Number.isFinite(qsrcOld) ? qsumf / qlen : NaN;
    const qout = Number.isNaN(qoutPrev) ? qma : (qsrcNow * qwei + qoutPrev * (qlen - qwei)) / qlen;
    out[i] = qout;
    qsumfPrev = qsumf;
    qoutPrev = qout;
  }
  return out;
}

const candles = await fetchCandles();
const n = candles.length;
const low = candles.map((c) => c.low);
const close = candles.map((c) => c.close);
const ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);

const perc = new Array(n).fill(NaN);
for (let i = 0; i < n; i++) perc[i] = percentileNearestRank(ohlc4, i, 100, 67);

const percSma = new Array(n).fill(NaN);
for (let i = 0; i < n; i++) percSma[i] = smaAt(perc, i, 10);

const aaa1 = percSma.map((v) => (Number.isFinite(v) ? v * 0.5 : NaN));

const firstDay = Math.floor(candles[0].time / 86400) * 86400;
const dailyMultiple = new Array(n).fill(NaN);
const dailyCloseByDayIdx = [];
for (let i = 0; i < n; i++) {
  const di = Math.round((Math.floor(candles[i].time / 86400) * 86400 - firstDay) / 86400);
  while (dailyCloseByDayIdx.length <= di) dailyCloseByDayIdx.push(NaN);
  dailyCloseByDayIdx[di] = candles[i].close;
  const leghtn = Math.min(200, di + 1);
  dailyMultiple[i] = dailyCloseByDayIdx[di] / smaAt(dailyCloseByDayIdx, di, leghtn);
}

const qvar1 = low.map((_, i) => (i > 0 ? low[i - 1] : low[i]));
const absLowMinus = low.map((v, i) => Math.abs(v - qvar1[i]));
const maxLowMinus = low.map((v, i) => Math.max(v - qvar1[i], 0));
const qx1 = qxsaSeries(absLowMinus, 3, 1);
const qx2 = qxsaSeries(maxLowMinus, 3, 1);
function qvar2FromQx(qxNum, qxDen) {
  if (!Number.isFinite(qxNum) || !Number.isFinite(qxDen)) return NaN;
  if (qxDen === 0) return qxNum > 0 ? 1e6 : 0;
  return (qxNum / qxDen) * 100;
}
const qvar2 = qx1.map((v, i) => qvar2FromQx(v, qx2[i]));
const qvar3 = qvar2.map((v, i) => (close[i] * 1.2 > 0 ? v * 10 : v / 10));
const qvar3Ema = emaFromSeries(qvar3, 3);

function lowestLow(arr, len) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = len - 1; i < arr.length; i++) {
    let mn = arr[i - len + 1];
    for (let k = i - len + 2; k <= i; k++) mn = Math.min(mn, arr[k]);
    out[i] = mn;
  }
  return out;
}
function highestHigh(arr, len) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = len - 1; i < arr.length; i++) {
    let mx = arr[i - len + 1];
    for (let k = i - len + 2; k <= i; k++) mx = Math.max(mx, arr[k]);
    out[i] = mx;
  }
  return out;
}

const qvar4 = lowestLow(low, 38);
const qvar5 = highestHigh(qvar3Ema, 38);
const lowest1 = lowestLow(low, 90);
const innerArr = low.map((lv, i) => (lv <= qvar4[i] ? (qvar3Ema[i] + qvar5[i] * 2) / 2 : 0));
const innerEma = emaFromSeries(innerArr, 3);
const qwhalepump = innerEma.map((em, i) => ((lowest1[i] > 0 ? 1 : 0) * em) / 999);

const t0 = Date.UTC(2017, 11, 31) / 1000;
const t1 = Date.UTC(2034, 11, 31) / 1000;

let enter = 0;
let c1 = 0, c2 = 0, c3 = 0, c4 = 0;
for (let i = 150; i < n; i++) {
  const cl = close[i];
  const a = aaa1[i];
  const qw = qwhalepump[i];
  const dm = dailyMultiple[i];
  const gt = candles[i].time > t0 && candles[i].time < t1;
  if (Number.isFinite(a) && cl < a) c1++;
  if (gt) c2++;
  if (Number.isFinite(qw) && qw > 2) c3++;
  if (Number.isFinite(dm) && dm < 0.7) c4++;
  if (Number.isFinite(a) && cl < a && gt && Number.isFinite(qw) && qw > 2 && Number.isFinite(dm) && dm < 0.7) enter++;
}

console.log({ n, c1, c2, c3, c4, enter });
console.log("max qw", Math.max(...qwhalepump.filter(Number.isFinite)));
console.log("aaa1 sample", aaa1.slice(200, 205), "close", close.slice(200, 205));
