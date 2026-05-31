/**
 * Composite multi-strategy signal combinator.
 *
 * Берёт сигналы от нескольких слотов и сводит их в единые longActive[]/shortActive[]
 * с помощью left-fold по per-slot joinRule:
 *
 *   active = slot1.active
 *   for i in 2..N:
 *     active = (active <slots[i].joinRule> slot_i.active)
 *
 * Где joinRule одно из:
 *   • "and" — пересечение: оба должны быть true
 *   • "or"  — объединение: достаточно одного
 *
 * Это даёт формулы вида «S1 И S2 ИЛИ S3» (left-associative — без приоритета И > ИЛИ).
 *
 * Сигналы от разных индикаторов почти не приходят на одном баре, поэтому используется
 * «окно подтверждения» в N баров: на каждом баре i для каждого слота проверяем,
 * был ли его сигнал в [i-N+1 .. i]. Если был — считаем слот «активным» на баре i.
 */

import type { JoinRule } from "./types";

/** True если в любом из последних `window` баров (включая i) значение arr[k] = true. */
function slidingAny(arr: boolean[], window: number): boolean[] {
  const win = Math.max(1, Math.floor(window));
  const n = arr.length;
  const out = new Array<boolean>(n).fill(false);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (arr[i]) count++;
    if (i >= win) {
      if (arr[i - win]) count--;
    }
    out[i] = count > 0;
  }
  return out;
}

export interface SlotSignalArrays {
  long: boolean[];
  short: boolean[];
}

/**
 * @param slotSignals per-slot {long, short} массивы
 * @param joinRules массив операторов длины = slots.length. Первый элемент игнорируется
 *                  (нечего объединять). joinRules[i] применяется между accumulator и slot i.
 * @param windowBars sliding-window размер
 * @param n длина итоговых массивов
 */
export function combineCompositeSignals(
  slotSignals: SlotSignalArrays[],
  joinRules: JoinRule[],
  windowBars: number,
  n: number,
): { longActive: boolean[]; shortActive: boolean[] } {
  if (slotSignals.length === 0) {
    return {
      longActive: new Array<boolean>(n).fill(false),
      shortActive: new Array<boolean>(n).fill(false),
    };
  }

  const longInWindow = slotSignals.map((s) => slidingAny(s.long, windowBars));
  const shortInWindow = slotSignals.map((s) => slidingAny(s.short, windowBars));

  const longActive = new Array<boolean>(n).fill(false);
  const shortActive = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    let curLong = longInWindow[0]![i] ?? false;
    let curShort = shortInWindow[0]![i] ?? false;
    for (let s = 1; s < slotSignals.length; s++) {
      const op = joinRules[s] ?? "and";
      const slotLong = longInWindow[s]![i] ?? false;
      const slotShort = shortInWindow[s]![i] ?? false;
      if (op === "and") {
        curLong = curLong && slotLong;
        curShort = curShort && slotShort;
      } else {
        curLong = curLong || slotLong;
        curShort = curShort || slotShort;
      }
    }
    longActive[i] = curLong;
    shortActive[i] = curShort;
  }

  return { longActive, shortActive };
}
