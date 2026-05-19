import type { AssetDataQuality } from "./dataQuality";
import type { StrategyResult, ViewInput } from "./strategyTypes";
import type { ClusterExposure } from "./clusters";
import { prettySymbol } from "./format";

/**
 * Human-readable narrative for the final allocation.
 *
 * Pulls fact-snapshots from the current state of strategies + views + caps and
 * stitches them into 5 short paragraphs (basket / models / risk / clusters /
 * confidence). Pure presentation — no new math.
 */

export interface WhyTheseWeightsArgs {
  finalStrategy: StrategyResult;
  allStrategies: StrategyResult[];
  symbols: string[];
  dataQuality: AssetDataQuality[];
  views: ViewInput[];
  cvarDefenseThreshold: number;
  windowDays: number;
  clusterExposures: ClusterExposure[];
  confidence: { score: number; level: "low" | "medium" | "high" } | null;
}

export interface WhyParagraph {
  heading: string;
  body: string;
}

export function buildWhyNarrative(args: WhyTheseWeightsArgs): WhyParagraph[] {
  const {
    finalStrategy,
    allStrategies,
    symbols,
    dataQuality,
    views,
    cvarDefenseThreshold,
    windowDays,
    clusterExposures,
    confidence,
  } = args;

  const fullHistory = dataQuality.filter((d) => d.status === "good").length;
  const limited = dataQuality.filter(
    (d) => d.status === "limited" || d.status === "very-limited"
  ).length;
  const noData = dataQuality.filter((d) => d.status === "no-data").length;

  const top3 = finalStrategy.weights
    .map((w, i) => ({ symbol: symbols[i] ?? `#${i}`, weight: w }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => `${prettySymbol(r.symbol)} ${(r.weight * 100).toFixed(0)}%`)
    .join(", ");

  const activeViews = views.filter((v) => v.confidence > 0.05);
  const avgConf =
    activeViews.length > 0
      ? activeViews.reduce((s, v) => s + v.confidence, 0) / activeViews.length
      : 0;

  // Cluster snapshot — top 3 non-empty buckets.
  const clusterPhrase = clusterExposures
    .filter((c) => c.weight > 0.01)
    .slice(0, 4)
    .map((c) => `${c.cluster.label} ${(c.weight * 100).toFixed(0)}%`)
    .join(" · ");

  // Model agreement on the final asset list — compare BL / HRP / MaxDiv weights vs final.
  const watchIds = ["blackLitterman", "hrp", "maxDiv", "riskParity"] as const;
  const agreedFractions: number[] = [];
  for (const wid of watchIds) {
    const s = allStrategies.find((x) => x.id === wid);
    if (!s) continue;
    let l1 = 0;
    for (let i = 0; i < finalStrategy.weights.length; i++) {
      l1 += Math.abs(s.weights[i] - finalStrategy.weights[i]);
    }
    agreedFractions.push(1 - Math.min(1, l1 / 2));
  }
  const avgAgreement =
    agreedFractions.length > 0
      ? agreedFractions.reduce((a, b) => a + b, 0) / agreedFractions.length
      : 0;

  const cvarPct = (finalStrategy.metrics.cvar95 * 100).toFixed(1);
  const cvarDefPct = (cvarDefenseThreshold * 100).toFixed(1);

  return [
    {
      heading: "Корзина",
      body: `Окно: ${windowDays} торговых дней по ${symbols.length} активам. Полную историю (≥365 дней) имеют ${fullHistory} из ${symbols.length}; ${limited} с лимитированной (auto-cap 2-5%); ${noData} полностью исключены до накопления данных.`,
    },
    {
      heading: "Модели и веса",
      body: `Final Fund построен через Black-Litterman prior + risk caps + CVaR-защиту. Топ-3 ядра: ${top3}. Согласие моделей (BL / HRP / MaxDiv / Risk Parity) к финалу: ${(avgAgreement * 100).toFixed(0)}% — выше значит несколько независимых семей пришли к одной аллокации.`,
    },
    {
      heading: "Views и риск-каркас",
      body:
        activeViews.length > 0
          ? `Активных Black-Litterman views: ${activeViews.length} со средней уверенностью ${(avgConf * 100).toFixed(0)}%. CVaR-95 финала ${cvarPct}%/день (триггер защиты при ${cvarDefPct}%/день). Жёсткие caps + agg-rules применены поверх — нарушений ${finalStrategy.warning ? "обнаружено" : "не обнаружено"}.`
          : `Без active views — BL ведёт себя как market-cap prior. CVaR-95 финала ${cvarPct}%/день (триггер защиты при ${cvarDefPct}%/день). Добавьте views в Risk Caps & Views, чтобы наложить взгляды управляющего.`,
    },
    {
      heading: "Кластерное распределение",
      body: clusterPhrase
        ? `Структура портфеля: ${clusterPhrase}. Если кластер превышает soft-ceiling — это видно в блоке Cluster exposure выше; rotation-тикеты предложены ниже.`
        : `Кластерная структура не определилась — таксономия фонда не покрывает активы. Используйте Watchlist для уточнения.`,
    },
    {
      heading: "Confidence",
      body: confidence
        ? `Свод сигнал — ${confidence.score}/100 (${confidence.level}). Опирается на длину окна, контроль хвоста, data-quality, концентрацию, согласие моделей и ρ к BTC. Это triage-индикатор «стоит ли действовать сегодня», не posterior.`
        : `Confidence ещё не рассчитан — он появится после первого worker round-trip.`,
    },
  ];
}
