/**
 * Анализ качества OHLCV ряда (пропуски, дубликаты, аномалии).
 */

import type { Candle } from "@/types/candle";

export interface DataQualityReport {
  barCount: number;
  startMs: number | null;
  endMs: number | null;
  duplicateTimes: number;
  gapCount: number;
  abnormalBars: number;
  expectedStepSec: number | null;
  warnings: string[];
}

/** Детект пропусков по медианному шагу времени между барами */
export function analyzeDataQuality(candles: Candle[]): DataQualityReport {
  const warnings: string[] = [];
  if (!candles.length) {
    return {
      barCount: 0,
      startMs: null,
      endMs: null,
      duplicateTimes: 0,
      gapCount: 0,
      abnormalBars: 0,
      expectedStepSec: null,
      warnings: ["Нет загруженных свечей"],
    };
  }

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const startMs = sorted[0]!.time * 1000;
  const endMs = sorted[sorted.length - 1]!.time * 1000;

  const times = new Map<number, number>();
  let abnormalBars = 0;
  for (const c of sorted) {
    times.set(c.time, (times.get(c.time) ?? 0) + 1);
    if (
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.high < c.low ||
      c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close)
    ) {
      abnormalBars++;
    }
  }
  let duplicateTimes = 0;
  times.forEach((cnt) => {
    if (cnt > 1) duplicateTimes += cnt - 1;
  });

  const steps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    steps.push(sorted[i]!.time - sorted[i - 1]!.time);
  }
  steps.sort((a, b) => a - b);
  const medianStep =
    steps.length > 0 ? steps[Math.floor(steps.length / 2)]! : null;

  let gapCount = 0;
  if (medianStep && medianStep > 0) {
    const threshold = medianStep * 2.5;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]!.time - sorted[i - 1]!.time;
      if (gap > threshold) gapCount++;
    }
  }

  if (duplicateTimes > 0) {
    warnings.push(`Обнаружено ${duplicateTimes} дубликатов времени свечи`);
  }
  if (gapCount > 0) {
    warnings.push(`Возможные разрывы в данных: ~${gapCount} интервал(ов) шире медианы`);
  }
  if (abnormalBars > 0) {
    warnings.push(`${abnormalBars} бар(ов) с подозрительными OHLC`);
  }

  const spanYears = (endMs - startMs) / (365.25 * 24 * 3600 * 1000);
  if (spanYears < 1 && sorted.length > 100) {
    warnings.push("Короткий календарный охват — статистика может быть нерепрезентативной");
  }

  return {
    barCount: sorted.length,
    startMs,
    endMs,
    duplicateTimes,
    gapCount,
    abnormalBars,
    expectedStepSec: medianStep,
    warnings,
  };
}
