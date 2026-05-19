/**
 * Pifagor Fund cluster taxonomy.
 *
 * Each asset is classified into one of seven coarse buckets. The taxonomy is
 * intentionally fund-opinionated, not a mechanical sector map: BTC is its
 * own cluster (store-of-value role), ETH is split from other L1s (settlement
 * layer + DeFi base), exchange tokens carry counterparty risk, "alpha" is
 * the small-cap satellite sleeve, meme is the most asymmetric tail.
 *
 * Soft ceilings below are *advisory* — they're the targets we suggest to the
 * operator in the cluster exposure bar. Hard limits live in riskCaps.ts
 * (per-asset min/max + smallAltsMax aggregate).
 */

export type ClusterId =
  | "core"
  | "infra"
  | "highBetaL1"
  | "exchange"
  | "alpha"
  | "meme"
  | "other";

export interface ClusterDef {
  id: ClusterId;
  label: string;
  /** One-line description shown in tooltip. */
  description: string;
  /** Hex color for the exposure bar — gold-aligned palette. */
  color: string;
  /** Soft ceiling on the cluster's total fund weight. Advisory, not enforced. */
  softCeiling: number;
  symbols: Set<string>;
}

export const CLUSTERS: ClusterDef[] = [
  {
    id: "core",
    label: "Core",
    description: "Цифровое золото — store-of-value, наименьшая хвостовая чувствительность.",
    color: "#c9a962",
    softCeiling: 0.75,
    symbols: new Set(["BTCUSDT", "BTCUSDC"]),
  },
  {
    id: "infra",
    label: "Infra",
    description: "Settlement layer + DeFi база. Корень всех smart-contract потоков.",
    color: "#e6c989",
    softCeiling: 0.3,
    symbols: new Set(["ETHUSDT", "ETHUSDC"]),
  },
  {
    id: "highBetaL1",
    label: "High-beta L1",
    description: "Конкуренты Ethereum: высокая бета к BTC, рост и просадки сильнее рынка.",
    color: "#8aa6c4",
    softCeiling: 0.18,
    symbols: new Set([
      "SOLUSDT",
      "TONUSDT",
      "AVAXUSDT",
      "ADAUSDT",
      "DOTUSDT",
      "ATOMUSDT",
      "NEARUSDT",
      "APTUSDT",
      "SUIUSDT",
      "SEIUSDT",
      "ICPUSDT",
      "ALGOUSDT",
    ]),
  },
  {
    id: "exchange",
    label: "Exchange",
    description: "Биржевые токены: counterparty-риск к платформе, не к протоколу.",
    color: "#a78bfa",
    softCeiling: 0.1,
    symbols: new Set([
      "BNBUSDT",
      "OKBUSDT",
      "BGBUSDT",
      "KCSUSDT",
      "CROUSDT",
      "HTUSDT",
      "GTUSDT",
    ]),
  },
  {
    id: "alpha",
    label: "Alpha",
    description: "Сателлиты и новые primitives: L2, perp-DEX, modular DA, restaking.",
    color: "#22d3ee",
    softCeiling: 0.08,
    symbols: new Set([
      "HYPEUSDT",
      "ARBUSDT",
      "OPUSDT",
      "JUPUSDT",
      "STXUSDT",
      "INJUSDT",
      "RNDRUSDT",
      "TIAUSDT",
      "PYTHUSDT",
      "JTOUSDT",
      "DYDXUSDT",
      "ENAUSDT",
    ]),
  },
  {
    id: "meme",
    label: "Meme",
    description: "Сентимент-плеи: highest tail, slowest fundamental backing.",
    color: "#fb923c",
    softCeiling: 0.03,
    symbols: new Set([
      "DOGEUSDT",
      "SHIBUSDT",
      "PEPEUSDT",
      "WIFUSDT",
      "BONKUSDT",
      "FLOKIUSDT",
      "BRETTUSDT",
      "MOGUSDT",
    ]),
  },
  {
    id: "other",
    label: "Other",
    description: "Не классифицировано — попадает сюда, если тикер не в таксономии фонда.",
    color: "#5c6478",
    softCeiling: 0.05,
    symbols: new Set<string>(),
  },
];

const CLUSTER_BY_SYMBOL = (() => {
  const map = new Map<string, ClusterId>();
  for (const cluster of CLUSTERS) {
    if (cluster.id === "other") continue;
    for (const sym of cluster.symbols) map.set(sym, cluster.id);
  }
  return map;
})();

export function clusterOf(symbol: string): ClusterId {
  return CLUSTER_BY_SYMBOL.get(symbol) ?? "other";
}

export interface ClusterExposure {
  cluster: ClusterDef;
  weight: number;
  /** Symbols actually present in the user's basket that fall into this cluster. */
  members: { symbol: string; weight: number }[];
  /** weight - softCeiling. Positive = overweight vs advisory target. */
  overshoot: number;
}

export function aggregateByCluster(
  weights: number[],
  symbols: string[]
): ClusterExposure[] {
  const byId = new Map<ClusterId, ClusterExposure>();
  for (const def of CLUSTERS) {
    byId.set(def.id, { cluster: def, weight: 0, members: [], overshoot: 0 });
  }
  for (let i = 0; i < weights.length; i++) {
    const sym = symbols[i];
    const id = clusterOf(sym);
    const entry = byId.get(id)!;
    entry.weight += weights[i];
    if (weights[i] > 1e-6) entry.members.push({ symbol: sym, weight: weights[i] });
  }
  for (const entry of byId.values()) {
    entry.overshoot = entry.weight - entry.cluster.softCeiling;
    entry.members.sort((a, b) => b.weight - a.weight);
  }
  return CLUSTERS.map((def) => byId.get(def.id)!);
}
