# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-20. **Production-ready state.** Этап 7 закрыт — Engine Run Journal (локальный audit-trail) + Read-only мост к Криптофонду (`Δ vs Live Fund` + Import current). Билд exit 0, `/portfolio` 56.9 kB / 162 kB First Load.

GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Где мы — статус «production-ready»

Кабинет аналитики Pifagor Fund (`/portfolio`) реализован как полнофункциональный Allocation Decision Engine с семью законченными итерациями:

- ✅ **Этап 1** — Data Quality, Calmar/Ulcer/β, Modes, Rebalance Plan, Confidence
- ✅ **Этап 2** — HRP, MaxDiv, Cluster Analysis, Rotation, Model Contribution
- ✅ **Этап 3** — Watchlist, Why narrative, Momentum, Kelly, Walk-forward
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

`buildNavExport({ weights, symbols })` собирает JSON в формате `PUT /admin/portfolio/composition` Криптофонда:
- Маппит trading-chart-mvp тикеры (`BTCUSDT`) в фундовые (`BTC`)
- Drops неподдерживаемые тикеры с warning'ом (whitelist: BTC/ETH/BNB/SOL/OKB/MNT/HYPE/TON/USDT)
- Renormalize до точной суммы 100% (backend tolerance ±0.01)
- Drops dust < 0.05% чтобы payload не превышал 50-item cap
- Сортировка: SPOT desc, CASH last

> **2026-06-12:** sleeve-логика (bot strategies + manual book → CASH row)
> полностью удалена — фонд работает 100% spot, боты и ручная торговля
> свёрнуты решением управляющего. `sleeveFraction` параметра больше нет,
> категории `BOT_TRADING`/`MANUAL_TRADING` удалены из типов
> (navExport.ts, fundBridge.ts), UI-секция «Fund sleeves» убрана из
> Risk Caps, в Recommended один donut вместо двух.

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
- `watchlist.test.ts`, `modelContribution.test.ts`, `navExport.test.ts`
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

### Cookie-session auth + security hardening

Изначально на этапе 8 был HTTP Basic Auth (browser-native dialog). Эта схема позже эволюционировала в custom cookie-session с iat-embedded HMAC tokens (см. security hardening commits a608c62, cb2ac46, a4dc863).

**Файлы**:
- [src/middleware.ts](src/middleware.ts) — cookie-session gate + CSRF check
- [src/lib/server/auth.ts](src/lib/server/auth.ts) — token format + verify
- [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts) — login + rate-limit
- [src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts) — logout + Origin check
- [src/app/login/page.tsx](src/app/login/page.tsx) — custom login form (single-field)
- [src/lib/server/safeFetch.ts](src/lib/server/safeFetch.ts) — SSRF guard для proxy routes

**Текущее поведение**:
- Если env-var `RESEARCH_PASSWORD` **задана** → middleware требует валидную cookie. Юзер вводит пароль на `/login`, получает HttpOnly cookie на 7 дней.
- Если **не задана** в проде → middleware возвращает 503 «Auth misconfigured» (fail-CLOSED).
- Если **не задана** в dev (NODE_ENV !== production) → middleware пропускает всё (локальная разработка).

**Token format**: `${iatMs}.${HMAC(password, "v2:${iatMs}")}`. iat embedded в payload → server-side TTL enforcement (7 дней), каждый login выдаёт уникальный token (защита от session-fixation).

**CSRF protection**:
- Cookie `SameSite=Lax` (не None — никаких cross-origin GET).
- Middleware проверяет `Origin` header на всех non-GET → 403 если origin не совпадает с host.
- Logout требует валидную auth-cookie + дополнительный Origin check.

**Rate-limit**: 5 попыток за 15 минут per-IP (через `x-forwarded-for`). После лимита 429 + Retry-After.

**Timing-constant**: login отвечает за ≥250ms независимо от outcome (защита от timing oracle).

**Защищены**: все страницы кроме `/`, `/login`, `/api/auth/login` + все API-routes кроме них.

**Force-logout всех**: ротировать RESEARCH_PASSWORD в Render env → все existing cookies невалидны (HMAC не сходится).

**Setup на Render**:
1. Dashboard → `trading-chart-mvp` → Environment → Add Environment Variable
2. Key: `RESEARCH_PASSWORD`, Value: random 16+ char string
3. Save → auto-redeploy ~2-5 минут
4. После redeploy любой заход на site требует пароль через `/login`

**Setup для команды**: один общий пароль, передавать через защищённый канал (1Password, Bitwarden). Не пересылать в открытом Telegram/email.

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
2.  Why narrative                                ← этап 3
3.  Spot + Total Fund allocation donuts
4.  Cluster Exposure card                        ← этап 2
5.  Rebalance Plan (operator-input current)
6.  Rotation Suggestions (4 sources: dq / cluster / liquidity / core)
7.  Watchlist                                    ← этап 3
8.  Liquidity Layer card                         ← этап 4
9.  Model Contribution                           ← этап 2
10. Backtested equity curve (in-sample static weights)
11. Walk-forward equity (HRP OOS retraining)     ← этап 3
12. "Why this allocation" 4 reason cards
13. Disclaimer
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

---
---

# Сессия 2026-05-31: Backtest UX overhaul + Composite multi-strategy

Большая итерация по `/backtest`. ~60 коммитов от `8199341` до `ce6524d`. Главное — **переход от singleton-стратегий к Composite multi-strategy** + интуитивная капитальная модель + множество визуальных fixes.

## Что добавлено / починено (по областям)

### Backtest core
- **Кастомный период бэктеста** (BacktestPage.tsx) — поля «С / По (UTC)» внутри загруженного `yearsBack`. Default `customStartDate = "2025-05-25"`. Сохраняется в snapshot.
- **Упрощённая капитальная модель** (BacktestSettings.tsx) — заменил «Торговый депозит + Сумма сетки + Баланс кошелька» на трейдерскую модель «Депозит + Плечо + Маржа на сделку + Доп. свободный баланс». Под капотом мапится в существующие `DcaBotSettings` (zero migration).
- **DCA-бот секция всегда full-width** (`lg:col-span-2`).
- **DcaGridPreview** — таблица всех ордеров + warnings (overshoot, узкая сетка, маленький TP).

### Composite multi-strategy (самая большая фича)

Вместо одного `strategyKind` — стек слотов с per-pair операторами:

- `CompositeStrategyConfig.slots: StrategySlot[]` — каждый слот: `kind` + inline settings
- `StrategySlot.joinRule: "and" | "or"` — оператор объединения с предыдущим (left-fold)
- `confirmWindowBars` — sliding window для согласования сигналов
- Engine: `combineCompositeSignals()` в `compositeSignal.ts`

**10 типов слотов:**
1. `buyforce_dca` — RO = (bid_3 − ask_8) / ask_1.5 (depth)
2. `sellforce_dca` — RO = (ask_3 − bid_8) / bid_1.5 (depth)
3. `chaik_dca` — V2_ЧайкКельт (полные настройки через `ChaikKeltSettingsForm`)
4. `bidask_spread` — bid_X% − ask_Y% raw (BidAsk из pifagor-trade-website-2)
5. `macd` — signal_cross / zero_cross / above_zero_gate
6. `rsi_threshold` — exit_zones / enter_zones / midline_cross / inside_zone
7. `ema_cross` — cross_event / above_below
8. `bollinger` — touch_band / breakout
9. `stochastic` — exit_zones / enter_zones
10. `adx_filter` — фильтр силы тренда

Все классические индикаторы имеют **signalMode** для смены триггера LONG/SHORT.

**UI:**
- **Компактная формула** в шапке «Модель бэктеста» (CompositeFormulaRow.tsx): `[#1 ▾] [И] [#2 ▾] [+ слот]`
- **Детальные настройки** в КОМПОЗИТ-секции — каждый слот цветной (8 цветов циклом), сворачивается через ⚙
- **1d depth interval** добавлен (TV resolution `"D"`)
- **BuyForce/SellForce smoothing** — SMA по N барам перед edge-detection
- **Русская локализация** всех signal modes и parameters

### Chart visualization
- **AVG/TP segments** per trade (chartDcaSegments.ts) — фиолетовая solid + эмеральд dashed
- **SL line** per trade — красная dashed `#f87171` с fallback из `t.stopLossPct + t.avgEntryPrice`
- **USDT volume в маркерах** — «#38 · 50 USDT», «DCA 2 · 75 USDT»
- **Все exit-маркеры** в session view — раньше SL/liquidation скрывались (баг)
- **Fix: 48-trade limit** для маркеров — раньше cap применялся и к segments и к markers
- **«Обновить» кнопка** на /chart → `window.location.reload()`. `consumeBacktestChartHandoff` больше не удаляет ключ

### Engine semantics
- **end_of_test не загрязняет metrics** — открытая позиция не финализируется в `trades[]`. Информация через `openPositionAtDataEnd` snapshot.
- **Hero MAX DD = max(equity DD, per-trade DD, open position DD)** — раньше только equity DD (= 0% при 100% win rate скрывало реальные просадки).

### Auto-sync + OHLCV
- **depthInterval = chart interval** автоматически (раньше ручная sync)
- **HYPE, MNT** → Bybit (раньше CoinGecko 365д лимит). **OKB** → OKX.
- **MNT в default universe**. **Donut charts** показывают 0% активы.

### UI polish
- **Header**: логотип кликабельный → `pifagor.fund`, кнопка «На фонд ↗»
- **Composite default** = ЧайкКельт (вместо BuyForce)
- **Resizable splitter** между sidebar и main (ResearchShell.tsx) — persist в localStorage
- **Убран hero**-заголовок «Пифагор DCA Research Terminal» + абзац
- **Убран checkbox** «Сохранять на сервер» + ссылка восстановления (всегда вкл по умолчанию)
- **Убран dev-абзац** про `/api/ohlcv` и persistent disk
- **Кнопка «Загрузить OHLCV»** в 3 раза меньше
- **Окно подтверждения default = 1** (вместо 5)
- **Серые поля** «Первый ордер %» (только SHORT), «Сумма сетки» (только LONG)

## Lessons — bug patterns + как НЕ допустить

### 1. UI-side фильтрация важных данных «для красоты» ❌

**Симптом:** Маркеры выхода SL/liquidation скрывались в multi-trade view (`showNonTpExit = trades.length === 1`). Юзер видел entries без exits и думал «бот не закрывает сделки».

**Как избежать:** Не фильтруй критические события (SL, ликвидация, large negative PnL) ради «не загромождать». Если данных много — оптимизируй рендеринг (lightweight-charts handle тысячи markers), не скрывай. Скрытие OK только для **true noise** (дубликаты, zero-impact events).

### 2. Single cap для разных concerns ❌

**Симптом:** `MAX_TRADES_FOR_DCA_SEGMENTS = 48` использовался для тяжёлых line-series И для дешёвых markers одновременно. Юзер видел маркеры только для последних 48 из 176 сделок.

**Как избежать:** Разделяй cap-ы по типу нагрузки. Heavy = cap, light = no cap. Имей separate refs / memos: `sessionTradesForDcaSegments` (capped) vs `sessionTrades` (full).

### 3. Расширение схемы данных без fallback breaks old snapshots ❌

**Симптом:** Добавил `stopLossPrice` в `DcaGridRow` — SL-линия только на новых runs. Старые snapshots в localStorage / на disk без этого поля → SL-линия пропадала.

**Как избежать:** При добавлении нового поля для visualization — ВСЕГДА fallback в render code. Не полагайся на «юзер re-runs after deploy». Конкретно здесь: добавил `TradeRecord.stopLossPct` + computed fallback в chartDcaSegments.

### 4. Type-only changes без runtime grep ❌

**Симптом:** Добавил `"1d"` в `DepthInterval` type, но забыл обновить hardcoded UI hint «`ТФ графика ∈ {1m, 5m, 15m, 1h}`». Юзер видел противоречие.

**Как избежать:** При расширении enum-подобного типа — `grep` по всем хардкод-упоминаниям: `"1m"|"5m"|...`, optgroup labels, error messages, комментарии. **Идеал:** строить список значений из единственного источника правды (типа `DEPTH_INTERVALS` const) и подставлять в строки `{INTERVALS.join("/")}`.

### 5. Engine semantics «открытая позиция = закрытая by end of test» ❌

**Симптом:** Открытая на конце данных позиция финализировалась как сделка с unrealized loss → попадала в metrics → «100% win rate» стратегия показывала −21% return и худшую сделку −4447 USDT.

**Как избежать:** Различай **реализованный PnL** (только закрытые: TP/SL/signal/liq) vs **unrealized snapshot** (open position info — отдельная структура, НЕ в `trades[]`). Metrics ТОЛЬКО по closed trades. Если есть данные о висящей позиции — `openPositionAtDataEnd` + UI блок «Позиция», не массив trades.

### 6. Capital model с overlapping semantic полями ❌

**Симптом:** Юзер не понимал разницу между «Торговый депозит», «Сумма сетки», «Баланс кошелька». 3 финансовых поля с пересекающейся семантикой = несколько сообщений на разбор.

**Как избежать:** Capital model должна map на **mental model реального трейдера**: «У меня X депо, плечо Y, на сделку лочу маржу Z». Internal storage может быть сложнее (с denominators), но **UI = как думает оператор**. Деплой translator-функции: `setDeposit(d)`, `setLeverage(l)` мапят в legacy-поля автоматически.

### 7. Composite mode без визуального flow ❌

**Симптом:** Сначала сделал композит как вертикальный стек слотов с операторами между ними. Юзер попросил **горизонтальную формулу в шапке** — для быстрого визуального понимания структуры.

**Как избежать:** Когда у фичи есть «структурная схема» (формула, граф, pipeline) — дай юзеру **компактное визуальное представление сверху**, даже если детали ниже. Двухслойный UI: compact summary + expanded details. Shared state синхронизирует слои.

### 8. Hardcoded UI strings разбросаны по большим файлам ❌

**Симптом:** Translation на русский потребовала прохода по 50+ строкам в CompositeStrategySection.tsx (~1100 строк). Easy miss spots.

**Как избежать:** Выделяй copy в **central registry** для больших UI с repeated patterns (например `signalModeLabels.ts`). Импортируй из неё. Тогда переводы / rebranding = один правка.

### 9. Старые комментарии становятся неверными после изменений ❌

**Симптом:** Изменил allowedDepthIntervals на включение «1d», но комментарий выше всё ещё писал «Если ТФ графика 4h/1d/3d/1w — depth для него не существует».

**Как избежать:** При изменении логики — **проверяй комментарии рядом**. Лучше: не дублируй информацию из кода в комментарии (DRY); комментируй только «почему», не «что».

## Где лежит код composite (для быстрой навигации)

| Что | Файл |
|-----|------|
| Slot kinds + settings types | `src/lib/backtest/types.ts` |
| Default values | `src/lib/backtest/backtestDefaults.ts` |
| Classic indicators (MACD/RSI/EMA/Bollinger/Stoch/ADX) | `src/lib/backtest/classicIndicatorSignals.ts` |
| BuyForce/SellForce/BidAsk computation | `src/lib/backtest/buyForceSellForceSignals.ts` |
| Composite combiner (left-fold) | `src/lib/backtest/compositeSignal.ts` |
| Engine integration | `src/lib/backtest/backtestEngine.ts` (lines ~525-565) |
| Compact formula UI | `src/components/backtest/CompositeFormulaRow.tsx` |
| Detail panels UI | `src/components/backtest/CompositeStrategySection.tsx` |
| Reusable ChaikKelt form | `src/components/backtest/ChaikKeltSettingsForm.tsx` |
| Chart segments (entry/DCA/AVG/TP/SL) | `src/lib/backtest/chartDcaSegments.ts` |
| Chart markers | `src/lib/backtest/chartTradeMarkers.ts` |
| Resizable splitter | `src/components/research/ResearchShell.tsx` |
| Depth-data fetch | `src/app/api/bidask/route.ts` + `src/lib/backtest/depthData.ts` |

## Состояние

- **158 тестов** проходят (`npm test`)
- **Build clean** (`npm run build` — no warnings)
- **Render auto-deploys** on push to master
- Деплой live: `https://trading-chart-mvp.onrender.com`

## Возможные follow-ups (по убыванию ценности)

1. **Диагностический popup** «сколько сигналов сгенерировал каждый слот за период» — самый частый user-pain в composite: «почему мало сделок?» Юзер не понимает какой слот фильтрует.
2. **Сравнительные бэктесты** — UI для запуска N variants одной стратегии параллельно с табличкой (winrate / sharpe / DD).
3. **Walk-forward для composite** — сейчас только для chaik_dca.
4. **Optimization grid для composite параметров** — TP/overlap уже есть, добавить signal modes и smoothing.
5. **Auto-fallback OHLCV chain** — если Binance 404, попробовать Bybit → OKX → CoinGecko (сейчас только explicit overrides).
6. **«Открытая позиция» блок в hero** — current unrealized PnL / max DD / distance to TP визуально prominent.
7. **Compress slot card** в composite — MACD/RSI можно сделать однострочными, экономия экрана.

---

# Сессия 2026-06-02: Cross-margin liquidation fix + NumberInput + capital model simplification

Коммиты: `6298a44` → `78e4adb` → `d90ca57` (3 коммита, ветка `master`, запушены).
Все тесты 158/158 проходят, билд clean, ESLint clean.

## Главный баг, который чинили

**Cross-margin молча пропускал ликвидацию.** Пользователь крутил бэктест с 80–90× плечом, видел DD 15.17%, но «Ликвидаций: 0». В `backtestEngine.ts` для long и short × conservative и aggressive стояла защёлка:

```ts
if (
  dca.marginMode !== "cross" &&
  Number.isFinite(liqP) &&
  low <= liqP
) {
  return "liquidation";
}
```

То есть **cross-режим вообще не проверял ликвидацию**. Default `marginMode = "cross"`, поэтому с любым плечом «Ликвидаций: 0» был фиктивный — движок просто пропускал проверку.

**Фикс:** убрал `dca.marginMode !== "cross"` в 4 местах (long/short × conservative/aggressive). Теперь `effectiveLiquidationLeverage` отрабатывает в обоих режимах. При `wallet == deposit` (наш дефолт) формула совпадает с isolated → liq drop ≈ `1/L` = ~1.25% при L=80.

Также:
- `chartOverlayLevels.ts`: убран `if (tr.marginMode === "cross") return false` — красная линия ликвидации теперь рисуется и в cross.
- `metrics.ts`: tooltip «при кроссе ликвидация отключена» → «триггерится в обоих режимах».

## Что ещё сделали

### Упрощённая модель капитала (BacktestSettings)
Раньше: «Депозит / Маржа на сделку / Доп. свободный баланс / Плечо» — 4 пересекающихся поля.

Сейчас: 3 поля, как думает трейдер.
```
Баланс кошелька USDT  [10000]
Плечо                  [4]
Сумма в торговле USDT  [2500]   ≈ 25% кошелька
```

- `walletBalanceUsdt` синхронизируется с `startDepositUsdt` 1:1 (поле «Доп. свободный баланс» убрано из UI).
- `gridTotalNotionalUsdt = «Сумма в торговле» × плечо` — face value позиции, распределяется по DCA-сетке.
- В info-плашке под полем теперь показывается «Номинал позиции (full grid)» и «Свободно на счёте после full grid».

### NumberInput компонент — фикс «0 не стирается»

Создан `src/components/backtest/NumberInput.tsx` (~95 строк). Локальный `draft: string` state. Поле можно очистить — родительский value остаётся последним валидным, наружу пробрасываются только корректные конечные числа.

Visual: пустой draft → красная рамка (`!border-rose-500 !ring-1 !ring-rose-500/40`) + tooltip «Введи число — без значения бэктест не запустится».

Применён ко **всем 78 number-полям бэктеста**:
- `BacktestSettings.tsx` — 25 полей (капитал, DCA, pivot21, pifagor_alts)
- `ChaikKeltSettingsForm.tsx` — 20 полей (полностью переписан)
- `CompositeStrategySection.tsx` — 30 полей (все слоты)
- `BacktestPage.tsx` — 1 поле (Глубина лет)

Оставлен нативный `<input type="number">` только для `stopLossPct` — он nullable и уже работает корректно (пустое = null = «выключить SL»).

### Баннеры предупреждений о ликвидации (BacktestResults)

3 уровня прямо над hero-карточками:

1. **🔴 Красный** — `m.liquidations > 0`: «БЫЛО N ликвидаций — стратегия сожгла депозит. Снизь плечо / сузь сетку / включи SL.»
2. **🟠 Оранжевый** — settings опасны (high-leverage + cross + margin ≈ wallet) И DD > approx liq distance, но ликвидаций = 0: «Сомнительный результат. Перепроверь Сумма в торговле / Плечо / Тип маржи. Если настройки честные — обнови страницу для перезапуска worker.»
3. **⚪ Серый info** — превентивно при опасной конфиг (`marginMode=cross AND margin ≥ 0.95 wallet AND leverage > 20`), когда ликвидаций ещё нет и DD ещё не подобрался к опасной зоне: «Высокий риск ликвидации: liq drop ≈ 1.2% при таких настройках.»

В `metrics.ts`: tooltip карточки «Ликвидаций» обновлён — теперь не вводит в заблуждение.

### Чип «Ликвидаций» в hero pill-strip (ResearchShell)

После пробитого фикса движка пользователь попросил видеть ликвидации **сразу в верхней полосе** (рядом с MAX DD / Сделок), а не только в карточках ниже.

В `heroStats` добавлено поле `liquidations?: number`. После `<StatChip label="Сделок">` теперь рендерится:
```
<StatChip label="Ликвидаций" value={String(...)} warn={liquidations > 0} />
```
- `0` → нейтральный серый («всё чисто»)
- `> 0` → красный rose (как у MAX DD)

## Lessons — bug patterns + как НЕ допустить

### 10. Сторожевая защёлка в движке, противоречащая UI-дефолту ❌

**Симптом:** Default `marginMode = "cross"` (UI), но движок при `cross` всегда пропускал liquidation check. Итог: «0 ликвидаций» при любом плече, юзер думает «стратегия идеальна», а на проде в момент будет ликвидация на любой существенной просадке.

**Как избежать:** Если в движке стоит «пропустить проверку Y когда X», и X — это значение default'а, ты эффективно отключил Y для 100% юзеров. Спроси себя: «что эта защёлка предполагает делать ВМЕСТО Y?» Если ответ — «ничего» (как тут — wallet-level check не реализован), значит защёлка должна быть `false` либо проверка должна работать всегда. Документируй ограничения подхода в комментарии, а не молча отключай. **Test случай для будущего: бэктест с L=80 на любой паре с >2% DD → ассерт `liquidations > 0`.**

### 11. `npx tsc --noEmit` ≠ `next lint` ≠ Render build ❌

**Симптом:** Локально `tsc` чисто, всё push, Render-билд падает: `react/no-unescaped-entities` на строке «`worker'а`» в JSX-тексте. 22 минуты от пуша до facepalm.

**Как избежать:** Перед `git push` ВСЕГДА `npx next lint --dir src`. `tsc --noEmit` ловит только типы. Lint ловит React-конвенции (`no-unescaped-entities`, `no-children-prop`, etc), `import/order`, `no-unused-vars` и десятки других правил, которые Render-билд проверяет в составе `next build`. **Memorize: tsc ≠ lint, lint ≠ build, build ≠ runtime.** В пре-пуш чек-листе теперь: `npx tsc --noEmit && npx next lint --dir src && npm test`. Лучше — git pre-push hook.

### 12. Apostrophe в русском JSX-тексте — ловушка ESLint ❌

**Симптом:** `«перезапустить worker'а»` в JSX-тексте → `react/no-unescaped-entities`. Латинский апостроф (`U+0027`) запрещён правилом ESLint в JSX text.

**Как избежать:** В русском тексте часто пишем «worker'а / API'а / Linux'а» как заимствование. В JSX это нужно либо escape (`&apos;` / `&#39;`), либо перефразировать («worker» / «API» / «Linux» без падежа). Я выбрал перефразирование — читается чище и не ломает rendering. **Правило для следующих сессий: если видишь латинский апостроф в JSX-тексте — перефразируй сразу.**

### 13. Controlled `<input type="number" value={n} onChange={Number()}>` — антипаттерн UX ❌

**Симптом:** `value` всегда число → при backspace последней цифры `e.target.value` = `""`, `Number("")` = `0`, состояние = `0`, отрисовка = `"0"`. Юзер не может стереть `0`, чтобы заменить на `250` — приходится писать «0250» и удалять `0` спереди.

**Как избежать:** Для controlled number-инпутов **всегда** держи local string draft state в инпуте. Парси в число только когда draft валиден. Пустой draft = валидное визуальное состояние (с красной рамкой / aria-invalid), родительский value НЕ меняется. **Универсальный pattern лежит в `NumberInput.tsx` — используй его для любых новых number-полей в проекте.**

### 14. Сохраняй разнесённый по multiple файлам тип данных согласованным ❌

**Симптом:** Добавил `liquidations?: number` в `heroStats` type в `ResearchShell.tsx`, но в `BacktestPage.tsx` забыл пробросить (`liquidations: metrics?.liquidations`). UI рендерил всё кроме чипа.

**Как избежать:** Когда расширяешь shared type (props одного компонента, контракт hook, etc) — **сразу же иди к каждому call-site и обнови**. Use TypeScript flag `noUncheckedIndexedAccess` или strict null checks, чтобы TS подсказал упущенный optional field. Альтернатива — required field с дефолтом 0 (компилятор обязал бы пропатчить call-site).

## Где лежит код сегодняшней работы (для быстрой навигации)

| Что | Файл | Ключевые строки |
|-----|------|-----------------|
| Liquidation engine fix (long + short) | `src/lib/backtest/backtestEngine.ts` | 190–224, 280–296 |
| Liq line в чарте (без cross-guard) | `src/lib/backtest/chartOverlayLevels.ts` | 10–18 |
| Liquidation tooltip (no «отключена в cross») | `src/lib/backtest/metrics.ts` | поиск по `Ликвидаций` |
| 3-level warning banners | `src/components/backtest/BacktestResults.tsx` | 95–145 |
| Settings проброс в BacktestResults | `src/components/backtest/BacktestPage.tsx` | поиск по `<BacktestResults` |
| Simplified capital UI | `src/components/backtest/BacktestSettings.tsx` | 214–266 (setters), 485–595 (UI) |
| NumberInput (новый компонент) | `src/components/backtest/NumberInput.tsx` | весь файл |
| Ликвидаций chip в hero | `src/components/research/ResearchShell.tsx` | 99–110 (тип), 198–206 (рендер) |
| heroStats.liquidations пробрасывает | `src/components/backtest/BacktestPage.tsx` | 263–275 (useMemo heroStats) |

## Что осталось не сделано (открытые вопросы для следующих сессий)

### Подтверждённые баги, отложенные

1. **`effectiveLiquidationLeverage` имеет инвертированное направление** — в `risk.ts:13–22` формула `L * (wallet/deposit)` для cross. На самом деле больше wallet → liq должна быть ДАЛЬШЕ от entry (больше буфер), а не ближе. Сейчас не критично, потому что UI держит `wallet == deposit` всегда → ratio=1 → формула возвращает L. **Будет важно**, если когда-нибудь вернём «Доп. свободный баланс» в UI. Правильная формула: `L_eff = (margin/wallet) * L` либо `liq drop = wallet/cumNotional`.

2. **Wallet-level liquidation для cross не моделируется** — сейчас per-position approx. Корректный cross: после каждого бара суммировать `unrealized_PnL` всех открытых позиций + cash и проверять не ушёл ли total equity ниже maintenance margin. Сейчас в проде только одна позиция за раз → разница пренебрежимая, но при multi-position режиме (если когда-то добавим) понадобится.

### UX-улучшения, которые user захочет дальше

3. **Run-блок при пустых полях** — сейчас `NumberInput` показывает красную рамку, но Run кнопка не дизейблится. Юзер просил «бэктест не идёт» при пустом — для этого нужно lift validity state из NumberInput'ов вверх (через context или callback). См. `NumberInput.tsx`, новый prop `onValidityChange` + Set<inputId> в BacktestPage.

4. **Portfolio mode тоже должен показать «Ликвидаций» в pill** — сейчас `portfolioAltsTypes.ts` не содержит `liquidations` в summary. Добавить `totalLiquidations: number` в `PortfolioBacktestSummary`, агрегировать по символам, пробросить в heroStats.

5. **Карточка «RISK ESTIMATE: Liquidation at ~X.XX% drop from avg»** — превентивный info для юзера ДО запуска бэктеста. Считать в `BacktestSettings.tsx`: `1/L - mmRate` × `(cumNotional/G)`. Показать рядом с «Сумма в торговле».

6. **Settings drift detection** — после фикса движка старые snapshots в localStorage всё ещё могут показывать «0 ликвидаций» (worker подсасывает worker.js bundle, который кеширует прошлый код). Текущий workaround в orange banner: «обнови страницу». Можно сделать: при чтении snapshot, версию движка bump'нуть и invalidate старые результаты.

### Структурные улучшения

7. **Pre-push hook**: `npx tsc --noEmit && npx next lint --dir src && npm test` в `.husky/pre-push`. Чтобы commit fail'ы типа `no-unescaped-entities` не доходили до Render.

8. **Унифицировать number-inputs** в остальных частях приложения (`/portfolio`, `/chart` если есть) — pattern `NumberInput.tsx` готов, можно переиспользовать.

## Состояние на конец сессии

- **Build clean** (`npx tsc --noEmit` + `npx next lint --dir src` + `npm test`)
- **158 тестов** проходят (`npm test`)
- **3 коммита запушены**: `6298a44`, `78e4adb`, `d90ca57`. Render должен задеплоить последний.
- **HANDOFF.md обновлён** этой секцией (сессия 2026-06-02).

После перерыва: открой `/backtest`, обнови (F5), и проверь что бэктест с L=80 теперь триггерит ликвидации (красный баннер + чип в hero). Если нет — см. follow-up #6 (snapshot drift).

## Хотфикс после паузы: сигнал на последнем баре

Коммит на этот фикс пушнут отдельно. Бага: в `backtestEngine.ts` LONG signal с `market_next_open` имел guard `if (i + 1 < n)`, и при сигнале на самом последнем баре `pendingLongOpen` молча не выставлялся → сделка никогда не открывалась → юзер видел «всё ок» в TradingView (индикатор BuyForce active), но в бэктестере ни маркера, ни висящей позиции. Аналогичный guard в SHORT (`pendingSignalBar`).

**Фикс** (`backtestEngine.ts` ~line 999–1054): после главного loop, перед обработкой `openPositionAtDataEnd`, проверяем `resolveDirection(n-1, longActive, shortActive, settings)`. Если сигнал был — открываем по close последнего бара (close ≈ open next bar, которой у нас нет). Сделка попадает в `openPositionAtDataEnd` и в `trades[]` с `isOpenPosition=true`, на чарте появляется entry/AVG/TP/grid.

Не трогаем `limit_first` pending — там бот ЖДЁТ когда low дойдёт до firstRow.price, рисовать «висящую сделку» при close > firstRow.price = вводить в заблуждение.

### Lesson #15. Guard `if (i + 1 < n)` без обработки else == silent drop ❌

**Симптом:** В loop'е `if (i + 1 < n) pendingX = ...` без else-ветки — сигнал на ПОСЛЕДНЕМ баре исчезает в /dev/null. Тесты этот случай не покрывали (фикстуры не имеют сигнал на последней свече). Юзер обнаруживает только в live данных, где «сейчас» = «последний бар».

**Как избежать:** Любая edge-condition `last bar / first bar / empty data` должна иметь явную обработку **или явный комментарий** «здесь сознательно ничего не делаем, потому что ...». Без этого через год никто не вспомнит что бывает edge case. Идеал: unit-тест с сигналом на последней свече фикстуры, который проверяет что `openPositionAtDataEnd` не null.

## Состояние на самый конец (включая хотфикс)

- 4 коммита сегодня: `6298a44`, `78e4adb`, `d90ca57`, `2f3836b` + хотфикс.
- HANDOFF.md = 715+ строк, эта секция последняя.

---

# Сессия 2026-06-04 (продолжение): диагностика «почему нет сделки» → корневой OHLCV-баг

Коммиты этой сессии (8 шт, ветка `master`):
```
d592a7d  fix(backtest): резолв сигнала на последнем баре → openPositionAtDataEnd
df8262a  chore(backtest): обновить дефолты под актуальный пресет юзера
d425ed1  feat(backtest): диагностический баннер «последний бар»
6febadc  feat(chart): диагностика последнего бара в заголовке /chart
cf36d34  feat(backtest): различать «VPS лагает» vs «RO не cross-апнулся»
f4eb0cc  ui(backtest): полишь баннер «VPS лагает» — склонение баров
f5a4a6d  feat(backtest): показать RO последних 10 баров прямо в баннере
3d950e5  fix(ohlcv): tighten daily fwd tolerance 7d→1.5d + force=1 на сервер ⭐
```

## Главный баг сессии (объяснил месяцы недоумения)

Юзер днями подряд жаловался: «в TradingView вижу сигнал BuyForce на 2 июня, а в моём бэктестере сделка не открывается». Я долго гонял по разным гипотезам:
1. Edge-cross vs sustained signal — не оно.
2. VPS depth-лаг — частично, но не корень.
3. Зависание dataset на 31 мая — да, но почему?

**Корень оказался в `src/lib/backtest/ohlcvUtils.ts:52`:**

```ts
export function ohlcvForwardGapToleranceMs(barMs: number): number {
  const week = 7 * 24 * 3600 * 1000;
  if (barMs >= 24 * 3600_000) return week;  // ← для 1d — целая неделя
  ...
}

// usage in /api/ohlcv:
needFwd: lastMs < endMs - fwdTol,
```

На daily-ТФ сервер считал кеш «свежим» пока gap до `endMs` < 7 дней. Юзер последний раз грузил OHLCV 31 мая. Сегодня 4 июня. Gap = 4 дня. **4 < 7 → `needFwd = false` → сервер не догоняет данные с биржи** → возвращает старый ряд без июньских свечей.

Галочка «Полная перезагрузка» в UI чистила только клиентский IndexedDB-кеш, но НЕ доходила до сервера — серверный disk-cache продолжал отдавать stale ряд.

### Фикс (commit `3d950e5`)

1. `ohlcvUtils.ts` — tolerance с 7 дней до **1.5 дня** для daily. Хватает чтобы пережить незакрытую сегодняшнюю свечу (Binance не отдаёт её до 00:00 UTC), но любой реальный gap триггерит forward-fetch.

2. `/api/ohlcv` — новый query param `?force=1`. Когда установлен — игнорируется disk-cache, идёт fresh fetch с биржи.

3. `dataProvider.ts` `loadOhlcvViaServerApi` — пробрасывает `force=1` когда `opts.forceRefresh === true`. Теперь галочка «Полная перезагрузка» работает end-to-end.

## Что ещё сделали (по убыванию ценности)

### Last-bar signal resolve (commit `d592a7d`)

Engine при сигнале на последнем баре раньше молча терял его (см. Lesson #15). Сейчас после главного loop проверяется `resolveDirection(n-1)`; если есть сигнал — open position по close последнего бара, falls into `openPositionAtDataEnd`. На чарте появляется entry/AVG/TP/grid висящей позиции.

### Диагностический баннер «последний бар» (commits `d425ed1`, `6febadc`, `cf36d34`, `f4eb0cc`, `f5a4a6d`)

Прогрессивно обогащённый баннер над hero-карточками. Финальный вид:

- 🟢 `opened: true` → «сигнал LONG сработал, открыта висящая позиция»
- 🟧 `reason: trade_already_open` → «сделка уже открыта, новый сигнал не нужен»
- 🟧 `reason: margin_blocked` → «сигнал был, но маржи не хватило»
- 🟧 `reason: no_signal + depthCoverage.depthForLastCandle: false` → **«VPS лагает: collector отстаёт от Binance OHLCV на N баров»**
- ⚪ `reason: no_signal + depth есть` → «RO не cross-апнулся (sustained / cooldown)»

Плюс в обоих ⚪/🟧 рендерится **мини-таблица RO последних 10 баров** (емералд > 0, амбер < 0, роуз NaN). Это объективный источник — юзер сам сверяет с TV.

И всё это пробрасывается в /chart через `BacktestChartHandoff.lastBarSignal` → суффикс в `metaTitle`.

### Default settings update (commit `df8262a`)

Под рабочий пресет юзера:
- symbol: ETHUSDT → BTCUSDT, interval: 15m → 1d
- composite default slot: chaik_dca → buyforce_dca
- DCA: ordersCount 7→3, priceOverlapPct 25→6, priceFactor 1.6→4, volumeFactor 1.2→0.5, takeProfitPct 0.6→2
- `gridTotalNotionalUsdt: 40_000` (= margin 10k × leverage 4)
- depthInterval: 1h → 1d

## Lessons — bug patterns + как НЕ допустить

### Lesson #16. Server-side cache с large fwd-tolerance ≠ невидимый прозрачный кеш ❌ ⭐

**Симптом:** Сервер `/api/ohlcv` имеет disk-cache с tolerance 7 дней для daily. Кеш отстаёт на 4 дня — сервер думает «всё ок, не пойду на биржу». Клиент не имеет способа форсировать обновление: галочка «Полная перезагрузка» сбрасывает только client IndexedDB. Юзер видит старые свечи в бэктесте и НЕ понимает почему.

**Как избежать:**
1. **Tolerance ≤ 1 бар + safety**. Для 1d это max ~1.5 дня (одна незакрытая сегодняшняя свеча). Для intraday — несколько баров. Не «недели».
2. **Force-refresh должен идти end-to-end**: UI флаг → client → query param → server → skip cache. Любое звено что молча проигнорирует force-параметр = invisible bug.
3. **Серверный кеш должен СВЕТИТЬ свою свежесть**. Отдавать в ответе `cachedAt: ISO` + `fwdGapDays: N` — клиент мог бы показать «cache cтарше N дней» и предложить refresh.
4. **Логи на сервере: «cache hit, gap=Nd, returning N candles»** — без этого диагностика занимает часы.

**Идеал:** ETag/Last-Modified headers на /api/ohlcv. Если клиент шлёт If-None-Match — сервер мгновенно отвечает 304 либо полноценный 200 с обновлёнными данными.

### Lesson #17. «Покажи юзеру что движок РЕАЛЬНО посчитал» побеждает 5 раундов «давай я объясню логику»

**Симптом:** 6+ сообщений я объяснял юзеру edge-cross логику BuyForce. Юзер не верил («ну на TV же видно cross!»). Каждый раз мы крутились вокруг одной точки.

**Что сработало:** Показал в баннере **сырые RO-значения за последние 10 баров** (commit `f5a4a6d`). Юзер увидел собственными глазами: RO с 22.05 по 30.05 всё отрицательный (от −2.3 к −0.2), 31.05 NaN. Стало однозначно понятно что в `dataset` нет июня вообще → дальше я нашёл root cause (cache 7d tolerance).

**Как избежать:** Когда юзер не верит логике — **выдавай данные**. RO значения, signal flags, cooldown timers, depth gap counts — всё что движок реально считает. UI с numbers вместо текстовых объяснений = на порядок более убедительно. Принцип: «show, don't tell» применим и к багам.

### Lesson #18. «Я не понимаю» от юзера = виновата UI, не юзер

**Симптом:** Когда юзер пишет «я не понял» / «ничего не работает» / «сделай по-другому» — НЕ надо повторять то же объяснение в других словах. Это значит UI не сообщил то что нужно (или сообщил не там где смотрят).

**Как избежать:** Каждый «не понял» от юзера = todo на улучшение UI:
- баннер не там где смотрят → перенести / продублировать
- терминология не интуитивна → переименовать
- скрытая инфо → вывести в hover/tooltip
- данные есть в коде но не в UI → пробросить

Лучшее что я могу — повышать качество UI с каждым раундом, не упорствовать в текстовой переписке.

## Где лежит код сессии (быстрая навигация)

| Что | Файл | Ключевые места |
|-----|------|----------------|
| OHLCV cache fix | `src/lib/backtest/ohlcvUtils.ts` | `ohlcvForwardGapToleranceMs` line 52 |
| `?force=1` на /api/ohlcv | `src/app/api/ohlcv/route.ts` | params parsing + `handleStableV2` signature |
| force в client | `src/lib/backtest/dataProvider.ts` | `loadOhlcvViaServerApi` query params |
| Last-bar signal resolve | `src/lib/backtest/backtestEngine.ts` | ~line 1005 (post-loop block) |
| `BacktestResult.lastBarSignal` | `src/lib/backtest/types.ts` | line 377-410 |
| Диагностический баннер | `src/components/backtest/BacktestResults.tsx` | line 158-260 |
| Чип «Ликвидаций» | `src/components/research/ResearchShell.tsx` | StatChip rendering |
| Handoff с lastBarSignal | `src/lib/chart/openBacktestChart.ts` | `lastBarSuffix` + `buildSessionChartHandoff` |
| Default settings | `src/lib/backtest/backtestDefaults.ts` | `DEFAULT_DCA`, `DEFAULT_COMPOSITE`, `DEFAULT_BACKTEST` |
| Default symbol/TF | `src/components/backtest/BacktestPage.tsx` | useState инициализация |

## Открытые вопросы для следующей сессии

1. **Depth-lag для VPS** — отдельный вопрос. Pifagor VPS live-collector отстаёт на 1 бар. Можно ли ускорить? Cron-job, polling, push? Это вопрос к VPS-сервису, не к бэктестеру.
2. **Magnitude-режим для BuyForce/SellForce** — юзер хотел чтобы спайки RO (а не только zero-crosses) триггерили сделки. Сейчас это решается поднятием `zeroLevel`, но это не очевидно. Можно добавить отдельный `signalMode: "edge_cross" | "spike_above"` с явным параметром `spikeThreshold`.
3. **Run-блок при пустых полях** — NumberInput красит border красным, но Run не дизейблится. Lift validity state через context.
4. **Portfolio mode + Ликвидаций chip** — `portfolioAltsTypes.ts` пока не агрегирует liquidations. Добавить.
5. **Pre-push hook** — `npx tsc --noEmit && npx next lint --dir src && npm test`. Чтобы fail типа `no-unescaped-entities` не доходил до Render.
6. **ETag/Last-Modified для /api/ohlcv** — см. Lesson #16. Сейчас работает, но грубо.

## Состояние на конец сессии

- **8 коммитов** запушены: `d592a7d` → `3d950e5`.
- **158/158 tests** passing, `tsc --noEmit` clean, `next lint --dir src` clean.
- Render автоматически задеплоит `3d950e5` (force-refresh OHLCV + tightened tolerance).
- HANDOFF.md обновлён этой секцией.

**Главное на завтра:** если юзер опять видит stale-данные — проверь сначала `/api/ohlcv` server-cache (не только client-IndexedDB). Сразу спроси «галочка Полная перезагрузка стоит?» — это финальный test для cache-related issues.
