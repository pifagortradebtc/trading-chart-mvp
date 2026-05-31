/**
 * Composite multi-strategy signal combinator.
 *
 * Берёт сигналы от нескольких слотов (BuyForce, SellForce, ЧайкКельт) и сводит их
 * в единые longActive[]/shortActive[] массивы по выбранному правилу:
 *   • AND       — все слоты должны дать сигнал
 *   • ANY (OR)  — достаточно одного
 *   • MAJORITY  — >= minSignalCount (или половина от числа слотов по умолчанию)
 *
 * Сигналы от разных индикаторов почти не приходят на одном баре, поэтому используется
 * «окно подтверждения» в N баров: на каждом баре i для каждого слота проверяем,
 * был ли его сигнал в [i-N+1 .. i]. Если был — считаем слот «активным» на баре i.
 */

import type { CompositeRule } from "./types";

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

export function combineCompositeSignals(
  slotSignals: SlotSignalArrays[],
  rule: CompositeRule,
  windowBars: number,
  minSignalCount: number | null,
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

  const totalSlots = slotSignals.length;
  const needCount = (() => {
    if (rule === "and") return totalSlots;
    if (rule === "any") return 1;
    /** majority: либо явный minSignalCount, либо округление вверх половины. */
    const half = Math.ceil(totalSlots / 2);
    if (minSignalCount != null && minSignalCount > 0 && minSignalCount <= totalSlots) {
      return minSignalCount;
    }
    return half;
  })();

  const longActive = new Array<boolean>(n).fill(false);
  const shortActive = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    let longVotes = 0;
    let shortVotes = 0;
    for (let s = 0; s < totalSlots; s++) {
      if (longInWindow[s]![i]) longVotes++;
      if (shortInWindow[s]![i]) shortVotes++;
    }
    longActive[i] = longVotes >= needCount;
    shortActive[i] = shortVotes >= needCount;
  }

  return { longActive, shortActive };
}
