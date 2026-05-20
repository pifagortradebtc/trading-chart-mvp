import { describe, expect, it } from "vitest";
import { assessDataQuality } from "../dataQuality";
import { basketWithLimited, basicBasket } from "./fixtures";

describe("assessDataQuality", () => {
  it("marks ≥365d series as 'good' with maxAllowedWeight 1", () => {
    const dq = assessDataQuality(basicBasket(400));
    expect(dq.every((d) => d.status === "good")).toBe(true);
    expect(dq.every((d) => d.maxAllowedWeight === 1)).toBe(true);
  });

  it("classifies thresholds in descending status bands", () => {
    const dq = assessDataQuality(basketWithLimited(400, 200));
    // BTC/ETH/SOL → 400 days = good. HYPE → 200 days = limited (180-365).
    expect(dq.find((d) => d.symbol === "BTCUSDT")?.status).toBe("good");
    expect(dq.find((d) => d.symbol === "HYPEUSDT")?.status).toBe("limited");
    expect(dq.find((d) => d.symbol === "HYPEUSDT")?.maxAllowedWeight).toBe(0.05);
  });

  it("marks <90d series as 'no-data' with maxAllowedWeight 0", () => {
    const dq = assessDataQuality(basketWithLimited(400, 60));
    const hype = dq.find((d) => d.symbol === "HYPEUSDT")!;
    expect(hype.status).toBe("no-data");
    expect(hype.maxAllowedWeight).toBe(0);
  });

  it("marks 90-180d series as 'very-limited' with max 2%", () => {
    const dq = assessDataQuality(basketWithLimited(400, 120));
    const hype = dq.find((d) => d.symbol === "HYPEUSDT")!;
    expect(hype.status).toBe("very-limited");
    expect(hype.maxAllowedWeight).toBe(0.02);
  });
});
