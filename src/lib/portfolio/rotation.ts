import type { AssetDataQuality } from "./dataQuality";
import { aggregateByCluster, clusterOf, type ClusterId } from "./clusters";
import type { LiquidityAssessment } from "./liquidity";

/**
 * Rotation suggestions — strategic-level moves *on top of* the Rebalance Plan.
 *
 * The Rebalance Plan answers "per asset, am I above/below target." Rotation
 * answers "what structural shifts should the operator stage." Three drivers,
 * roughly in priority order:
 *
 *   1) Data-quality breach: an asset above its history-implied ceiling
 *      (limited/very-limited/no-data) — trim overflow into BTC.
 *   2) Cluster overshoot: a cluster (meme, alpha, exchange, high-beta L1)
 *      whose total weight exceeds its advisory soft ceiling — trim the top
 *      contributor in that cluster, route into core (BTC, ETH fallback).
 *   3) Core deficit: combined Core+Infra below 0.6 — pull from the heaviest
 *      non-core position into BTC.
 *
 * These are heuristic recommendations, not optimization output. They surface
 * the same constraints applyRiskCaps enforces, but framed as discrete
 * "do X, route to Y" tickets the operator can read sequentially.
 */

export interface RotationSuggestion {
  /** Asset to reduce. */
  trim: { symbol: string; reduceBy: number };
  /** Asset to grow (usually a core asset). */
  add: { symbol: string; addBy: number };
  reason: string;
  priority: "High" | "Medium" | "Low";
  /** Diagnostic tag — which rule produced this row. */
  source: "data-quality" | "cluster-overshoot" | "core-deficit" | "liquidity";
}

export interface BuildRotationArgs {
  weights: number[];
  symbols: string[];
  dataQuality: AssetDataQuality[] | null;
  /** Per-asset liquidity assessment — drives the "thin market" rule. */
  liquidity?: LiquidityAssessment[] | null;
  /** Minimum suggestion magnitude — anything smaller is noise. */
  minMagnitude?: number;
}

const DEFAULT_MIN = 0.005;

export function buildRotationSuggestions(args: BuildRotationArgs): RotationSuggestion[] {
  const { weights, symbols, dataQuality, liquidity, minMagnitude = DEFAULT_MIN } = args;
  const out: RotationSuggestion[] = [];
  const btcIdx = symbols.indexOf("BTCUSDT");
  const ethIdx = symbols.indexOf("ETHUSDT");

  const coreTarget = btcIdx >= 0 ? "BTCUSDT" : ethIdx >= 0 ? "ETHUSDT" : null;
  if (!coreTarget) return out;

  // ───── 1. Data-quality breaches ───────────────────────────────────────────
  if (dataQuality) {
    const dqBySymbol = new Map<string, AssetDataQuality>();
    for (const dq of dataQuality) dqBySymbol.set(dq.symbol, dq);
    for (let i = 0; i < weights.length; i++) {
      const sym = symbols[i];
      const dq = dqBySymbol.get(sym);
      if (!dq) continue;
      const overflow = weights[i] - dq.maxAllowedWeight;
      if (overflow > minMagnitude) {
        out.push({
          trim: { symbol: sym, reduceBy: overflow },
          add: { symbol: coreTarget, addBy: overflow },
          reason: `${dq.reason} — текущий вес ${(weights[i] * 100).toFixed(1)}% выше потолка data-quality.`,
          priority: dq.status === "no-data" ? "High" : "High",
          source: "data-quality",
        });
      }
    }
  }

  // ───── 2. Cluster overshoots ──────────────────────────────────────────────
  const clusters = aggregateByCluster(weights, symbols);
  // We only act on satellite-style clusters; Core/Infra deficits are handled below.
  const SATELLITE: ClusterId[] = ["highBetaL1", "exchange", "alpha", "meme", "other"];
  for (const c of clusters) {
    if (!SATELLITE.includes(c.cluster.id)) continue;
    if (c.overshoot <= minMagnitude) continue;
    if (c.members.length === 0) continue;
    // Trim the heaviest member in the cluster by the cluster's overshoot.
    const top = c.members[0];
    const reduceBy = Math.min(c.overshoot, top.weight);
    if (reduceBy < minMagnitude) continue;
    // Route into ETH for high-beta L1 (parallel exposure stays), BTC otherwise.
    const target = c.cluster.id === "highBetaL1" && ethIdx >= 0 ? "ETHUSDT" : coreTarget;
    const priority: RotationSuggestion["priority"] =
      c.cluster.id === "meme"
        ? "High"
        : c.cluster.id === "alpha" || c.cluster.id === "exchange"
          ? "Medium"
          : "Medium";
    out.push({
      trim: { symbol: top.symbol, reduceBy },
      add: { symbol: target, addBy: reduceBy },
      reason: `Кластер ${c.cluster.label} ${(c.weight * 100).toFixed(1)}% > soft-ceiling ${(c.cluster.softCeiling * 100).toFixed(0)}%.`,
      priority,
      source: "cluster-overshoot",
    });
  }

  // ───── 3. Liquidity (thin-market) ─────────────────────────────────────────
  // For each asset in red tier with weight > 5%, suggest halving the position
  // and routing into core. Yellow tier with weight > 15% gets a softer ticket.
  if (liquidity && liquidity.length === weights.length) {
    for (let i = 0; i < weights.length; i++) {
      const liq = liquidity[i];
      if (!liq) continue;
      const w = weights[i];
      let trim = 0;
      let reason = "";
      let priority: RotationSuggestion["priority"] = "Medium";
      if (liq.tier === "red" && w > 0.05) {
        trim = w * 0.5;
        reason = `Тонкий рынок (ADV ≈ ${liq.note.split(" — ")[0] ?? "thin"}). Половинить позицию ${(w * 100).toFixed(1)}%.`;
        priority = "High";
      } else if (liq.tier === "yellow" && w > 0.15) {
        trim = w - 0.15;
        reason = `Retail-large ликвидность при ${(w * 100).toFixed(1)}% веса — резать до 15% безопаснее.`;
        priority = "Medium";
      } else if (liq.tier === "no-data" && w > 0.02) {
        trim = w * 0.5;
        reason = `Нет данных volume — слепое исполнение опасно при ${(w * 100).toFixed(1)}%.`;
        priority = "Medium";
      }
      if (trim > minMagnitude) {
        out.push({
          trim: { symbol: symbols[i], reduceBy: trim },
          add: { symbol: coreTarget, addBy: trim },
          reason,
          priority,
          source: "liquidity",
        });
      }
    }
  }

  // ───── 4. Core deficit ────────────────────────────────────────────────────
  const coreWeight = clusters.find((c) => c.cluster.id === "core")?.weight ?? 0;
  const infraWeight = clusters.find((c) => c.cluster.id === "infra")?.weight ?? 0;
  const coreInfraSum = coreWeight + infraWeight;
  const CORE_INFRA_FLOOR = 0.6;
  if (coreInfraSum < CORE_INFRA_FLOOR - minMagnitude) {
    const deficit = CORE_INFRA_FLOOR - coreInfraSum;
    // Find heaviest non-core/non-infra position to trim.
    let heaviestIdx = -1;
    let heaviestW = 0;
    for (let i = 0; i < weights.length; i++) {
      const id = clusterOf(symbols[i]);
      if (id === "core" || id === "infra") continue;
      if (weights[i] > heaviestW) {
        heaviestW = weights[i];
        heaviestIdx = i;
      }
    }
    if (heaviestIdx >= 0 && heaviestW > minMagnitude) {
      const reduceBy = Math.min(deficit, heaviestW);
      out.push({
        trim: { symbol: symbols[heaviestIdx], reduceBy },
        add: { symbol: coreTarget, addBy: reduceBy },
        reason: `Core+Infra ${(coreInfraSum * 100).toFixed(1)}% < floor ${(CORE_INFRA_FLOOR * 100).toFixed(0)}%.`,
        priority: "Medium",
        source: "core-deficit",
      });
    }
  }

  // Sort: High first, then by magnitude descending.
  const prRank = { High: 0, Medium: 1, Low: 2 } as const;
  out.sort((a, b) => {
    const r = prRank[a.priority] - prRank[b.priority];
    if (r !== 0) return r;
    return b.trim.reduceBy - a.trim.reduceBy;
  });

  return out;
}
