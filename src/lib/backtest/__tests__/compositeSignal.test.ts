import { describe, expect, it } from "vitest";
import { combineCompositeSignals } from "../compositeSignal";

function bools(arr: (0 | 1)[]): boolean[] {
  return arr.map((v) => v === 1);
}

describe("combineCompositeSignals", () => {
  it("AND: оба слота должны дать сигнал в окне", () => {
    // 10 баров. Слот A: сигнал на баре 2. Слот B: сигнал на баре 5. window=5.
    // На баре 5 у слота A сигнал в [1..5] (бар 2 попадает), у слота B на 5. → composite=true
    const slots = [
      { long: bools([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    ];
    const r = combineCompositeSignals(slots, "and", 5, null, 10);
    // bar 5: slot A signal в окне [1..5] (бар 2), slot B сигнал на 5 → AND true
    expect(r.longActive[5]).toBe(true);
    expect(r.longActive[4]).toBe(false); // slot B ещё не дал
    // bar 6: slot A сигнал в окне [2..6] (бар 2), slot B в [2..6] (бар 5) → AND true
    expect(r.longActive[6]).toBe(true);
    // bar 7: slot A окно [3..7] — бара 2 уже нет, нет сигнала → AND false
    expect(r.longActive[7]).toBe(false);
  });

  it("ANY: достаточно одного слота", () => {
    const slots = [
      { long: bools([0, 1, 0, 0, 0]), short: bools([0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0]) },
    ];
    const r = combineCompositeSignals(slots, "any", 3, null, 5);
    expect(r.longActive[1]).toBe(true); // только slot A — но any
    expect(r.longActive[3]).toBe(true); // ещё в окне
    expect(r.longActive[4]).toBe(false); // бар 1 вылетел
  });

  it("MAJORITY: правильно при разных конфигурациях", () => {
    const slots = [
      { long: bools([1, 1, 1, 0, 0]), short: bools([0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 1, 1, 1]), short: bools([0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 0, 0, 1]), short: bools([0, 0, 0, 0, 0]) },
    ];
    const r = combineCompositeSignals(slots, "majority", 1, 2, 5);
    // window=1: только текущий бар
    // bar 0: только A → 1 голос < 2 → false
    // bar 2: A=1, B=1 → 2 голоса → true
    // bar 4: B=1, C=1 → 2 голоса → true
    expect(r.longActive[0]).toBe(false);
    expect(r.longActive[2]).toBe(true);
    expect(r.longActive[4]).toBe(true);
  });

  it("пустой массив слотов → false везде", () => {
    const r = combineCompositeSignals([], "and", 5, null, 3);
    expect(r.longActive).toEqual([false, false, false]);
    expect(r.shortActive).toEqual([false, false, false]);
  });

  it("smешанные LONG и SHORT слоты — голосуются отдельно", () => {
    const slots = [
      { long: bools([0, 1, 0]), short: bools([0, 0, 0]) }, // BuyForce
      { long: bools([0, 0, 0]), short: bools([0, 1, 0]) }, // SellForce
    ];
    const r = combineCompositeSignals(slots, "and", 1, null, 3);
    // AND for long: slot A (long=1 на 1), slot B (long=0 на 1) → 1 из 2 → false
    expect(r.longActive[1]).toBe(false);
    // AND for short: slot A (short=0 на 1), slot B (short=1 на 1) → 1 из 2 → false
    expect(r.shortActive[1]).toBe(false);

    // С ANY должно сработать
    const r2 = combineCompositeSignals(slots, "any", 1, null, 3);
    expect(r2.longActive[1]).toBe(true);
    expect(r2.shortActive[1]).toBe(true);
  });
});
