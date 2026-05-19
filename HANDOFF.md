# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-19. **Этап 3 закоммичен — план roadmap-а закрыт.** Билд exit 0, `/portfolio` 47.5 kB / 152 kB First Load. GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Где мы — статус «MVP завершён»

Кабинет аналитики Pifagor Fund (`/portfolio`) — полнофункциональный Allocation Decision Engine. Все три этапа реализованы:

- ✅ **Этап 1** — Data Quality Layer, Calmar/Ulcer/β метрики, Recommendation Modes, Rebalance Plan, Confidence Score
- ✅ **Этап 2** — HRP, Max Diversification, Cluster Analysis, Rotation Suggestions, Model Contribution
- ✅ **Этап 3** — Watchlist, Why-these-weights narrative, Momentum Overlay, Fractional Kelly, Volatility Targeting, Walk-forward equity

В сумме: **13 моделей построения портфеля**, 5 sub-tabs, persistence, exports (CSV/JSON/PDF), live market caps, web-worker математика.

---

## Что добавил этап 3

### Стратегии: 11 → 13

`momentum` и `kelly` подключены в `buildStrategiesBundle()`:
- **Momentum Overlay** (`momentum.ts`) — `w_i ∝ mc_i · exp(λ · log(P_t / P_{t-200d}))`. Time-series momentum в кросс-секции (Moskowitz et al. 2012). λ=1.5. Активы с историей <200 дней получают momentum=0 (нейтрально, без look-ahead).
- **Fractional Kelly** (`kelly.ts`) — `raw_i = max(0, μ_i)/σ_i²` (annualized), нормализуем + смешиваем 50/50 с equal-weight как haircut. Защищает от классической Kelly-чувствительности к ошибкам в μ.

### Watchlist Engine (`watchlist.ts`)

`buildWatchlist({ weights, symbols, dataQuality })` возвращает приоритетный список:
1. **no-data** — статус `no-data` из dataQuality
2. **uncategorized** — кластер `other` в таксономии
3. **effectively-zero** — модели дали <0.2%
4. **honorary** — fund-tracked тикеры вне корзины (ARB, OP, AVAX, DOGE)

UI: `WatchlistCard` — grid карточек с цветовым кодом по reason.

### Why-these-weights narrative (`whyTheseWeights.ts`)

`buildWhyNarrative({...})` генерирует 5 параграфов с подстановкой реальных фактов: корзина, модели и согласие, views/risk caps/CVaR, кластерная структура, confidence. Чистый текст, без LLM.

UI: `WhyNarrativeCard` — сразу под Confidence + Vol Target.

### Volatility Targeting (`volTarget.ts`)

Target σ p.a. = 25%. Если actual выше — рекомендует cash buffer = `1 − target/actual`. Три уровня: `ok` / `stretched` / `exceeded` с разными border-tone.

UI: `VolTargetCard` — три тайла (Target / Actual / Cash buffer) + одна строка совета.

### Walk-forward equity (`walkForward.ts`)

`walkForwardHRPEquity(priceSeries, trainWindow=365, step=30)`:
- На каждом шаге t: HRP обучается на `[t-365, t)` → веса применяются к OOS на `[t, t+30)`
- Конкатенация дневных лог-доходностей в одну equity-кривую
- Метрики OOS: total return, max drawdown, realized σ p.a.

Почему HRP: parameter-free, дешёвый retrain, robust risk-only baseline. **Никакого look-ahead**.

UI: `WalkForwardSection` — отдельная карточка под main equity curve, с собственным plotly-графиком (синяя линия, серебристый тон чтобы отличать от gold finalFund).

---

## Что осталось как future-work

Из ChatGPT-roadmap-а сознательно **не делал** — каждый пункт требует архитектурного обсуждения:

| Пункт | Почему пропущен |
|---|---|
| **Robust/Resampled Markowitz** | Требует QP-solver. Существующий 50k Monte-Carlo cloud в `mpt.ts` уже даёт похожую устойчивость через Dirichlet-сэмплинг. ROI добавления Resampled Markowitz без solver-а маргинальный. |
| **On-chain / Fundamental Score** | Нужна отдельная data plane (Glassnode/Coinmetrics/Token Terminal). Новый API key, провайдер, формат данных, кэш — отдельный мини-спринт. |
| **Liquidity Layer** | Нужна интеграция volume endpoint Binance. Технически возможно (у нас уже Binance OHLCV), но требует normalization (volume в USD против BTC-denominated), фильтра по avg-daily-volume, новой метрики "executability". Отдельный спринт. |

Если решишь делать — стартовать стоит с **Liquidity Layer** (волюмы у нас уже есть, надо только подтянуть). On-chain даст наибольший edge, но дороже всех.

---

## Стек этапа 3 — файлы

### Новые модули
- `src/lib/portfolio/momentum.ts` — Momentum Overlay
- `src/lib/portfolio/kelly.ts` — Fractional Kelly
- `src/lib/portfolio/watchlist.ts` — Watchlist Engine
- `src/lib/portfolio/whyTheseWeights.ts` — нарратив-генератор
- `src/lib/portfolio/volTarget.ts` — Vol Target advisory
- `src/lib/portfolio/walkForward.ts` — walk-forward equity

### Изменённые модули
- `strategyTypes.ts` — расширен `StrategyId` (+momentum, +kelly)
- `strategies.ts` — два новых entry в `buildStrategiesBundle`
- `strategyGlossary.ts` — glossary для двух новых
- `RecommendedTab.tsx` — 5 новых компонентов (Why, Vol, Watchlist, WalkForward, +mods)
- `MPTSimulator.tsx` — проброс `views` в RecommendedTab
- `StrategiesTab.tsx`, `app/page.tsx` — обновлены тексты «11 → 13 моделей»

---

## Все sub-tabs `/portfolio` — что внутри

| Tab | Что показывает |
|---|---|
| Simulation | Frontier-облако, KeyStat карточки, портфельная таблица, PinnedPortfolios |
| Strategies | Grid 13 моделей + comparison-таблица с Calmar/Ulcer/β-BTC и CSV export |
| Risk Caps & Views | Pill-кнопки Conservative/Balanced/Aggressive · per-asset caps · BL views table · CVaR-defense slider · sleeves |
| Stress Test | Сценарные шоки на per-symbol returns |
| **Recommended** | Confidence → **Vol Target** → **Why narrative** → 2 donuts → Cluster exposure → Rebalance plan → Rotation → **Watchlist** → Model contribution → Equity curve → **Walk-forward equity** → Reason cards |

Bold = новое в этапе 3.

---

## Полезные команды

```powershell
cd "C:\Users\pifag\OneDrive\Тестер стратегий\trading-chart-mvp"
npm run dev                # http://localhost:3000
npm run build              # exit 0 expected
git log --oneline -10
```

---

## Архитектурные заметки

- **TLS на машине автора**: все скрипты обёрнуты в `cross-env NODE_OPTIONS="--use-system-ca"`. Запускать только через `npm run dev` / `npm run build`. Прямой вызов `cross-env` не работает — он только в `node_modules/.bin`.
- **OneDrive путь с кириллицей** → git предупреждает про CRLF, это норма.
- **Web Worker нагрузка**: `buildStrategiesBundle` теперь делает 13 стратегий. Каждая ≤ 5k Dirichlet samples (BL/CVaR/MaxDiv) или O(n³) clustering (HRP). На 7 активах работает <500ms в воркере, UI не блокируется.
- **Walk-forward в RecommendedTab** считается **на main thread** через `useMemo` (HRP-only, дешёвый). Если активы → больше 15, рассмотреть offload в воркер.
- **Cluster taxonomy** (`clusters.ts`) — single source of truth. Новый токен в Alpha — добавлять там, и он автоматически попадёт в Cluster Exposure + Rotation + Why narrative.

---

## TL;DR

Проект «закрыт» по плану. Можно подключать к публикации (если ещё не) и переходить к маркетинговой/бизнес-стороне:
- README + landing уже под Pifagor Fund брендом
- PDF/JSON exports — продакшен-готово
- Все 13 моделей валидированы через билд + dev smoke
- Future-work задокументирован выше — Liquidity → On-chain → Resampled Markowitz, в порядке стоимость/ценность

Если будет следующая сессия — приноси конкретное направление: либо новые активы в баскет, либо подключение к external data (on-chain, liquidity), либо UI-улучшения по фидбеку реальных пользователей.
