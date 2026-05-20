import { describe, expect, it } from "vitest";
import { aggregateByCluster, clusterOf } from "../clusters";

describe("clusterOf", () => {
  it("places BTC in core, ETH in infra, SOL in high-beta L1", () => {
    expect(clusterOf("BTCUSDT")).toBe("core");
    expect(clusterOf("ETHUSDT")).toBe("infra");
    expect(clusterOf("SOLUSDT")).toBe("highBetaL1");
  });

  it("places BNB/OKB in exchange, HYPE in alpha, DOGE in meme", () => {
    expect(clusterOf("BNBUSDT")).toBe("exchange");
    expect(clusterOf("OKBUSDT")).toBe("exchange");
    expect(clusterOf("HYPEUSDT")).toBe("alpha");
    expect(clusterOf("DOGEUSDT")).toBe("meme");
  });

  it("returns 'other' for unknown tickers", () => {
    expect(clusterOf("UNKNOWN1USDT")).toBe("other");
    expect(clusterOf("XYZUSDT")).toBe("other");
  });
});

describe("aggregateByCluster", () => {
  it("sums weights into the correct cluster buckets", () => {
    const weights = [0.5, 0.2, 0.15, 0.1, 0.05];
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "HYPEUSDT"];
    const out = aggregateByCluster(weights, symbols);
    const byId = new Map(out.map((e) => [e.cluster.id, e]));
    expect(byId.get("core")?.weight).toBeCloseTo(0.5, 9);
    expect(byId.get("infra")?.weight).toBeCloseTo(0.2, 9);
    expect(byId.get("highBetaL1")?.weight).toBeCloseTo(0.15, 9);
    expect(byId.get("exchange")?.weight).toBeCloseTo(0.1, 9);
    expect(byId.get("alpha")?.weight).toBeCloseTo(0.05, 9);
    expect(byId.get("meme")?.weight).toBeCloseTo(0, 9);
  });

  it("flags overshoot when a cluster exceeds its soft ceiling", () => {
    const weights = [0, 0, 0, 0, 0.5]; // 50% in alpha (soft cap 8%)
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "HYPEUSDT"];
    const out = aggregateByCluster(weights, symbols);
    const alpha = out.find((e) => e.cluster.id === "alpha")!;
    expect(alpha.overshoot).toBeGreaterThan(0.4);
  });

  it("members are sorted descending by weight", () => {
    const weights = [0.05, 0.1, 0.15];
    const symbols = ["SOLUSDT", "TONUSDT", "AVAXUSDT"];
    const out = aggregateByCluster(weights, symbols);
    const hb = out.find((e) => e.cluster.id === "highBetaL1")!;
    expect(hb.members[0].symbol).toBe("AVAXUSDT");
    expect(hb.members[1].symbol).toBe("TONUSDT");
    expect(hb.members[2].symbol).toBe("SOLUSDT");
  });
});
