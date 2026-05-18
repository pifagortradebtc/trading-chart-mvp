/**
 * Type contracts for the "Portfolio Construction Strategies" feature.
 *
 * 9 model families are produced in a single Web-Worker round-trip on top of
 * the existing Monte-Carlo cloud (see strategies.ts + strategyMetrics.ts):
 *   marketCap, equalWeight, minVol, maxSharpe, maxSortino,
 *   riskParity, blackLitterman, cvar, finalFund
 *
 * Black-Litterman is implemented as a *view-tilt MVP* (see strategies.ts);
 * full Theil-mixed Σ-prime is intentionally out of scope.
 */

export type StrategyId =
  | "marketCap"
  | "equalWeight"
  | "minVol"
  | "maxSharpe"
  | "maxSortino"
  | "riskParity"
  | "blackLitterman"
  | "cvar"
  | "finalFund";

export interface StrategyMetrics {
  /** Annualized expected return (log-mean × 365). */
  expectedReturn: number;
  /** Annualized portfolio volatility. */
  volatility: number;
  sharpe: number;
  sortino: number;
  /** Negative number, e.g. -0.42 = -42% peak-to-trough on the backtested window. */
  maxDrawdown: number;
  /** Daily CVaR at 95% — mean of the worst 5% daily portfolio returns. */
  cvar95: number;
  /** Daily CVaR at 99%. */
  cvar99: number;
  /** Pearson correlation of portfolio daily returns vs BTC daily returns. NaN if no BTC. */
  corrToBtc: number;
  /** L1 distance from equal-weight baseline (0..2). Proxy for "active share". */
  turnover: number;
}

export interface StrategyResult {
  id: StrategyId;
  name: string;
  /** Same order as priceSeries / symbols arrays. */
  weights: number[];
  metrics: StrategyMetrics;
  /** Warning surfaced to UI: "limited data", "high correlation", etc. */
  warning?: string;
  comment: string;
}

export interface ViewInput {
  symbol: string;
  /** Annual expected return, e.g. 0.20 = +20%. Range typically -0.5..+5. */
  expectedReturn: number;
  /** Confidence on the view, 0..1. 0 = ignore (use prior), 1 = override. */
  confidence: number;
  /** Hard upper bound on the asset weight after BL tilt, 0..1. */
  maxWeight: number;
}

export interface RiskCap {
  symbol: string;
  min?: number;
  max?: number;
}

export interface AggregateRules {
  /** Floor on BTC + ETH combined weight (e.g. 0.65). */
  coreMin: number;
  /** Cap on the sum of "small alts" — everything not in {BTC, ETH, the explicit majors}. */
  smallAltsMax: number;
}

export interface StressScenario {
  name: string;
  /** Per-symbol shock as a return, e.g. -0.20 = -20%. */
  shocks: Record<string, number>;
  /** Weighted sum of shocks under the supplied portfolio. */
  portfolioLoss: number;
  topContributor: { symbol: string; contribution: number };
}

export interface StrategiesPayload {
  /** Optional override of the worker market-cap snapshot. Mainly for tests. */
  marketCaps?: Record<string, number>;
  views: ViewInput[];
  riskCaps: Record<string, { min?: number; max?: number }>;
  aggregateRules: AggregateRules;
}
