/**
 * Вычисление сигналов BuyForce (long) и SellForce (short) для backtest.
 *
 * Формулы (ровно как в продакшен-индикаторе Pifagor + Hermes):
 *   BuyForce  RO = (bid_3 − ask_8) / ask_1.5    →  RO > zero_level = long
 *   SellForce RO = (ask_3 − bid_8) / bid_1.5    →  RO > zero_level = short
 *
 * Триггер: ребро (edge) — `prev_ro <= zero_level AND curr_ro > zero_level`.
 * Один сигнал на одно пересечение. Пока RO остаётся > zero_level — повторных
 * сигналов нет. Когда RO снова ≤ zero_level и потом опять > zero_level — следующий.
 *
 * Если для свечи нет depth-данных (timestamps OHLCV и depth не совпали или
 * snapshot отсутствует) — RO=NaN, prev_ro не двигается, сигнала нет.
 *
 * Cooldown — те же бары что и для Chaikin: после сигнала следующий нельзя
 * выдавать в течение `cooldownBars` следующих свечей.
 */

import type { Candle } from "@/types/candle";
import type { DepthBar } from "./depthTypes";

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface BuyForceSettings {
  /** Уровень нуля — над ним RO считается «бычьим» и триггерит сигнал. */
  zeroLevel: number;
  /** Минимум баров между сигналами (как в Chaikin). */
  cooldownBars: number;
}

export interface SellForceSettings {
  zeroLevel: number;
  cooldownBars: number;
}

export const DEFAULT_BUYFORCE_SETTINGS: BuyForceSettings = {
  zeroLevel: 0,
  cooldownBars: 1,
};

export const DEFAULT_SELLFORCE_SETTINGS: SellForceSettings = {
  zeroLevel: 0,
  cooldownBars: 1,
};

// ─── Compute RO ───────────────────────────────────────────────────────────────

/** BuyForce: положительное → bid близкий давит, дальний ask слабее → buy. */
export function computeBuyForceRo(b: DepthBar): number {
  if (!b.ask_1_5 || b.ask_1_5 === 0) return Number.NaN;
  return (b.bid_3 - b.ask_8) / b.ask_1_5;
}

/** SellForce: положительное → ask близкий давит, дальний bid слабее → sell. */
export function computeSellForceRo(b: DepthBar): number {
  if (!b.bid_1_5 || b.bid_1_5 === 0) return Number.NaN;
  return (b.ask_3 - b.bid_8) / b.bid_1_5;
}

// ─── Signal computation ───────────────────────────────────────────────────────

export interface DepthSignalResult {
  /** RO значение для каждой свечи (NaN если нет depth-бара). */
  ro: number[];
  /** Активен ли сигнал на этом баре (edge cross ↑). */
  active: boolean[];
  /** Сколько баров с depth-данными (для метрики качества) */
  depthBarsAvailable: number;
  /** Сколько баров пустых (для метрики качества) */
  missingDepth: number;
}

function indexDepthByTime(bars: DepthBar[]): Map<number, DepthBar> {
  const m = new Map<number, DepthBar>();
  for (const b of bars) m.set(b.t, b);
  return m;
}

/**
 * Универсальный расчёт edge-trigger по любой RO-формуле.
 * Используется и для BuyForce, и для SellForce.
 */
function computeEdgeSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  computeRo: (b: DepthBar) => number,
  zeroLevel: number,
  cooldownBars: number,
): DepthSignalResult {
  const byT = indexDepthByTime(depthBars);
  const n = candles.length;
  const ro = new Array<number>(n).fill(Number.NaN);
  const active = new Array<boolean>(n).fill(false);

  let prevRo = Number.NaN;
  let lastSignalIdx = -Infinity;
  let depthBarsAvailable = 0;
  let missingDepth = 0;

  for (let i = 0; i < n; i++) {
    const candle = candles[i];
    // candle.time — unix seconds (lightweight-charts convention)
    const depth = byT.get(candle.time);
    if (!depth) {
      missingDepth++;
      // Не двигаем prev_ro: оставляем как было, чтобы edge на следующем
      // baren с данными считался относительно последнего известного RO.
      continue;
    }
    depthBarsAvailable++;
    const currRo = computeRo(depth);
    ro[i] = currRo;

    if (Number.isFinite(prevRo) && Number.isFinite(currRo)) {
      const crossedUp = prevRo <= zeroLevel && currRo > zeroLevel;
      if (crossedUp && i - lastSignalIdx > cooldownBars) {
        active[i] = true;
        lastSignalIdx = i;
      }
    }
    if (Number.isFinite(currRo)) prevRo = currRo;
  }

  return { ro, active, depthBarsAvailable, missingDepth };
}

/**
 * Сигналы BuyForce (long-only стратегия): RO пересёк zero_level снизу вверх.
 */
export function computeBuyForceSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  settings: BuyForceSettings,
): DepthSignalResult {
  return computeEdgeSignals(
    candles,
    depthBars,
    computeBuyForceRo,
    settings.zeroLevel,
    Math.max(0, Math.floor(settings.cooldownBars)),
  );
}

/**
 * Сигналы SellForce (short-only стратегия): RO пересёк zero_level снизу вверх.
 */
export function computeSellForceSignals(
  candles: Candle[],
  depthBars: DepthBar[],
  settings: SellForceSettings,
): DepthSignalResult {
  return computeEdgeSignals(
    candles,
    depthBars,
    computeSellForceRo,
    settings.zeroLevel,
    Math.max(0, Math.floor(settings.cooldownBars)),
  );
}
