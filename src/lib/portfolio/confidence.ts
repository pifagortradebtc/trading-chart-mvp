import type { AssetDataQuality } from "./dataQuality";
import type { StrategyResult } from "./strategyTypes";

export interface ConfidenceFactor {
  label: string;
  impact: "+" | "-" | "neutral";
  /** Signed point delta applied to the score (for "neutral" can be 0). */
  points: number;
  detail: string;
}

export interface ConfidenceBreakdown {
  /** 0..100. */
  score: number;
  level: "low" | "medium" | "high";
  factors: ConfidenceFactor[];
}

/**
 * Heuristic aggregator (start at 50, ±1..25 per factor, clamp 0..100).
 *
 *   + window length, low CVaR, model agreement, low turnover, diversified ρ-BTC
 *   - limited-data fraction, high HHI concentration, pure-BTC proxy
 *
 * The number is a *triage signal*, not a posterior probability — used to
 * communicate "would I act on this recommendation today?" at a glance.
 */
export function computeConfidence(input: {
  windowDays: number;
  dataQuality: AssetDataQuality[];
  finalStrategy: StrategyResult;
  allStrategies: StrategyResult[];
  symbols: string[];
}): ConfidenceBreakdown {
  const { windowDays, dataQuality, finalStrategy, allStrategies, symbols } = input;
  const factors: ConfidenceFactor[] = [];
  let score = 50;

  // 1. Window length
  if (windowDays >= 1095) {
    score += 25;
    factors.push({
      label: "История",
      impact: "+",
      points: 25,
      detail: `${windowDays} дней — длинное окно покрывает несколько режимов рынка.`,
    });
  } else if (windowDays >= 365) {
    score += 15;
    factors.push({
      label: "История",
      impact: "+",
      points: 15,
      detail: `${windowDays} дней — достаточное окно.`,
    });
  } else {
    score += 5;
    factors.push({
      label: "История",
      impact: "-",
      points: 5,
      detail: `${windowDays} дней — короткое окно, оценки шумные.`,
    });
  }

  // 2. CVaR-95
  const cvar = finalStrategy.metrics.cvar95;
  if (cvar >= -0.04) {
    score += 15;
    factors.push({
      label: "CVaR-95",
      impact: "+",
      points: 15,
      detail: `${(cvar * 100).toFixed(1)}% — хвост контролируем.`,
    });
  } else if (cvar >= -0.07) {
    score += 10;
    factors.push({
      label: "CVaR-95",
      impact: "+",
      points: 10,
      detail: `${(cvar * 100).toFixed(1)}% — приемлемый хвост.`,
    });
  } else if (cvar >= -0.1) {
    score += 5;
    factors.push({
      label: "CVaR-95",
      impact: "neutral",
      points: 5,
      detail: `${(cvar * 100).toFixed(1)}% — пограничный хвост.`,
    });
  } else {
    score -= 10;
    factors.push({
      label: "CVaR-95",
      impact: "-",
      points: -10,
      detail: `${(cvar * 100).toFixed(1)}% — глубокий хвост, повышенный риск обвала.`,
    });
  }

  // 3. Limited-data fraction
  const limitedCount = dataQuality.filter(
    (d) => d.status === "limited" || d.status === "very-limited" || d.status === "no-data"
  ).length;
  const limitedFrac = dataQuality.length > 0 ? limitedCount / dataQuality.length : 0;
  if (limitedFrac > 0.5) {
    score -= 15;
    factors.push({
      label: "Data quality",
      impact: "-",
      points: -15,
      detail: `${(limitedFrac * 100).toFixed(0)}% активов с ограниченной историей.`,
    });
  } else if (limitedFrac >= 0.2) {
    score -= 10;
    factors.push({
      label: "Data quality",
      impact: "-",
      points: -10,
      detail: `${(limitedFrac * 100).toFixed(0)}% активов с ограниченной историей.`,
    });
  } else {
    score += 5;
    factors.push({
      label: "Data quality",
      impact: "+",
      points: 5,
      detail: "Большинство активов имеют полную историю.",
    });
  }

  // 4. Concentration HHI
  let hhi = 0;
  for (const w of finalStrategy.weights) hhi += w * w;
  if (hhi < 0.3) {
    score += 10;
    factors.push({
      label: "Концентрация",
      impact: "+",
      points: 10,
      detail: `HHI ${hhi.toFixed(2)} — портфель диверсифицирован.`,
    });
  } else if (hhi <= 0.5) {
    factors.push({
      label: "Концентрация",
      impact: "neutral",
      points: 0,
      detail: `HHI ${hhi.toFixed(2)} — умеренная концентрация.`,
    });
  } else {
    score -= 10;
    factors.push({
      label: "Концентрация",
      impact: "-",
      points: -10,
      detail: `HHI ${hhi.toFixed(2)} — высокая концентрация в одном-двух активах.`,
    });
  }

  // 5. Turnover
  if (finalStrategy.metrics.turnover < 0.3) {
    score += 5;
    factors.push({
      label: "Turnover",
      impact: "+",
      points: 5,
      detail: `${finalStrategy.metrics.turnover.toFixed(2)} — близко к равновесному распределению.`,
    });
  }

  // 6. Model agreement on top-3 weights (BTC, ETH, top alt by market cap defaults)
  const watch: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  let totalStd = 0;
  let counted = 0;
  for (const sym of watch) {
    const idx = symbols.indexOf(sym);
    if (idx < 0) continue;
    const ws = allStrategies.map((s) => s.weights[idx] ?? 0);
    if (ws.length < 2) continue;
    const m = ws.reduce((a, b) => a + b, 0) / ws.length;
    let v = 0;
    for (const x of ws) v += (x - m) * (x - m);
    const std = Math.sqrt(v / ws.length);
    totalStd += std;
    counted++;
  }
  const avgStd = counted > 0 ? totalStd / counted : 0;
  if (counted > 0) {
    if (avgStd < 0.1) {
      score += 15;
      factors.push({
        label: "Согласие моделей",
        impact: "+",
        points: 15,
        detail: `σ топ-3 весов ${avgStd.toFixed(2)} — модели сходятся.`,
      });
    } else if (avgStd > 0.2) {
      score -= 10;
      factors.push({
        label: "Согласие моделей",
        impact: "-",
        points: -10,
        detail: `σ топ-3 весов ${avgStd.toFixed(2)} — модели сильно расходятся.`,
      });
    } else {
      factors.push({
        label: "Согласие моделей",
        impact: "neutral",
        points: 0,
        detail: `σ топ-3 весов ${avgStd.toFixed(2)} — умеренное согласие.`,
      });
    }
  }

  // 7. BTC correlation
  const rho = finalStrategy.metrics.corrToBtc;
  if (Number.isFinite(rho)) {
    if (rho >= 0.3 && rho <= 0.7) {
      score += 5;
      factors.push({
        label: "ρ к BTC",
        impact: "+",
        points: 5,
        detail: `${rho.toFixed(2)} — нормальная диверсификация vs BTC.`,
      });
    } else if (rho > 0.85) {
      score -= 5;
      factors.push({
        label: "ρ к BTC",
        impact: "-",
        points: -5,
        detail: `${rho.toFixed(2)} — портфель почти повторяет BTC.`,
      });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: "low" | "medium" | "high" =
    score < 40 ? "low" : score < 70 ? "medium" : "high";

  return { score, level, factors };
}
