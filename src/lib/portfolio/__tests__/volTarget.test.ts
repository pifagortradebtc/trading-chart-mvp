import { describe, expect, it } from "vitest";
import { buildVolTargetAdvisory } from "../volTarget";

describe("buildVolTargetAdvisory", () => {
  it("returns level=ok when actual σ ≤ target", () => {
    const out = buildVolTargetAdvisory(0.2, 0.25)!;
    expect(out.level).toBe("ok");
    expect(out.cashBuffer).toBe(0);
    expect(out.exposure).toBe(1);
  });

  it("computes cash buffer to bring σ to target when stretched", () => {
    const out = buildVolTargetAdvisory(0.5, 0.25)!;
    expect(out.level).toBe("exceeded");
    expect(out.exposure).toBeCloseTo(0.5, 6);
    expect(out.cashBuffer).toBeCloseTo(0.5, 6);
  });

  it("returns null on invalid inputs", () => {
    expect(buildVolTargetAdvisory(0)).toBeNull();
    expect(buildVolTargetAdvisory(NaN)).toBeNull();
    expect(buildVolTargetAdvisory(0.25, -1)).toBeNull();
  });

  it("level=stretched lies between 1× and 1.4× target", () => {
    const out = buildVolTargetAdvisory(0.3, 0.25)!;
    expect(out.level).toBe("stretched");
    expect(out.cashBuffer).toBeGreaterThan(0);
    expect(out.cashBuffer).toBeLessThan(0.3);
  });
});
