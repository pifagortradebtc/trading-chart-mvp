/**
 * Rule-based «интерпретация» результатов без ML — для UX-панели.
 */

import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { AdvancedResearchMetrics } from "./advancedMetrics";

export interface InterpretationItem {
  severity: "info" | "warning" | "danger" | "success";
  title: string;
  detail: string;
}

export function buildInterpretation(
  m: MetricsSummary,
  adv: AdvancedResearchMetrics | null,
): InterpretationItem[] {
  const items: InterpretationItem[] = [];

  if (m.maxEquityDrawdownPct > 50) {
    items.push({
      severity: "danger",
      title: "Экстремальная просадка по эквити",
      detail:
        "Просадка свыше 50% недопустима для большинства реальных счётов. Рассмотрите снижение плеча, увеличение price overlap или меньший размер первого ордера.",
    });
  } else if (m.maxEquityDrawdownPct > 35) {
    items.push({
      severity: "warning",
      title: "Высокая просадка",
      detail:
        "Стратегия переживает глубокие просадки. Оцените запас капитала и допустимый риск перед live.",
    });
  }

  if (m.liquidations > 0) {
    items.push({
      severity: "danger",
      title: "Были ликвидации",
      detail:
        "На истории зафиксированы ликвидации — такой набор параметров нельзя считать безопасным без доработки сетки или плеча.",
    });
  }

  if (m.profitFactor !== Infinity && m.profitFactor < 1.2 && m.trades >= 10) {
    items.push({
      severity: "warning",
      title: "Слабое преимущество",
      detail:
        "Profit factor ниже 1.2 при достаточном числе сделок указывает на хрупкое преимущество; результаты могут быстро деградировать на других участках.",
    });
  }

  if (adv?.sharpeRatio != null && adv.sharpeRatio < 0.5 && m.trades >= 15) {
    items.push({
      severity: "info",
      title: "Низкий Sharpe (оценка)",
      detail:
        "Доходность слабо компенсирует волатильность эквити. Имеет смысл сравнить с Buy & Hold и другими базовыми стратегиями.",
    });
  }

  if (m.winRatePct > 0 && m.winRatePct < 35 && m.trades >= 20) {
    items.push({
      severity: "info",
      title: "Низкий win rate",
      detail:
        "Стратегия может быть прибыльной за счёт редких крупных выигрышей — проверьте распределение PnL и worst trade.",
    });
  }

  if (m.totalReturnPct > 0 && m.maxEquityDrawdownPct < 25 && m.liquidations === 0) {
    items.push({
      severity: "success",
      title: "Баланс доходности и просадки",
      detail:
        "На текущей выборке просадка умеренная и без ликвидаций — продолжите проверку на walk-forward и стресс-сценариях.",
    });
  }

  return items;
}
