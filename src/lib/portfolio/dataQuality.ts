import type { PriceSeries } from "./types";

export type DataQualityStatus = "good" | "limited" | "very-limited" | "no-data";

export interface AssetDataQuality {
  symbol: string;
  status: DataQualityStatus;
  dailyCount: number;
  /** Hard ceiling on max weight imposed by data quality, 0..1. */
  maxAllowedWeight: number;
  reason: string;
}

/**
 * Classifies each asset by available daily history.
 *   - good (≥365):        full participation, no extra cap
 *   - limited (180-365):  max 5%
 *   - very-limited (90-180): max 2%
 *   - no-data (<90):      0% — excluded entirely
 *
 * This is a defensive risk control on top of model weights. Short-history
 * assets carry estimation risk in cov/μ — limiting their max share keeps
 * the fund book robust to spurious "best Sharpe" picks on thin samples.
 */
export function assessDataQuality(
  priceSeries: PriceSeries[]
): AssetDataQuality[] {
  return priceSeries.map((p) => {
    const n = p.times.length;
    if (n >= 365) {
      return {
        symbol: p.symbol,
        status: "good",
        dailyCount: n,
        maxAllowedWeight: 1,
        reason: `${n} дней истории`,
      };
    }
    if (n >= 180) {
      return {
        symbol: p.symbol,
        status: "limited",
        dailyCount: n,
        maxAllowedWeight: 0.05,
        reason: `${n} дней — limited data, max 5%`,
      };
    }
    if (n >= 90) {
      return {
        symbol: p.symbol,
        status: "very-limited",
        dailyCount: n,
        maxAllowedWeight: 0.02,
        reason: `${n} дней — very limited, max 2%`,
      };
    }
    return {
      symbol: p.symbol,
      status: "no-data",
      dailyCount: n,
      maxAllowedWeight: 0,
      reason: `${n} дней — недостаточно данных`,
    };
  });
}
