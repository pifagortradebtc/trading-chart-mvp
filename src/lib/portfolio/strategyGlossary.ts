/**
 * Investor-facing explanations of each portfolio-construction strategy.
 * Used as `title=` tooltips on strategy names — keeps the surface clean
 * but gives a non-specialist a one-paragraph plain-language explanation
 * on hover.
 */
import type { StrategyId } from "./strategyTypes";

export const STRATEGY_GLOSSARY: Record<StrategyId, string> = {
  marketCap:
    "Market Cap Weighted: доля каждого актива пропорциональна его рыночной капитализации. Базовый пассивный benchmark — отражает то, как рынок сам взвешивает активы.",
  equalWeight:
    "Equal Weight: каждый актив получает одинаковую долю (1/N). Простой наивный benchmark; в крипте часто рискован, потому что мелким альтам достаётся столько же, сколько BTC.",
  minVol:
    "Minimum Volatility: подбирает веса так, чтобы общая годовая волатильность портфеля была минимальной с учётом корреляций между активами.",
  maxSharpe:
    "Max Sharpe: классическая Markowitz/MVO-оптимизация — лучший компромисс между доходностью и общим риском (volatility).",
  maxSortino:
    "Max Sortino: похоже на Max Sharpe, но в знаменателе только downside-волатильность. Рост ценой не штрафует — лучше отражает реальное восприятие риска инвестором.",
  riskParity:
    "Risk Parity: каждый актив вносит одинаковый риск-вклад в портфель. В крипте лучше Equal Weight, потому что волатильные альты автоматически получают меньший вес.",
  blackLitterman:
    "Black-Litterman: берёт рыночный портфель (market-cap) как базу и аккуратно накладывает «взгляды управляющего» — например, BTC/ETH ядро с высокой уверенностью, альты с ограниченной долей. Стабильнее чистого Markowitz, который часто даёт экстремальные перекосы.",
  cvar:
    "CVaR-Optimal: ищет веса, минимизирующие хвостовой риск — среднюю потерю в 5% худших дней. Не оптимизируется по доходности, только по защите от обвалов.",
  hrp:
    "HRP (Hierarchical Risk Parity, López de Prado 2016): строит дерево кластеров по корреляции активов и распределяет бюджет рекурсивно между ветвями. Стабильнее, чем Markowitz: не требует инверсии плохо обусловленной ковариационной матрицы.",
  maxDiv:
    "Max Diversification (Choueifaty & Coignard): максимизирует «коэффициент диверсификации» DR — отношение взвешенной волатильности к фактической волатильности портфеля. Высокий DR значит, что компоненты движутся независимо друг от друга.",
  momentum:
    "Momentum Overlay: берёт market-cap базу и наклоняет её через exp(λ · log-return за 200 дней). Активы с положительным трендом получают больше веса, с отрицательным — меньше. Time-series momentum (Moskowitz et al. 2012).",
  kelly:
    "Fractional Kelly: классический «доля капитала на ставку» — w_i пропорционально μ/σ². Half-Kelly (0.5×) защищает от ошибок в оценке μ, которые в крипте велики. Финал — 50/50 микс с equal-weight как haircut.",
  resampled:
    "Resampled Markowitz (Michaud, 1998): бутстрап-усреднение классического MVO. Многократно сэмплируем «синтетические» истории, на каждой ищем max-Sharpe веса, усредняем. Сглаживает классическую «estimation-error maximization» MVO без QP-солвера.",
  finalFund:
    "Final Fund Portfolio: рекомендованная модель фонда. Black-Litterman база → жёсткие risk caps → защита от хвоста по CVaR. Не одна формула, а комбинация ограничений и взглядов фонда.",
};

export function strategyTooltip(id: string): string | undefined {
  return STRATEGY_GLOSSARY[id as StrategyId];
}
