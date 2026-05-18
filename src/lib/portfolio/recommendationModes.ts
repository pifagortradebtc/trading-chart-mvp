import type { AggregateRules } from "./strategyTypes";
import { DEFAULT_RISK_CAPS, DEFAULT_AGGREGATE_RULES } from "./riskCaps";

/**
 * Three policy presets applied with one click in the Risk Caps tab. Each
 * preset rewrites caps + aggregate rules + CVaR threshold + sleeves; the
 * Final Fund Portfolio is then recomputed via the standard reapply path.
 */
export type RecommendationMode = "conservative" | "balanced" | "aggressive";

export interface ModeConfig {
  riskCaps: Record<string, { min?: number; max?: number }>;
  aggregateRules: AggregateRules;
  cvarDefenseThreshold: number;
  botSleeve: number;
  manualSleeve: number;
  label: string;
  description: string;
}

export const MODES: Record<RecommendationMode, ModeConfig> = {
  conservative: {
    riskCaps: {
      BTCUSDT: { min: 0.55, max: 0.7 },
      ETHUSDT: { min: 0.18, max: 0.28 },
      SOLUSDT: { max: 0.08 },
      BNBUSDT: { max: 0.06 },
      HYPEUSDT: { max: 0.02 },
      TONUSDT: { max: 0.02 },
      OKBUSDT: { max: 0.02 },
    },
    aggregateRules: { coreMin: 0.75, smallAltsMax: 0.05 },
    cvarDefenseThreshold: -0.06,
    botSleeve: 0.03,
    manualSleeve: 0.02,
    label: "Conservative",
    description:
      "BTC/ETH доминирующее ядро, минимум альфа-рисков, строгая CVaR-защита.",
  },
  balanced: {
    riskCaps: { ...DEFAULT_RISK_CAPS },
    aggregateRules: { ...DEFAULT_AGGREGATE_RULES },
    cvarDefenseThreshold: -0.08,
    botSleeve: 0.05,
    manualSleeve: 0.05,
    label: "Balanced",
    description: "Базовый режим фонда — текущие defaults.",
  },
  aggressive: {
    riskCaps: {
      BTCUSDT: { min: 0.35, max: 0.55 },
      ETHUSDT: { min: 0.12, max: 0.22 },
      SOLUSDT: { max: 0.15 },
      BNBUSDT: { max: 0.1 },
      HYPEUSDT: { max: 0.07 },
      TONUSDT: { max: 0.06 },
      OKBUSDT: { max: 0.05 },
    },
    aggregateRules: { coreMin: 0.55, smallAltsMax: 0.12 },
    cvarDefenseThreshold: -0.1,
    botSleeve: 0.05,
    manualSleeve: 0.05,
    label: "Aggressive",
    description:
      "Допускается больше satellite/high-beta при тех же data-quality и CVaR ограничениях.",
  },
};
