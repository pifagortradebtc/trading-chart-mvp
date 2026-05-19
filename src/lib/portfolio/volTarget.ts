/**
 * Volatility Targeting (advisory).
 *
 * The recommended allocation is fully invested in spot. If the fund operates
 * with an annualized volatility budget (e.g. 25% σ/year is a common ceiling
 * for "moderate" crypto exposure), and the constructed portfolio's historical
 * σ exceeds that target, the operator can hold a cash sleeve to scale the
 * realized risk down:
 *
 *   exposure = min(1, target / actual)
 *   cashBuffer = 1 − exposure
 *
 * This is *not* a leverage recommendation in the other direction (target > actual)
 * — that crosses into margin territory and is out of scope. We surface the
 * positive case only: a recommended cash buffer that brings actual σ to target.
 */

export type VolTargetLevel = "ok" | "stretched" | "exceeded";

export interface VolTargetAdvisory {
  /** Target annualized σ as a fraction (e.g. 0.25 for 25% p.a.). */
  target: number;
  /** Actual annualized σ of the recommended portfolio. */
  actual: number;
  /** 0..1. (1 - exposure) of the fund routed to cash to achieve target. */
  cashBuffer: number;
  /** Final fraction of the recommended weights actually deployed. */
  exposure: number;
  level: VolTargetLevel;
  /** One-line advice surfaced in the UI. */
  advice: string;
}

const DEFAULT_TARGET = 0.25;

export function buildVolTargetAdvisory(
  actualAnnualVol: number,
  target: number = DEFAULT_TARGET
): VolTargetAdvisory | null {
  if (!Number.isFinite(actualAnnualVol) || actualAnnualVol <= 0) return null;
  if (!Number.isFinite(target) || target <= 0) return null;
  const ratio = target / actualAnnualVol;
  const exposure = Math.min(1, ratio);
  const cashBuffer = 1 - exposure;
  const level: VolTargetLevel =
    actualAnnualVol <= target
      ? "ok"
      : actualAnnualVol <= target * 1.4
        ? "stretched"
        : "exceeded";
  const advice =
    level === "ok"
      ? `σ ${(actualAnnualVol * 100).toFixed(1)}% ≤ цель ${(target * 100).toFixed(0)}% — cash buffer не нужен.`
      : level === "stretched"
        ? `σ ${(actualAnnualVol * 100).toFixed(1)}% выше цели ${(target * 100).toFixed(0)}%. Рекомендуем cash sleeve ${(cashBuffer * 100).toFixed(0)}% (exposure ${(exposure * 100).toFixed(0)}%) — приведёт σ к цели.`
        : `σ ${(actualAnnualVol * 100).toFixed(1)}% сильно выше цели ${(target * 100).toFixed(0)}%. Cash buffer ${(cashBuffer * 100).toFixed(0)}% обязателен (exposure ${(exposure * 100).toFixed(0)}%) — иначе vol-budget фонда сорван.`;
  return { target, actual: actualAnnualVol, cashBuffer, exposure, level, advice };
}
