import { describe, expect, it } from "vitest";
import { combineCompositeSignals } from "../compositeSignal";
import type { JoinRule } from "../types";

function bools(arr: (0 | 1)[]): boolean[] {
  return arr.map((v) => v === 1);
}

describe("combineCompositeSignals (per-slot joinRule, left-fold)", () => {
  it("AND join: оба слота должны дать сигнал в окне", () => {
    /** 10 баров. Слот A: сигнал на баре 2. Слот B: сигнал на баре 5. window=5. */
    const slots = [
      { long: bools([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    ];
    const joinRules: JoinRule[] = ["and", "and"]; // первый игнорируется
    const r = combineCompositeSignals(slots, joinRules, 5, 10);
    expect(r.longActive[5]).toBe(true);
    expect(r.longActive[4]).toBe(false);
    expect(r.longActive[6]).toBe(true);
    expect(r.longActive[7]).toBe(false);
  });

  it("OR join: достаточно одного слота", () => {
    const slots = [
      { long: bools([0, 1, 0, 0, 0]), short: bools([0, 0, 0, 0, 0]) },
      { long: bools([0, 0, 0, 0, 0]), short: bools([0, 0, 0, 0, 0]) },
    ];
    const joinRules: JoinRule[] = ["and", "or"];
    const r = combineCompositeSignals(slots, joinRules, 3, 5);
    expect(r.longActive[1]).toBe(true);
    expect(r.longActive[3]).toBe(true);
    expect(r.longActive[4]).toBe(false);
  });

  it("формула «S1 И S2 ИЛИ S3» (left-fold)", () => {
    // window=1 — строго на одном баре
    // S1 = true на 0, false везде иначе
    // S2 = true на 0, false иначе
    // S3 = true на 1, false иначе
    // formula at bar 0: (true AND true) OR false = true
    // formula at bar 1: (false AND false) OR true = true
    // formula at bar 2: (false AND false) OR false = false
    const slots = [
      { long: bools([1, 0, 0]), short: bools([0, 0, 0]) },
      { long: bools([1, 0, 0]), short: bools([0, 0, 0]) },
      { long: bools([0, 1, 0]), short: bools([0, 0, 0]) },
    ];
    const joinRules: JoinRule[] = ["and", "and", "or"];
    const r = combineCompositeSignals(slots, joinRules, 1, 3);
    expect(r.longActive[0]).toBe(true);
    expect(r.longActive[1]).toBe(true);
    expect(r.longActive[2]).toBe(false);
  });

  it("пустой массив слотов → false везде", () => {
    const r = combineCompositeSignals([], [], 5, 3);
    expect(r.longActive).toEqual([false, false, false]);
    expect(r.shortActive).toEqual([false, false, false]);
  });

  it("смешанные LONG и SHORT слоты — голосуются отдельно", () => {
    const slots = [
      { long: bools([0, 1, 0]), short: bools([0, 0, 0]) }, // BuyForce
      { long: bools([0, 0, 0]), short: bools([0, 1, 0]) }, // SellForce
    ];
    /** AND-join: для long нужно оба, для short — оба. На баре 1: long[0]=true, long[1]=false → false */
    const rAnd = combineCompositeSignals(slots, ["and", "and"], 1, 3);
    expect(rAnd.longActive[1]).toBe(false);
    expect(rAnd.shortActive[1]).toBe(false);

    /** OR-join: достаточно одного. На баре 1: long[0] OR long[1] = true OR false = true */
    const rOr = combineCompositeSignals(slots, ["and", "or"], 1, 3);
    expect(rOr.longActive[1]).toBe(true);
    expect(rOr.shortActive[1]).toBe(true);
  });

  it("один слот: joinRule игнорируется, сигналы как есть", () => {
    const slots = [{ long: bools([0, 1, 0, 1]), short: bools([1, 0, 1, 0]) }];
    const r = combineCompositeSignals(slots, ["and"], 1, 4);
    expect(r.longActive).toEqual([false, true, false, true]);
    expect(r.shortActive).toEqual([true, false, true, false]);
  });
});
