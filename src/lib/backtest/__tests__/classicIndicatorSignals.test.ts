import { describe, expect, it } from "vitest";
import type { Candle } from "@/types/candle";
import {
  computeAdxFilterSignals,
  computeBollingerSignals,
  computeEmaCrossSignals,
  computeMacdSignals,
  computeRsiThresholdSignals,
  computeStochasticSignals,
  DEFAULT_ADX_FILTER,
  DEFAULT_BOLLINGER,
  DEFAULT_EMA_CROSS,
  DEFAULT_MACD,
  DEFAULT_RSI_THRESHOLD,
  DEFAULT_STOCHASTIC,
} from "../classicIndicatorSignals";

function mkCandles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i * 60,
    open: c,
    high: c * 1.005,
    low: c * 0.995,
    close: c,
    volume: 100,
  }));
}

function mkTrendCandles(start: number, drift: number, n: number, noise = 0): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const c = start + drift * i + (Math.sin(i) * noise);
    out.push({
      time: i * 60,
      open: c,
      high: c + Math.abs(drift) * 0.5 + 0.5,
      low: c - Math.abs(drift) * 0.5 - 0.5,
      close: c,
      volume: 100,
    });
  }
  return out;
}

describe("computeMacdSignals", () => {
  it("даёт LONG-сигнал при развороте downtrend → uptrend", () => {
    /**
     * Default MACD = 12/26/9 → warm-up ~35 баров. Делаем downtrend длиннее warm-up,
     * затем uptrend → fast EMA пересечёт slow + signal-line.
     */
    const downtrend = mkTrendCandles(200, -1, 80);
    const uptrend = mkTrendCandles(120, 1.5, 80).map((c, i) => ({
      ...c,
      time: (80 + i) * 60,
    }));
    const candles = [...downtrend, ...uptrend];
    const r = computeMacdSignals(candles, DEFAULT_MACD);
    const longCount = r.long.filter(Boolean).length;
    expect(longCount).toBeGreaterThan(0);
  });

  it("не падает на коротких данных", () => {
    const candles = mkCandles([100, 101, 102]);
    const r = computeMacdSignals(candles, DEFAULT_MACD);
    expect(r.long.length).toBe(3);
    expect(r.short.length).toBe(3);
  });
});

describe("computeRsiThresholdSignals", () => {
  it("LONG при выходе RSI из oversold", () => {
    /** Падение → восстановление → RSI пробьёт 30 вверх. */
    const downs = Array.from({ length: 30 }, (_, i) => 100 - i * 0.5);
    const ups = Array.from({ length: 30 }, (_, i) => 85 + i * 1.5);
    const candles = mkCandles([...downs, ...ups]);
    const r = computeRsiThresholdSignals(candles, DEFAULT_RSI_THRESHOLD);
    expect(r.long.some(Boolean)).toBe(true);
  });

  it("настроек границ слушается", () => {
    const candles = mkCandles(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5));
    /** С супер-низкими порогами должно быть больше сигналов. */
    const loose = computeRsiThresholdSignals(candles, {
      ...DEFAULT_RSI_THRESHOLD,
      oversoldThreshold: 45,
      overboughtThreshold: 55,
    });
    const tight = computeRsiThresholdSignals(candles, {
      ...DEFAULT_RSI_THRESHOLD,
      oversoldThreshold: 15,
      overboughtThreshold: 85,
    });
    expect(
      loose.long.filter(Boolean).length + loose.short.filter(Boolean).length,
    ).toBeGreaterThanOrEqual(
      tight.long.filter(Boolean).length + tight.short.filter(Boolean).length,
    );
  });
});

describe("computeEmaCrossSignals", () => {
  it("golden cross при переходе вниз→вверх", () => {
    const down = mkTrendCandles(100, -0.3, 200);
    const up = mkTrendCandles(40, 0.5, 200).map((c, i) => ({ ...c, time: (200 + i) * 60 }));
    const candles = [...down, ...up];
    const r = computeEmaCrossSignals(candles, DEFAULT_EMA_CROSS);
    expect(r.long.some(Boolean)).toBe(true);
  });
});

describe("computeBollingerSignals", () => {
  it("LONG при пробое нижней полосы после спокойного периода", () => {
    /**
     * Спокойная база с мелким шумом, потом сильный шоковый провал — должен пробить
     * нижнюю полосу. Использую низкий stdDevMult чтобы пробой случился наверняка.
     */
    const baseline = Array.from(
      { length: 40 },
      (_, i) => 100 + Math.sin(i / 2) * 0.5,
    );
    const shock = Array.from({ length: 15 }, (_, i) => 100 - (i + 1) * 1.5);
    const candles = mkCandles([...baseline, ...shock]);
    const r = computeBollingerSignals(candles, { ...DEFAULT_BOLLINGER, stdDevMult: 1.5 });
    expect(r.long.some(Boolean)).toBe(true);
  });
});

describe("computeStochasticSignals", () => {
  it("LONG при выходе %K из oversold", () => {
    /** Падение → разворот → %K пробьёт 20 вверх. */
    const candles = mkCandles([
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 80 + i),
    ]);
    const r = computeStochasticSignals(candles, DEFAULT_STOCHASTIC);
    expect(r.long.some(Boolean)).toBe(true);
  });
});

describe("computeAdxFilterSignals", () => {
  it("в тренде даёт true, в боковике — false", () => {
    /** Сильный тренд: ADX высокий. */
    const trend = mkTrendCandles(100, 2, 100);
    const trendR = computeAdxFilterSignals(trend, DEFAULT_ADX_FILTER);
    /** Боковик: ADX низкий. */
    const flat = mkCandles(
      Array.from({ length: 100 }, () => 100 + (Math.random() - 0.5) * 0.5),
    );
    const flatR = computeAdxFilterSignals(flat, DEFAULT_ADX_FILTER);
    const trendActive = trendR.long.filter(Boolean).length;
    const flatActive = flatR.long.filter(Boolean).length;
    /** В тренде должно быть значительно больше active баров. */
    expect(trendActive).toBeGreaterThan(flatActive);
  });

  it("long и short идентичны (фильтр без direction)", () => {
    const candles = mkTrendCandles(100, 1, 50);
    const r = computeAdxFilterSignals(candles, DEFAULT_ADX_FILTER);
    expect(r.long).toEqual(r.short);
  });
});
