/**
 * Типы для depth-серий (BuyForce / SellForce backtest).
 * Отдельный модуль чтобы импортировать и из API route, и из клиентского
 * dataProvider, и из signal-файлов без cross-coupling Route Handler ↔ lib.
 */

/**
 * Один бар depth-серии. Latest snapshot per depth в окне бара.
 * Содержит минимально-достаточный набор глубин под формулы BuyForce/SellForce:
 *   bid_1_5, bid_3, bid_8  +  ask_1_5, ask_3, ask_8.
 *
 * Значения в USD (объём bid/ask стакана до X% от mid_price).
 *
 * VPS API возвращает и 5/15/30/60 + diff_*, но они нам не нужны — игнорируем.
 */
export interface DepthBar {
  /** Unix seconds, начало бара (т.е. open time, как у lightweight-charts Candle.time). */
  t: number;
  bid_1_5: number;
  bid_3: number;
  bid_8: number;
  ask_1_5: number;
  ask_3: number;
  ask_8: number;
}

/** Поддерживаемые таймфреймы для BuyForce/SellForce backtest. */
export type DepthInterval = "1m" | "5m" | "15m" | "1h";
