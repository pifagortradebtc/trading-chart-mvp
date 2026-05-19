export interface Kline {
  time: number;
  close: number;
  /** Base-asset volume from Binance kline row[5]. Optional — back-compat with old callers. */
  volume?: number;
}

export interface PriceSeries {
  symbol: string;
  times: number[];
  prices: number[];
  /** Base-asset volume aligned with `times`. Optional; absent for pre-volume callers. */
  volumes?: number[];
}

export interface AssetBounds {
  /** Minimum allocation fraction, 0..1. */
  min: number;
  /** Maximum allocation fraction, 0..1. */
  max: number;
}

export interface Portfolio {
  weights: number[];
  return: number;
  volatility: number;
  sharpe: number;
  sortino: number;
}

export type FrontierPoint = Portfolio;

export interface AssetStats {
  symbol: string;
  meanReturn: number;
  volatility: number;
  sharpe: number;
}

export interface MPTResult {
  symbols: string[];
  portfolios: Portfolio[];
  frontier: FrontierPoint[];
  minVol: Portfolio;
  maxSharpe: Portfolio;
  maxSortino: Portfolio;
  assetStats: AssetStats[];
  windowDays: number;
  riskFreeRate: number;
  rejectionRate: number;
}

export interface RunMPTOptions {
  priceSeries: PriceSeries[];
  simulations: number;
  riskFreeRate: number;
  bounds?: AssetBounds[];
  seed?: number;
}

export type PinnedSource =
  | "max-sharpe"
  | "max-sortino"
  | "min-vol"
  | "frontier"
  | "custom";

export interface PinnedPortfolio {
  id: string;
  name: string;
  source: PinnedSource;
  /** Explicit symbol→weight pairs so pinning survives changes to the asset list. */
  allocation: { symbol: string; weight: number }[];
  metrics: Portfolio;
  riskFreeRate: number;
  historyDays: number;
  pinnedAt: number;
  color: string;
}

export interface Preset {
  id: string;
  name: string;
  assets: string[];
  bounds: { symbol: string; min: number; max: number }[];
  historyDays: number;
  simulations: number;
  riskFreeRate: number;
  createdAt: number;
}
