/**
 * Plain-language tooltips for portfolio metrics. The investor-facing audience
 * does not necessarily know what Sortino or CVaR mean — short hints attached
 * to column headers and stat-tiles via the `title=` attribute carry the load.
 *
 * Keys mirror the labels we render in the UI (case-insensitive lookup at the
 * call site if needed). Keep each entry to one short sentence in Russian.
 */
export const METRIC_TOOLTIPS: Record<string, string> = {
  return:
    "Ожидаемая годовая доходность портфеля по историческим дневным returns.",
  expectedReturn:
    "Ожидаемая годовая доходность портфеля по историческим дневным returns.",
  vol: "Годовая волатильность портфеля — стандартное отклонение доходностей.",
  volatility:
    "Годовая волатильность портфеля — стандартное отклонение доходностей.",
  sharpe:
    "Sharpe = (доходность − rf) / волатильность. Сколько доходности приходится на единицу общего риска.",
  sortino:
    "Sortino = (доходность − rf) / downside-σ. Как Sharpe, но в знаменателе только просадки — рост ценой не штрафуется.",
  maxDrawdown:
    "Максимальная историческая просадка equity-кривой портфеля от пика к минимуму.",
  "max dd":
    "Максимальная историческая просадка equity-кривой портфеля от пика к минимуму.",
  cvar95:
    "Conditional VaR на дневных returns: среднее значение худших 5% дней. Хвостовой риск.",
  "cvar 95%":
    "Conditional VaR на дневных returns: среднее значение худших 5% дней. Хвостовой риск.",
  cvar99:
    "Conditional VaR на 1%: среднее значение самых катастрофических дней.",
  "cvar 99%":
    "Conditional VaR на 1%: среднее значение самых катастрофических дней.",
  corrToBtc:
    "Pearson-корреляция дневных returns портфеля с BTC. 1 = движется как BTC, 0 = независимо, −1 = противоположно.",
  "ρ btc":
    "Pearson-корреляция дневных returns портфеля с BTC. 1 = движется как BTC, 0 = независимо, −1 = противоположно.",
  turnover:
    "L1-расстояние весов от equal-weight benchmark — насколько модель отходит от пассивного равновеса.",
  btc: "Доля BTC в этой стратегии.",
  eth: "Доля ETH в этой стратегии.",
  alts: "Суммарная доля альтов (всё, кроме BTC/ETH/SOL/BNB/XRP/HYPE/TON/OKB).",
};

/** Short helper for case-insensitive lookup. */
export function metricTooltip(label: string): string | undefined {
  return METRIC_TOOLTIPS[label.toLowerCase()];
}
