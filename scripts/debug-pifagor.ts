import {
  buildPifagorDailyContext,
  computePifagorSeries,
} from "../src/lib/backtest/pifagorAltsIndicators";
import { DEFAULT_PIFAGOR_ALTS } from "../src/lib/backtest/backtestDefaults";
import { binanceIntervalToMs } from "../src/lib/backtest/ohlcvUtils";
import type { Candle } from "../src/types/candle";

async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
  let candles: Candle[] = [];
  let start = Date.parse("2018-05-16");
  while (candles.length < 3500) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000&startTime=${start}`;
    const rows = (await fetch(url).then((r) => r.json())) as unknown[][];
    if (!rows.length) break;
    const chunk = rows.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
    candles = candles.concat(chunk);
    start = chunk[chunk.length - 1]!.time * 1000 + 86400000;
    if (chunk.length < 1000) break;
  }
  return candles;
}

const interval = "1d";
const candles = await fetchCandles("ETHUSDT", interval);
const daily = buildPifagorDailyContext(candles, candles, binanceIntervalToMs(interval));
const series = computePifagorSeries(candles, "ETHUSDT", DEFAULT_PIFAGOR_ALTS, daily);

const n = candles.length;
let cCloseLtAaa = 0;
let cGood = 0;
let cQw = 0;
let cDm = 0;
let cAll = 0;

for (let i = 0; i < n; i++) {
  const cl = candles[i]!.close;
  const a = series.aaa1[i]!;
  const qw = series.qwhalepump[i]!;
  const dm = daily.dailyMultiple[i]!;
  if (Number.isFinite(a) && cl < a) cCloseLtAaa++;
  if (series.goodTime[i]) cGood++;
  if (Number.isFinite(qw) && qw > 2) cQw++;
  if (Number.isFinite(dm) && dm < 0.7) cDm++;
  if (series.enterRaw[i]) cAll++;
}

console.log("bars", n);
console.log("close < aaa1:", cCloseLtAaa);
console.log("goodTime:", cGood);
console.log("qwhalepump > 2:", cQw);
console.log("daily_multiple < 0.7:", cDm);
console.log("enterRaw (all):", cAll);

const maxQw = Math.max(...series.qwhalepump.filter(Number.isFinite));
console.log("max qwhalepump:", maxQw);

// sample bars where close < aaa1 but no enter
for (let i = 100; i < n; i++) {
  if (series.enterRaw[i]) {
    console.log("first enter at", new Date(candles[i]!.time * 1000).toISOString().slice(0, 10), {
      close: candles[i]!.close,
      aaa1: series.aaa1[i],
      qw: series.qwhalepump[i],
      dm: daily.dailyMultiple[i],
    });
    break;
  }
}

if (cAll === 0) {
  // find bottleneck
  for (let i = 200; i < n; i++) {
    const cl = candles[i]!.close;
    const a = series.aaa1[i]!;
    if (!Number.isFinite(a)) continue;
    if (cl >= a) continue;
    console.log("close<aaa1 sample", new Date(candles[i]!.time * 1000).toISOString().slice(0, 10), {
      qw: series.qwhalepump[i],
      dm: daily.dailyMultiple[i],
      good: series.goodTime[i],
    });
    break;
  }
}
