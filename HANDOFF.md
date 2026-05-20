# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-20. **Production-ready state.** Этап 7 закрыт — Engine Run Journal (локальный audit-trail) + Read-only мост к Криптофонду (`Δ vs Live Fund` + Import current). Билд exit 0, `/portfolio` 56.9 kB / 162 kB First Load.

GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Где мы — статус «production-ready»

Кабинет аналитики Pifagor Fund (`/portfolio`) реализован как полнофункциональный Allocation Decision Engine с семью законченными итерациями:

- ✅ **Этап 1** — Data Quality, Calmar/Ulcer/β, Modes, Rebalance Plan, Confidence
- ✅ **Этап 2** — HRP, MaxDiv, Cluster Analysis, Rotation, Model Contribution
- ✅ **Этап 3** — Watchlist, Why narrative, Momentum, Kelly, Vol Target, Walk-forward
- ✅ **Этап 4** — Liquidity Layer, Resampled Markowitz, polish
- ✅ **Этап 5** — NAV-экспорт в Криптофонд, vitest unit-suite (77 тестов), Playwright E2E (6 сценариев)
- ✅ **Этап 6** — Multi-source OHLCV (Binance + OKX + CoinGecko), MNT в universe, alignSeries guard, 26 новых тестов
- ✅ **Этап 7** — Engine Run Journal + Read-only Fund Bridge (Δ vs Live Fund + Import current weights), 32 новых теста

В итоге: **14 моделей**, **8 advisory модулей**, **NAV bridge**, **3 OHLCV-источника**, **Read-only Fund bridge**, **Engine journal**, **141 проходящий тест** (135 unit + 6 E2E).

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

## Что добавил этап 6

### Multi-source OHLCV

Проблема: универс фонда (BTC/ETH/SOL/BNB/HYPE/TON/OKB/MNT) частично не торгуется на Binance Spot — **OKB живёт на OKX**, **HYPE (Hyperliquid)** не листится на Binance, агрегатор — CoinGecko. Когда такие активы попадают в `/api/ohlcv?symbol=OKBUSDT`, Binance отдаёт пустоту, актив выкидывается с misleading-сообщением «limited data».

Решение — авто-маршрутизация по тикеру в [route.ts](src/app/api/ohlcv/route.ts):

| Тикер | Источник | Реализация |
|---|---|---|
| OKBUSDT | OKX (`/api/v5/market/history-candles`) | [okxKlines.ts](src/lib/server/okxKlines.ts) |
| HYPEUSDT | CoinGecko (`/api/v3/coins/hyperliquid/market_chart`) | [coingeckoHistory.ts](src/lib/server/coingeckoHistory.ts) |
| Остальное | Binance Spot (как раньше) | [binanceKlines.ts](src/lib/server/binanceKlines.ts) |

Router: [ohlcvSource.ts](src/lib/server/ohlcvSource.ts) — single source of truth, маппинг через `pickOhlcvSource(symbol)`. Кеш на диск разделён по источнику через `sourceFilenamePrefix()` — Binance-кеши лежат как `v2_*.json`, OKX как `v2_okx_*.json`, CoinGecko как `v2_coingecko_*.json`. Старые Binance-кеши не пересекаются с новыми источниками.

CoinGecko синтезирует OHLC из daily-closes: `open = prev_close`, `high = max(open, close)`, `low = min(open, close)` — это компромисс (H/L под-репортятся), но фонд работает на close-to-close returns, влияния на математику нет. Volume конвертируется из USD → base-asset units (`vol_usd / close`), чтобы [liquidity.ts](src/lib/portfolio/liquidity.ts) (`close * volume`) реконструировал USD volume корректно.

### MNT в universe (cluster: exchange)

Добавлен Mantle:
- [clusters.ts](src/lib/portfolio/clusters.ts) — `MNTUSDT` в `exchange` (исторически BitDAO/Bybit-связан, counterparty к платформе)
- [AssetSelector.tsx](src/components/portfolio/AssetSelector.tsx) — quick-pick с blurb
- [marketCaps.ts](src/lib/portfolio/marketCaps.ts) — snapshot 2.5B USD
- [defaultViews.ts](src/lib/portfolio/defaultViews.ts) — BL view +25%, conf 0.35, max 3%
- [marketcaps/route.ts](src/app/api/marketcaps/route.ts) — CoinGecko id `mantle`
- E2E mock — профиль (startPrice 0.8, drift 0.05, daily vol 4.5%)

MNT на Binance Spot есть (листинг 2023, ≥1000 дней истории), идёт через дефолтный Binance branch.

### alignSeries hardening: `prefilterByHistoryLength`

Архитектурный нюанс: `alignSeries` берёт **пересечение** timestamps. Если короткий актив проходит фильтр >30 свечей, он обрезает всех остальных до своей длины — BTC с 1000д становится `limited` (max 5%). Это spurious downgrade.

Новая функция [prefilterByHistoryLength](src/lib/portfolio/market-data.ts) выбрасывает активы, которые короче в 2 раза от максимального И короче абсолютного floor (90д), ПЕРЕД alignSeries. Если все активы коротки в одном порядке — никого не выкидывает (dataQuality сам поставит cap). Если все исчезают (pathological case) — возвращает оригинал.

В [MPTSimulator](src/components/portfolio/MPTSimulator.tsx) добавлен новый state `pendingSymbols` и баннер «В watchlist (мало истории для участия в портфеле): X (200д из 1000д у длиннейшего)». Текст старого warning'а сменён с misleading «limited data» на честное «Не удалось загрузить котировки: ...».

### Тесты (26 новых, всего 109)

- [ohlcvSource.test.ts](src/lib/server/__tests__/ohlcvSource.test.ts) — 6 тестов: routing OKB/HYPE/MNT, case-insensitivity, filename prefix back-compat
- [okxKlines.test.ts](src/lib/server/__tests__/okxKlines.test.ts) — 7 тестов: instId mapping, парсинг ответа, реверс newest-first, error path, pagination stop
- [coingeckoHistory.test.ts](src/lib/server/__tests__/coingeckoHistory.test.ts) — 6 тестов: id mapping, OHLC synthesis, intraday → start-of-UTC-day collapse, USD→base volume conversion, error handling
- [marketData.test.ts](src/lib/portfolio/__tests__/marketData.test.ts) — 7 тестов: prefilter behavior under uniform/mixed/pathological inputs

Все 109 проходят (`npm test && npm run test:e2e`).

---

## Что добавил этап 8

### HTTP Basic Auth — пароль на весь сайт

Этап 8 закрывает пробел в безопасности: до этого `/portfolio` был доступен любому без аутентификации. Теперь — единый пароль на весь сайт через Next.js middleware.

**Файл**: [src/middleware.ts](src/middleware.ts)

**Поведение**:
- Если env-var `RESEARCH_PASSWORD` **задана** → middleware требует HTTP Basic Auth. Браузер показывает native dialog «введите пароль» при первом заходе. Кешируется до закрытия вкладки.
- Если **не задана** → middleware пропускает всё (для локальной разработки без overhead'а).

**Защищены**: все страницы (`/`, `/portfolio`, `/backtest`, `/chart`) + все API-routes (`/api/ohlcv`, `/api/engine-runs`, `/api/fund/composition`, и т.д.).

**НЕ защищены**: `_next/static/*`, `_next/image/*`, `favicon.ico`, `fonts/*`, `images/*`, `public/*` — иначе браузер не сможет загрузить ассеты для 401-страницы.

**Безопасность**:
- Constant-time string compare (защита от timing attacks).
- Single-password setup (имя пользователя игнорируется) — для команды 3-5 человек проще общий пароль, чем per-user accounts.

**Setup на Render**:
1. Dashboard → `trading-chart-mvp` → Environment → Add Environment Variable
2. Key: `RESEARCH_PASSWORD`, Value: твой пароль
3. Save → auto-redeploy ~2 минуты
4. После redeploy любой заход на сайт требует пароль

**Setup для команды**: один общий пароль, передавать через защищённый канал (1Password, Bitwarden, и т.д.). Не пересылать в открытом Telegram/email.

**Migration path к per-user accounts** (если когда-нибудь понадобится): NextAuth.js или интеграция с Telegram OIDC Криптофонда. Сейчас single-password — это not over-engineered MVP, легко мигрировать.

---

## Что добавил этап 7

### Engine Run Journal — локальный audit-trail

Каждый расчёт engine получает детерминированный `paramsHash` (SHA-256 над canonicalized JSON параметров: assets/caps/views/mode/cvar/rf/sims/historyDays). Snapshot записывается:

- **localStorage** — мгновенный, основа правды для UI: до 50 записей
- **server disk** `.cache-disk/engine-runs/<id>.json` — durable, до 200 записей; fire-and-forget POST не блокирует clipboard

Запись происходит **автоматически** при нажатии Copy NAV в Recommended Tab (поле `publishedAt` помечается timestamp'ом).

UI — отдельный sub-tab **Journal** (рядом с Recommended):
- Таблица последних 100 runs (local + server merge, local wins для edited notes)
- Per-row: date / mode badge / published badge / hash / confidence / top-5 weights
- Inline-редактирование note (до 500 символов)
- **Compare two runs** — diff таблица «before/after/Δpp» по каждому символу

Файлы:
- [engineRuns.ts](src/lib/portfolio/engineRuns.ts) — core (hash, recordRun, updateRunNote, diffWeights)
- [api/engine-runs/route.ts](src/app/api/engine-runs/route.ts) — POST/GET
- [api/engine-runs/[id]/route.ts](src/app/api/engine-runs/[id]/route.ts) — PATCH (note/publishedAt)
- [tabs/JournalTab.tsx](src/components/portfolio/tabs/JournalTab.tsx) — UI

### Read-only Fund Bridge

Research-tool и фонд работают отдельно (architecturally correct — operator-mediated через Copy NAV). Этап 7 добавляет **read-only** связи без нарушения отдельности:

- `GET /api/portfolio/public` Криптофонда → проксим через [api/fund/composition/route.ts](src/app/api/fund/composition/route.ts), кешируем in-memory 60 сек
- Если `PIFAGOR_FUND_API_URL` env не задан — server отдаёт 503, клиент graceful скрывает блок (back-compat для локальной разработки без фонда)

UI — новый блок **«Δ vs Live Fund»** в Recommended Tab (между Cluster Exposure и Rebalance Plan):
- Таблица target vs live + Δpp + action (BUY/SELL/HOLD, band ±1pp)
- Кнопка **Refresh** — повторный GET с инвалидацией кеша
- Кнопка **Import current** — копирует live composition фонда в `currentWeights` state Rebalance Plan'а (замена ручного ввода)
- Mapping bare→exchange ticker через `exchangeSymbolFromBare()` (reverse от navExport SYMBOL_MAP)

Файлы:
- [fundBridge.ts](src/lib/portfolio/fundBridge.ts) — fetcher + useLiveFundComposition hook + deltaVsLive + ticker mapping
- [api/fund/composition/route.ts](src/app/api/fund/composition/route.ts) — server proxy
- В [RecommendedTab.tsx](src/components/portfolio/tabs/RecommendedTab.tsx) — компонент FundBridgeCard

### Архитектурное решение: отдельные платформы

Research (trading-chart-mvp) и Fund (Криптофонд) — два независимых деплоя:

```
Research → operator-mediated → Fund
(read-only) → JSON через буфер → (writer)
              + Δ vs Live Fund (read-only)
              + Engine Run Journal (local-only)
```

Engine **никогда** не пишет напрямую в фонд: «operator-as-gate» защищает от багов в research-tool, попадающих в реальный NAV. Все write-операции идут через ручное подтверждение оператора.

### Тесты (32 новых, всего 141)

- [engineRuns.test.ts](src/lib/portfolio/__tests__/engineRuns.test.ts) — 16 тестов: canonicalize (порядок ключей, nesting), computeParamsHash (детерминизм, sensitivity), diffWeights (union, sort, missing), localStorage round-trip
- [fundBridge.test.ts](src/lib/portfolio/__tests__/fundBridge.test.ts) — 16 тестов: exchangeSymbolFromBare (mapping + fallback), deltaVsLive (BUY/SELL/HOLD, sort, union, null live), fetchLiveFundComposition (mocked fetch, error paths, filtering)

E2E расширен: проверка 6-го sub-tab (Journal) в `portfolio-load.spec.ts`.

---

## Что **не сделал** и почему

| Пункт | Причина |
|---|---|
| **On-chain / Fundamental Score** | Требует external API keys (Glassnode/Coinmetrics/Token Terminal). Хардкод данных = ложь инвестору. Без проплаченного провайдера не делать. |
| **Bayesian shrinkage для коротких активов** | После multi-source у всех 8 целевых тикеров `good` история. Понадобится только при добавлении свежего листинга, где история <365д. Архитектурный паттерн: cov/μ priors из cluster median, posterior update через sample-данные. Отложено до этапа 7. |

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
npm test                   # vitest unit suite (~1s, 135 tests)
npm run test:coverage      # с покрытием v8
PW_START_DEV=1 npm run test:e2e   # Playwright (~20s with managed dev server)
# Если уже запущен `npm run dev -- --port 3001` — просто `npm run test:e2e`
git log --oneline -10
```

### Env vars (опциональные)

```
PIFAGOR_FUND_API_URL=https://pifagor.fund   # для Δ vs Live Fund блока; без него блок скрыт
PERSISTENT_DISK_ROOT=/data                  # для prod (Render); локально → ./.cache-disk
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
