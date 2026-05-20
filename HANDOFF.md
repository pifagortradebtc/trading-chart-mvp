# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-20. **Production-ready state.** Этап 5 закрыт — добавлены NAV-экспорт в Криптофонд, unit-тесты математики, E2E через Playwright. Билд exit 0, `/portfolio` 51.8 kB / 156 kB First Load.

GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Где мы — статус «production-ready»

Кабинет аналитики Pifagor Fund (`/portfolio`) реализован как полнофункциональный Allocation Decision Engine с пятью законченными итерациями:

- ✅ **Этап 1** — Data Quality, Calmar/Ulcer/β, Modes, Rebalance Plan, Confidence
- ✅ **Этап 2** — HRP, MaxDiv, Cluster Analysis, Rotation, Model Contribution
- ✅ **Этап 3** — Watchlist, Why narrative, Momentum, Kelly, Vol Target, Walk-forward
- ✅ **Этап 4** — Liquidity Layer, Resampled Markowitz, polish
- ✅ **Этап 5** — NAV-экспорт в Криптофонд, vitest unit-suite (77 тестов), Playwright E2E (6 сценариев)

В итоге: **14 моделей**, **8 advisory модулей**, **NAV bridge**, **83 проходящих теста** (77 unit + 6 E2E).

---

## Что добавил этап 4

### Стратегии: 13 → 14

Новая стратегия `resampled` (`resampledMarkowitz.ts`) — **Michaud's Resampled Efficiency**:
- 24 bootstrap-resamples × 800 Dirichlet samples max-Sharpe = 19.2k trials/вызов
- Усредняет веса по синтетическим историям → robust MVO без QP solver
- Решает классическую «estimation-error maximization» проблему наивного Markowitz
- Deterministic (фиксированный seed)
- В worker'е ~300-500ms на 7 активов × 1095 дней

### Liquidity Layer (`liquidity.ts`)

Полная инфраструктура оценки рыночной глубины:
- **Extended PriceSeries** опциональным `volumes: number[]` (back-compat — math не задет)
- `market-data.ts` тащит base-asset volume из существующего `/api/ohlcv` (Binance уже даёт его в row[5])
- `assessLiquidity(priceSeries)` → массив `LiquidityAssessment`: 30-day mean USD volume (close × volume), tier (blue/green/yellow/red), max executable position (5% ADV)
- `basketLiquidityScore(weights, assessments)` → 0..100 aggregate
- 4 tiers:
  - **blue** ≥ $1B/день — institutional
  - **green** $100M-$1B — fund-tier
  - **yellow** $10M-$100M — retail-large
  - **red** < $10M — thin market / OTC

UI: `LiquidityCard` в Recommended Tab — таблица с per-asset tier, max ticket, basket-score.

**Integration:**
- `rotation.ts` — новое правило **`liquidity`**: red tier с weight > 5% → trim half; yellow > 15% → trim to 15%; no-data > 2% → trim half. Route в Core.
- `confidence.ts` — новый фактор **«Ликвидность»** (±10 points) — basket score меняет confidence score.

### Polish

- Pre-existing ESLint warning `react-hooks/exhaustive-deps` в `ChartHost.tsx:190` исправлен через захват `indicatorSeriesRef.current` в начале эффекта (стандартный React-паттерн).
- README обновлён: список из 14 моделей, описание новых блоков Recommended Tab.

---

## Что добавил этап 5

### NAV-экспорт в Криптофонд (`navExport.ts`)

`buildNavExport({ weights, symbols, sleeveFraction })` собирает JSON в формате `PUT /admin/portfolio/composition` Криптофонда:
- Маппит trading-chart-mvp тикеры (`BTCUSDT`) в фундовые (`BTC`)
- Drops неподдерживаемые тикеры с warning'ом (whitelist: BTC/ETH/BNB/SOL/OKB/MNT/HYPE/TON/USDT)
- Sleeve → CASH USDT row автоматически
- Renormalize до точной суммы 100% (backend tolerance ±0.01)
- Drops dust < 0.05% чтобы payload не превышал 50-item cap
- Сортировка: SPOT desc, CASH last

UI: новая кнопка **«Copy NAV»** в Recommended Tab рядом с Copy JSON и Print. Direct cross-domain POST не делаем (admin-cookie живёт на домене фонда) — operator копирует JSON и вставляет в админ-форму или вызывает curl с admin-cookie.

### Vitest unit-suite (16 файлов, 77 тестов)

Все критические math модули покрыты:
- `riskCaps.test.ts` — caps clipping, core floor, dq ceiling
- `dataQuality.test.ts` — статусные пороги (good/limited/very-limited/no-data)
- `hrp.test.ts` — HRP + Max Diversification
- `momentum.test.ts`, `kelly.test.ts`, `resampledMarkowitz.test.ts` — три новые стратегии
- `clusters.test.ts` — таксономия фонда
- `rotation.test.ts` — все 4 driver'а (dq / cluster / core-deficit / liquidity)
- `liquidity.test.ts` — tier classification, max ticket, basket score
- `confidence.test.ts` — 8 факторов
- `walkForward.test.ts` — out-of-sample HRP equity
- `watchlist.test.ts`, `volTarget.test.ts`, `modelContribution.test.ts`, `navExport.test.ts`
- `strategies.integration.test.ts` — end-to-end 14-strategy bundle

Запуск: `npm test` → ~1 секунду. Конфиг в `vitest.config.ts`.

### Playwright E2E (3 файла, 6 сценариев)

Sweet spot tests, не unit-equivalent:
- `portfolio-load.spec.ts` — shell + tab switching
- `recommended-tab.spec.ts` — все advisory блоки + Copy NAV + Recommendation Modes
- `rebalance-plan.spec.ts` — current weight input → state propagation

**Mock /api/ohlcv** (через `e2e/helpers/ohlcvMock.ts`) с детерминированной синтетикой — обходит timeout на api.binance.com (он недоступен из этой сети). Это даёт стабильный CI без зависимости от внешнего API. Cодержит per-symbol profile-ы (BTC-like, ETH-like, etc.) и `lcg` seed → реалистичные веса.

Запуск: `npm run test:e2e` → ~15 секунд при `reuseExistingServer`. Конфиг в `playwright.config.ts`, target = `localhost:3001` (старый dev на 3000 был корраптнут после долгой incremental compile сессии).

---

## Что **не сделал** и почему

| Пункт | Причина |
|---|---|
| **On-chain / Fundamental Score** | Требует external API keys (Glassnode/Coinmetrics/Token Terminal). Хардкод данных = ложь инвестору. Без проплаченного провайдера не делать. |

Это единственный пункт исходного roadmap-а, который объективно невозможен без внешнего commitment. Если будет API key — это отдельный модуль уровня `liquidity.ts`, по той же архитектуре (load on initial fetch, share via priceSeries-like state, consume via UI block).

---

## Полная карта Recommended Tab — что в каком порядке

```
PrintCoverPage (только в Print/PDF)
header (eyebrow + title + JSON copy + Print button)
─────────────────────────────────────────
1.  Confidence badge / Awaiting placeholder
2.  Vol Target advisory                          ← этап 3
3.  Why narrative                                ← этап 3
4.  Spot + Total Fund allocation donuts
5.  Cluster Exposure card                        ← этап 2
6.  Rebalance Plan (operator-input current)
7.  Rotation Suggestions (4 sources: dq / cluster / liquidity / core)
8.  Watchlist                                    ← этап 3
9.  Liquidity Layer card                         ← этап 4
10. Model Contribution                           ← этап 2
11. Backtested equity curve (in-sample static weights)
12. Walk-forward equity (HRP OOS retraining)     ← этап 3
13. "Why this allocation" 4 reason cards
14. Disclaimer
```

---

## Все 14 стратегий

| ID | Имя | Источник |
|---|---|---|
| `marketCap` | Market Cap | live CoinGecko + fallback snapshot |
| `equalWeight` | Equal Weight | trivial |
| `minVol` | Min Volatility | MC cloud |
| `maxSharpe` | Max Sharpe | MC cloud |
| `maxSortino` | Max Sortino | MC cloud |
| `riskParity` | Risk Parity (inverse-vol) | analytical |
| `blackLitterman` | Black-Litterman (view-tilt MVP) | 5k Dirichlet |
| `cvar` | CVaR-Optimal | MC cloud subsample |
| `hrp` | HRP (López de Prado 2016) | single-linkage + bisection |
| `maxDiv` | Max Diversification | 5k Dirichlet |
| `momentum` | Momentum Overlay (200d MA) | analytical |
| `kelly` | Fractional Kelly (half-Kelly haircut) | analytical |
| `resampled` | Resampled Markowitz (Michaud) | 24 × 800 bootstrap |
| `finalFund` | Final Fund Portfolio | BL → caps → CVaR defense |

---

## Все 8 advisory модулей

| Файл | Назначение |
|---|---|
| `dataQuality.ts` | history-length-based weight ceilings |
| `clusters.ts` | fund taxonomy (Core/Infra/HighBeta/Exchange/Alpha/Meme/Other) |
| `rotation.ts` | strategic trim/add tickets (4 sources) |
| `watchlist.ts` | tracked-but-not-held tickers |
| `whyTheseWeights.ts` | 5-paragraph narrative generator |
| `volTarget.ts` | cash buffer recommendation |
| `liquidity.ts` | USD-volume tier + executable ticket + basket score |
| `walkForward.ts` | HRP retraining-based OOS equity |
| `modelContribution.ts` | influence ranking by L1 distance |
| `confidence.ts` | aggregate triage score (8 factors) |

---

## Полезные команды

```powershell
cd "C:\Users\pifag\OneDrive\Тестер стратегий\trading-chart-mvp"
npm run dev                # http://localhost:3000 (auto-fallback to 3001)
npm run build              # exit 0 expected
npm test                   # vitest unit suite (~1s, 77 tests)
npm run test:coverage      # с покрытием v8
npm run test:e2e           # Playwright (~15s, 6 tests)
git log --oneline -10
```

При смене dev port:
- `npm run dev` сам подхватывает 3001 если 3000 занят
- Playwright config указывает на 3001 (см. `playwright.config.ts`)
- Если нужен реальный data flow в E2E — `unset PW_START_DEV` чтобы переиспользовать локальный dev

NAV export workflow:
1. На `/portfolio` → Recommended Tab → кнопка **Copy NAV** (рядом с Copy JSON / Print)
2. JSON copied в clipboard
3. Открыть Криптофонд админку → Composition → вставить
4. ИЛИ через curl с admin-cookie:
   ```
   curl -X PUT https://pifagor-fund.example.com/admin/portfolio/composition \
     -H "Cookie: admin_jwt=$ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d "$NAV_JSON"
   ```

---

## Архитектурные заметки

- **TLS на машине автора**: все скрипты обёрнуты в `cross-env NODE_OPTIONS="--use-system-ca"`. Запускать только через `npm run dev` / `npm run build`. Прямой вызов `cross-env` не работает — он только в `node_modules/.bin`.
- **OneDrive путь с кириллицей** → git предупреждает про CRLF, это норма.
- **Web Worker нагрузка**: `buildStrategiesBundle` делает 14 стратегий. Самая тяжёлая — Resampled Markowitz (19.2k Dirichlet) — ~300-500ms на 7 активах. UI не блокируется.
- **Walk-forward и Liquidity** считаются на main thread через `useMemo` в RecommendedTab. Walk-forward HRP — дёшево; Liquidity — простая агрегация 30 точек. Если basket → >15 активов, рассмотреть offload в воркер.
- **Cluster taxonomy** (`clusters.ts`) — single source of truth. Новый токен в Alpha — добавлять там, и он автоматически попадёт в Cluster Exposure + Rotation + Why narrative.
- **PriceSeries.volumes** — опциональное поле. Если future caller возвращает PriceSeries без volumes, Liquidity не рендерится и не влияет на confidence/rotation. Полная back-compat.

---

## Что осталось — действия для следующей сессии

Проект «закрыт» по технической линии. Что имеет смысл делать дальше — **только бизнес-задачи**:

1. **Реальная Auth + multi-tenancy** — если планируется выпуск нескольким management-партнёрам.
2. **API keys для on-chain** — если фонд хочет Glassnode/Coinmetrics. Тогда сделать `onchainScore.ts` по архитектуре `liquidity.ts`.
3. **Интеграция с реальным NAV в основном Pifagor Fund repo** (`C:/Users/pifag/OneDrive/Криптофонд/apps/frontend`) — экспорт finalFund.weights → NAV-таблица позиций.
4. **A/B-тест разных Final Fund политик на реальных деньгах** — нужен production data plane и хранилище весов по времени.

Технические backlogs:
- Lottie/анимации брендинга, если решат украшать.
- Mobile-friendly адаптация — сейчас фокус desktop research.
- E2E тесты (Playwright) для нескольких golden-path scenarios.

---

## TL;DR

Кабинет аналитики **готов к использованию в production-режиме фонда**. 14 моделей, полный risk framework, liquidity, walk-forward, model attribution. Один пропущенный пункт roadmap-а (on-chain) объективно требует external commitment — недостающего у нас сейчас.

Если возвращаешься к проекту — приноси конкретное направление: новые активы, новые провайдеры данных (on-chain), UI-полировка по фидбеку реальных аналитиков, или интеграция с другим репозиторием фонда.
