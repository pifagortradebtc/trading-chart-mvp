# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-19. Этап 2 ADE закоммичен (билд exit 0). Визуальный smoke-test пройден через dev-server (HTTP 200, без runtime ошибок).

---

## Где мы

Делаем `/portfolio` — Allocation Decision Engine для Pifagor Fund.

- ✅ Базовая страница `/portfolio` с 5 sub-tabs: Simulation / Strategies / Risk Caps & Views / Stress Test / Recommended
- ✅ Брендинг (gold, Geist Sans + IBM Plex + Instrument Serif)
- ✅ **Этап 1 ADE** — Data Quality Layer, расширенные метрики (Calmar/Ulcer/β), Recommendation Modes, Rebalance Plan, Confidence Score
- ✅ **Этап 2 ADE** — HRP + Max Diversification как 10-11 стратегии, Cluster Analysis, Rotation Suggestions, Model Contribution
- ✅ Open Questions 1-4 закрыты

Билд: `npm run build` exit 0, `/portfolio` 41.7 kB / 146 kB First Load. GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Этап 2 — что внутри

### Стратегии: 9 → 11

`hrp` и `maxDiv` добавлены в `buildStrategiesBundle()` через `hrpWeights()` и `maxDiversificationWeights()` из `hrp.ts`. Расширены:
- `strategyTypes.ts::StrategyId` union
- `strategyGlossary.ts` — описания инвестору
- Тексты «9 моделей» в landing + simulator → «11 моделей»

### Cluster Analysis (`src/lib/portfolio/clusters.ts`)

Таксономия фонда: **Core** (BTC) · **Infra** (ETH) · **High-beta L1** (SOL/TON/AVAX/ADA/DOT/ATOM/NEAR/APT/SUI/SEI/ICP/ALGO) · **Exchange** (BNB/OKB/BGB/KCS/CRO/HT/GT) · **Alpha** (HYPE/ARB/OP/JUP/STX/INJ/RNDR/TIA/PYTH/JTO/DYDX/ENA) · **Meme** (DOGE/SHIB/PEPE/WIF/BONK/FLOKI/BRETT/MOG) · **Other**.

Каждый кластер несёт soft-ceiling (advisory): Core 75%, Infra 30%, HighBeta 18%, Exchange 10%, Alpha 8%, Meme 3%, Other 5%.

`aggregateByCluster(weights, symbols)` возвращает `ClusterExposure[]` — вес, члены, overshoot.

UI: компактная stacked-bar шкала + сетка карточек с member-листом. Overshoot подсвечивается янтарём.

### Rotation Suggestions (`src/lib/portfolio/rotation.ts`)

`buildRotationSuggestions({ weights, symbols, dataQuality })` возвращает приоритезированный список `{ trim, add, reason, priority, source }`. Три драйвера:

1. **Data quality**: актив выше `maxAllowedWeight` → trim в Core. Priority: High.
2. **Cluster overshoot**: вес satellite-кластера > soft-ceiling → trim top contributor → в Core (Meme=High, остальные=Medium).
3. **Core deficit**: Core+Infra < 60% → trim heaviest non-core → в BTC. Priority: Medium.

Сортируется: High → Medium → Low, внутри по магнитуде.

UI: таблица с цветовыми тонами по source/priority.

### Model Contribution (`src/lib/portfolio/modelContribution.ts`)

`computeModelContributions({ finalWeights, allStrategies, symbols, topK })`:

- **Influence** = `1 − L1(model, final)/2` — 0..1. 100% = модель точно повторила finalFund.
- **Top effects** — top-K активов по `|model_i − final_i|`, с знаком: + значит модель проголосовала за бóльший вес.

UI: модели сортированы по influence убывающе. Прогресс-бар influence + чипы топ-эффектов.

### Open Questions — резолюция

1. **HRP/MaxDiv** → подключены как 10-11 стратегии (этап 2).
2. **Mode-apply timing** → instant-apply УЖЕ работал (`RiskCapsTab.tsx:138` вызывает `onApplyMode + onApply`). Изменений не делал.
3. **currentWeights sanity** → `MPTSimulator.tsx`: фильтр при гидрации (по `DEFAULT_ASSETS`) + sync-эффект при смене `assets` (drop тикеров, которых нет в текущей корзине).
4. **Confidence cold start** → `ConfidencePlaceholder` в `RecommendedTab.tsx`: пунктирная карточка `Awaiting calculation` с большим тире вместо score.

---

## Что было сегодня (хронология коммитов)

```
<новый коммит этапа 2>
a5d56e8  feat(portfolio): Allocation Decision Engine — этап 1 + handoff
8572fea  polish: annotations на frontier + skeleton + asset blurbs
a80bcb4  docs: README под Pifagor Fund
e2f13d3  feat(landing): полноценный landing-page
1bfcff4  feat: PDF cover-page для Recommended
299ec02  feat: backtested equity curve в Recommended
54c2cad  polish: JSON snapshot + print-стили
848bb29  polish: strategy glossary + persist active tab
41f3d83  polish: tooltips для метрик + CSV export
214e41c  polish: fund sleeves UI + dynamic CVaR copy
4342903  feat: persist policy + live market caps + CVaR threshold
```

---

## Что дальше — этап 3 (опционально)

ChatGPT-roadmap пункты, которые остались:

- **Watchlist Engine** — отдельная вкладка или раздел в Recommended: «следим, но не покупаем». Источник: статический список + per-asset cap-eligible порог. Можно начать с того, чтобы любой актив с `clusterOf=other` или `dataQuality.status="no-data"` автоматически попадал в watchlist.
- **Why these weights** — текстовый блок в Recommended. Шаблон: «Based on N assets (M with full history), Black-Litterman views (k активных), CVaR-95 defense at X%, recommended allocation is: TOP3. Drivers: cluster overshoot resolved (Y), data-quality cap on Z, model agreement σ=W on top-3.»

И отложенные (более тяжёлые):
- Robust/Resampled Markowitz (нужен численный солвер)
- Walk-forward backtest без look-ahead
- Volatility Targeting + Drawdown Control (дублирует CVaR Defense)
- Fractional Kelly (advisory)
- Momentum/Trend Overlay (нужен MA200)
- On-chain/Fundamental Score (отдельная data plane)
- Liquidity Layer (нужен volume API)

---

## Полезные команды

```powershell
# Dev
cd "C:\Users\pifag\OneDrive\Тестер стратегий\trading-chart-mvp"
npm run dev                # http://localhost:3000

# Build check
npm run build              # должно проходить с exit 0

# Git
git log --oneline -10
git status
```

---

## Архитектурные заметки

- **TLS на машине автора**: все скрипты обёрнуты в `cross-env NODE_OPTIONS="--use-system-ca"`. Запускать через `npm run dev` / `npm run build`, **не** через прямой `cross-env` (его нет в PATH глобально).
- **OneDrive путь с кириллицей** иногда даёт WARN от git «LF will be replaced by CRLF» — норма.
- **Web Worker**: математика в `src/workers/mpt.worker.ts` → `buildStrategiesBundle()`. Все новые стратегии (HRP/MaxDiv) тоже считаются там — round-trip не вырос, оба алгоритма уже были в `hrp.ts`.
- **Cluster taxonomy** живёт в `clusters.ts` — это single source of truth. Если фонд решит добавить токен в Alpha — править там, и он сразу появится в Cluster Exposure + Rotation.

---

## TL;DR для первой минуты завтра

1. Открыть этот файл.
2. `npm run dev` → `/portfolio` → проверить Recommended Tab. Должны быть видны:
   - Confidence badge (или Awaiting calculation при первом заходе)
   - 2 донат-карты (Spot / Total)
   - **Cluster exposure** — gold-цветная stacked-bar + grid карточек с overshoot
   - Rebalance Plan
   - **Rotation suggestions** — таблица «Trim from / Add to / Reason / Driver / Priority» (если есть нарушения)
   - **Model contribution** — таблица с influence-баром и чипами top effects
   - Equity curve
3. Опциональный этап 3: Watchlist + Why-these-weights текстовый блок.
