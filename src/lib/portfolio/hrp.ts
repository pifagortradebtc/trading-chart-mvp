import type { PriceSeries } from "./types";

/**
 * Hierarchical Risk Parity (López de Prado, 2016).
 *
 * Pipeline:
 *   1) Pearson correlation matrix R of daily log-returns.
 *   2) Distance matrix D[i,j] = sqrt(0.5 · (1 - R[i,j])).
 *   3) Single-linkage hierarchical clustering producing a linkage tree.
 *   4) Quasi-diagonalization: DFS order of leaves under the cluster tree.
 *   5) Recursive bisection allocating inverse-variance budget to halves.
 *
 * Pure JS, no deps. Single-linkage is the simplest cluster rule and is
 * known to be susceptible to chaining; that's an acceptable MVP trade-off
 * (Ward/average linkage would need O(n^3) reduction logic) — flagged in
 * the result warning when the basket is large.
 */

const TRADING_DAYS_PER_YEAR = 365;

export function hrpWeights(priceSeries: PriceSeries[]): {
  weights: number[];
  warning?: string;
} {
  const n = priceSeries.length;
  if (n < 2) {
    return { weights: equal(n), warning: "n<2 — fallback equal-weight." };
  }
  const returns = priceSeries.map((p) => logReturns(p.prices));
  // Truncate to shortest aligned length defensively.
  let T = Infinity;
  for (const r of returns) T = Math.min(T, r.length);
  if (!Number.isFinite(T) || T < 5) {
    return { weights: equal(n), warning: "Слишком короткая история — equal-weight." };
  }
  for (let i = 0; i < n; i++) returns[i] = returns[i].slice(0, T);

  const cov = covarianceMatrix(returns);
  const corr = correlationFromCov(cov);

  // Guard against NaN — happens when a column is constant (zero variance).
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(corr[i][j])) {
        return {
          weights: inverseVariance(cov, range(n)),
          warning: "Корреляции содержат NaN — fallback inverse-variance.",
        };
      }
    }
  }

  // Distance matrix
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      dist[i][j] = Math.sqrt(Math.max(0, 0.5 * (1 - corr[i][j])));
    }
  }

  // Single-linkage clustering. Each leaf is an "active" cluster id 0..n-1.
  // Merges produce new ids n, n+1, ...; the tree is stored as parent map.
  type Node = { id: number; size: number; children: [number, number] | null };
  const nodes: Node[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: i, size: 1, children: null });
  // Active cluster matrix — distances between current active clusters.
  let active: number[] = range(n);
  // We track distances between *active* cluster indices using a Map keyed by sorted pair.
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const clusterDist = new Map<string, number>();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) clusterDist.set(pairKey(i, j), dist[i][j]);

  while (active.length > 1) {
    // Find closest pair
    let bestKey = "";
    let bestD = Infinity;
    let bestA = -1;
    let bestB = -1;
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const k = pairKey(active[i], active[j]);
        const d = clusterDist.get(k);
        if (d !== undefined && d < bestD) {
          bestD = d;
          bestKey = k;
          bestA = active[i];
          bestB = active[j];
        }
      }
    }
    if (bestA < 0) break;
    const newId = nodes.length;
    nodes.push({
      id: newId,
      size: nodes[bestA].size + nodes[bestB].size,
      children: [bestA, bestB],
    });
    // Single-linkage update: d(new, k) = min(d(a,k), d(b,k))
    for (const k of active) {
      if (k === bestA || k === bestB) continue;
      const dA = clusterDist.get(pairKey(bestA, k)) ?? Infinity;
      const dB = clusterDist.get(pairKey(bestB, k)) ?? Infinity;
      clusterDist.set(pairKey(newId, k), Math.min(dA, dB));
    }
    // Remove old keys
    clusterDist.delete(bestKey);
    for (const k of active) {
      if (k !== bestA) clusterDist.delete(pairKey(bestA, k));
      if (k !== bestB) clusterDist.delete(pairKey(bestB, k));
    }
    active = active.filter((x) => x !== bestA && x !== bestB);
    active.push(newId);
  }

  // Quasi-diagonalization: DFS over the root cluster to get leaf order.
  const rootId = nodes.length - 1;
  const order: number[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = nodes[id];
    if (node.children === null) {
      order.push(id);
    } else {
      // Push right then left so left is processed first.
      stack.push(node.children[1]);
      stack.push(node.children[0]);
    }
  }

  // Recursive bisection.
  const w = new Array<number>(n).fill(1);
  type Block = { from: number; to: number };
  const queue: Block[] = [{ from: 0, to: order.length }];
  while (queue.length > 0) {
    const blk = queue.shift()!;
    if (blk.to - blk.from < 2) continue;
    const mid = blk.from + Math.floor((blk.to - blk.from) / 2);
    const left = order.slice(blk.from, mid);
    const right = order.slice(mid, blk.to);
    const vLeft = clusterVariance(cov, left);
    const vRight = clusterVariance(cov, right);
    const denom = vLeft + vRight;
    const alphaLeft = denom > 0 ? 1 - vLeft / denom : 0.5;
    const alphaRight = 1 - alphaLeft;
    for (const i of left) w[i] *= alphaLeft;
    for (const i of right) w[i] *= alphaRight;
    queue.push({ from: blk.from, to: mid });
    queue.push({ from: mid, to: blk.to });
  }

  const s = w.reduce((a, b) => a + b, 0);
  if (s <= 0)
    return {
      weights: equal(n),
      warning: "HRP вернул нулевые веса — fallback equal-weight.",
    };
  for (let i = 0; i < n; i++) w[i] /= s;
  return { weights: w };
}

/**
 * Maximum Diversification (Choueifaty & Coignard).
 *   DR(w) = (Σ w_i σ_i) / sqrt(w' Σ w)
 *
 * Maximized over 5k Dirichlet samples — matches the pattern of
 * cvarMinimizingPortfolio. Pure heuristic; an analytical solver via
 * QP would be tighter but adds matrix-inverse complexity.
 */
export function maxDiversificationWeights(priceSeries: PriceSeries[]): {
  weights: number[];
  warning?: string;
} {
  const n = priceSeries.length;
  if (n < 2) return { weights: equal(n) };
  const returns = priceSeries.map((p) => logReturns(p.prices));
  let T = Infinity;
  for (const r of returns) T = Math.min(T, r.length);
  if (!Number.isFinite(T) || T < 5) {
    return { weights: equal(n), warning: "Короткое окно — equal-weight." };
  }
  for (let i = 0; i < n; i++) returns[i] = returns[i].slice(0, T);
  const cov = covarianceMatrix(returns);
  const sigmas = new Array<number>(n);
  for (let i = 0; i < n; i++) sigmas[i] = Math.sqrt(Math.max(0, cov[i][i]));

  const rng = mulberry32(8675311);
  const sims = 5000;
  let bestDR = -Infinity;
  let bestW: number[] = equal(n);
  for (let s = 0; s < sims; s++) {
    const w = dirichlet(n, rng);
    const num = dot(w, sigmas);
    const den = Math.sqrt(Math.max(0, quadForm(w, cov)));
    if (den <= 0) continue;
    const dr = num / den;
    if (dr > bestDR) {
      bestDR = dr;
      bestW = w.slice();
    }
  }
  if (!Number.isFinite(bestDR))
    return { weights: equal(n), warning: "MaxDiv sampler не сошёлся." };
  return { weights: bestW };
}

// ───── helpers ──────────────────────────────────────────────────────────────

function equal(n: number): number[] {
  if (n <= 0) return [];
  return new Array(n).fill(1 / n);
}

function range(n: number): number[] {
  const a = new Array<number>(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return a;
}

function logReturns(prices: number[]): number[] {
  const r = new Array<number>(prices.length - 1);
  for (let i = 1; i < prices.length; i++) r[i - 1] = Math.log(prices[i] / prices[i - 1]);
  return r;
}

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / Math.max(1, xs.length);
}

function covariance(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / Math.max(1, n - 1);
}

function covarianceMatrix(rets: number[][]): number[][] {
  const n = rets.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(rets[i], rets[j]);
      m[i][j] = c;
      m[j][i] = c;
    }
  }
  return m;
}

function correlationFromCov(cov: number[][]): number[][] {
  const n = cov.length;
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const denom = Math.sqrt(cov[i][i] * cov[j][j]);
      out[i][j] = denom > 0 ? cov[i][j] / denom : Number.NaN;
    }
  }
  return out;
}

/**
 * Inverse-variance weights *inside* a block, normalized.
 * `block` is a list of original asset indices.
 */
function inverseVariance(cov: number[][], block: number[]): number[] {
  const inv = block.map((i) => (cov[i][i] > 0 ? 1 / cov[i][i] : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  if (s <= 0) {
    // fallback: equal within block, mapped back to full vector
    const n = cov.length;
    const w = new Array<number>(n).fill(0);
    for (const i of block) w[i] = 1 / block.length;
    return w;
  }
  const n = cov.length;
  const w = new Array<number>(n).fill(0);
  for (let k = 0; k < block.length; k++) w[block[k]] = inv[k] / s;
  return w;
}

/**
 * Variance of the inverse-variance portfolio *within* a block, used by
 * recursive bisection: v = w' Σ w where w is the block's IV weights.
 */
function clusterVariance(cov: number[][], block: number[]): number {
  if (block.length === 0) return 0;
  const inv = block.map((i) => (cov[i][i] > 0 ? 1 / cov[i][i] : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  if (s <= 0) return 0;
  const w = inv.map((x) => x / s);
  let v = 0;
  for (let a = 0; a < block.length; a++) {
    for (let b = 0; b < block.length; b++) {
      v += w[a] * w[b] * cov[block[a]][block[b]];
    }
  }
  return v;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function quadForm(w: number[], m: number[][]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    let row = 0;
    for (let j = 0; j < w.length; j++) row += m[i][j] * w[j];
    s += w[i] * row;
  }
  return s;
}

function dirichlet(n: number, rng: () => number): number[] {
  const w = new Array<number>(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const u = rng();
    const e = -Math.log(u > 0 ? u : 1e-12);
    w[i] = e;
    s += e;
  }
  for (let i = 0; i < n; i++) w[i] /= s;
  return w;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Annualization helper exported for callers that want to display σ in % p.a.
export function annualize(daily: number): number {
  return daily * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
