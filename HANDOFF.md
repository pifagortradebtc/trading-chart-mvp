# Handoff — Pifagor Fund · Кабинет аналитики

**Дата сохранения**: 2026-05-19, вечер. Пользователь идёт спать; завтра возвращаемся к этой точке.

---

## Где мы

Делаем `/portfolio` — Allocation Decision Engine для Pifagor Fund. На сегодня:

- ✅ Базовая страница `/portfolio` с 5 sub-tabs: Simulation / Strategies / Risk Caps & Views / Stress Test / Recommended
- ✅ 9 моделей построения портфеля + tooltips + CSV/JSON exports + Print/PDF cover
- ✅ Equity curve в Recommended, landing на `/`, обновлённый README
- ✅ Брендинг Pifagor Fund (gold-палитра, Geist Sans + IBM Plex + Instrument Serif)
- 🔄 **Этап 1 Allocation Decision Engine закоммичен, но визуально мной не проверен** — нужна проверка в браузере утром

Последний коммит этапа 1 идёт сразу за этим HANDOFF.md. GitHub: `pifagortradebtc/trading-chart-mvp`, ветка `master`.

---

## Что было сегодня (хронология коммитов)

```
8572fea  polish: annotations на frontier + skeleton + asset blurbs
a80bcb4  docs: README под Pifagor Fund
e2f13d3  feat(landing): полноценный landing-page вместо редиректа
1bfcff4  feat: PDF cover-page для Recommended
299ec02  feat: backtested equity curve в Recommended
54c2cad  polish: JSON snapshot + print-стили
848bb29  polish: strategy glossary + persist active tab
41f3d83  polish: tooltips для метрик + CSV export
214e41c  polish: fund sleeves UI + dynamic CVaR copy
4342903  feat: persist policy + live market caps + CVaR threshold
···
<новый коммит этапа 1 ADE>
```

---

## Этап 1 Allocation Decision Engine — что внутри (готов, проверки в браузере не было)

Реализовано агентом по плану «1/4 объёма ChatGPT-roadmap-а — самые ценные вещи»:

1. **Data Quality Layer** — `src/lib/portfolio/dataQuality.ts`. Статусы `good/limited/very-limited/no-data` по количеству дневных свечей (365/180/90), жёсткое понижение max-cap (100%/5%/2%/0%). Интегрирован в `applyRiskCaps`.

2. **HRP** (`src/lib/portfolio/hrp.ts`) — Hierarchical Risk Parity: corr → single-linkage clustering → quasi-diagonalization → recursive bisection. **Экспорт готов, но в `buildAllStrategies` ещё не подключён как 10-я стратегия** (см. open questions).

3. **Maximum Diversification** (там же в `hrp.ts`) — Monte Carlo через 5k Dirichlet samples. Тоже **готов как util, но не подключён**.

4. **Расширенные метрики**: `calmar`, `ulcer`, `betaToBtc` в `StrategyMetrics`. Колонки в Strategies comparison table + CSV export. Tooltips в `metricGlossary.ts`.

5. **Recommendation Modes** — `src/lib/portfolio/recommendationModes.ts` (Conservative/Balanced/Aggressive). Три pill-кнопки в Risk Caps tab, по клику применяют пресет (caps + aggregate + CVaR + sleeves) и пересчитывают стратегии. Сохраняются в PolicyState.

6. **Rebalance Plan** в Recommended Tab — таблица per-asset input current weight → delta → BUY/SELL/HOLD/WATCH-ONLY + priority + reason. Current weights в localStorage.

7. **Confidence Score** — `src/lib/portfolio/confidence.ts` (0..100, low/medium/high), 7 факторов: window длина, CVaR, limited-data fraction, HHI concentration, turnover, model agreement, BTC correlation. Бейдж + раскрывающийся breakdown в Recommended Tab.

**Билд после этапа 1**: exit 0, `/portfolio` 37.7 kB / 142 kB First Load.

---

## Что нужно сделать ЗАВТРА — пошагово

### Шаг 1. Проверка этапа 1 (15-30 минут)

```powershell
cd "C:\Users\pifag\OneDrive\Тестер стратегий\trading-chart-mvp"
npm run dev
```

Открыть `http://localhost:3000/portfolio` и пройти все 5 sub-tabs:

1. **Simulation** — должно работать как раньше (Frontier-облако, KeyStat карточки, PortfolioTable). Skeleton при первом запуске.
2. **Strategies** — таблица должна иметь новые колонки **Calmar / Ulcer / β-BTC** с tooltips. CSV export должен включать эти поля.
3. **Risk Caps & Views** — новая секция «Recommendation Mode» сверху с тремя pill-кнопками (Conservative/Balanced/Aggressive). Клик → пересчёт.
4. **Stress Test** — без изменений.
5. **Recommended** — новый Confidence badge сверху, новая секция Rebalance Plan между донатами и equity curve.

Если что-то сломано:
- Билд проходил (exit 0), значит TS компилируется. Проблемы могут быть только runtime.
- Откатиться к предыдущему коммиту `8572fea` через `git reset --hard 8572fea`, потом восстановить по частям.

### Шаг 2. Решить open questions (10-20 минут разговора)

Эти вопросы выявил агент в отчёте этапа 1, на них надо ответить пользователю:

1. **HRP и MaxDiversification не подключены как 10-я и 11-я стратегии в `buildAllStrategies`.** Агент их написал, но в `strategies.ts::buildAllStrategies()` не добавил, потому что в спеке этого явно не было. Завтра: подключить как новые `StrategyId` (`hrp`, `maxDiv`), добавить в `strategyTypes.ts::StrategyId` union, в `strategyGlossary.ts` описания, в карточки и таблицу. Это 30 минут.

2. **Mode-apply timing**: клик по «Conservative/Balanced/Aggressive» сразу запускает пересчёт стратегий в воркере. Если пользователь хочет stage-and-apply (как остальные правки в Risk Caps tab) — поменять на staging. Спросить.

3. **Rebalance Plan currentWeights persist per-installation, не per-basket**: если поменять активы, старые current weights останутся в localStorage с старыми тикерами. Это создаёт «призрак данных». Завтра: добавить sanity-проверку при гидрации — оставить только те ключи, что в текущих `assets`.

4. **Confidence на cold start**: до первого расчёта dataQuality=null, бейдж не рендерится. Если пользователь приземлился через persisted activeTab=recommended, увидит донаты без бейджа на секунду. Решить: либо skeleton, либо «awaiting calculation».

### Шаг 3. Этап 2 Allocation Decision Engine (1.5–2 часа)

После проверки и исправления open questions — двигаемся дальше по roadmap-у. Этап 2 (из исходного плана ChatGPT):

- **Подключить HRP + MaxDiversification в `buildAllStrategies`** как 10-я и 11-я стратегии
- **Cluster Analysis** — utility `src/lib/portfolio/clusters.ts`, классификация активов на Core (BTC) / Infra (ETH) / High-beta L1 (SOL/TON/AVAX/ADA/DOT/ATOM) / Exchange (BNB/OKB) / Alpha (HYPE) / Meme (DOGE). Показать cluster exposure в Recommended Tab (компактная шкала «Core 75% · Satellite 18% · Alpha 5% · Meme 2%»).
- **Rotation Suggestions** в Recommended Tab — отдельный блок «Trim from / Add to / Reason». Логика: для каждого актива проверь нарушения (cluster overflow / dq cap / cvar contribution) → вычисли delta и приоритет → распредели освободившееся в core / candidates. Это уже более стратегический pin-pin чем Rebalance Plan.
- **Model Contribution блок** в Recommended Tab — таблица «Model | Influence | Effect» (например: «BL pushed BTC/ETH core», «HRP reduced correlated alts», «CVaR cut HYPE»). Можно посчитать через L1-distance между весами модели и finalFund.

### Шаг 4. Этап 3 (опционально, если время есть, 1–1.5 часа)

- **Watchlist Engine** — список монет «следить, но не покупать», с категориями и max-weight-eligible порогом. Может быть просто статическая таблица из defaults для начала.
- **Why these weights** блок — текстовое объяснение в стиле «Based on selected assets, data quality, Black-Litterman views, HRP, Risk Parity, CVaR stress-test, momentum overlay and risk caps, the recommended allocation is…» с подстановкой реальных топ-3 весов.

### Шаг 5. Этап 4 (по желанию)

То, что мы решили отложить из ChatGPT-плана:
- Robust / Resampled Markowitz (нужен численный солвер)
- Walk-forward backtest без look-ahead
- Volatility Targeting + Drawdown Control (дублирование с CVaR Defense)
- Fractional Kelly (advisory only)
- Momentum / Trend Overlay (нужен MA200 расчёт)
- On-chain / Fundamental Score (отдельная data plane)
- Liquidity Layer (нужен volume API)

Эти пункты — отдельный спринт, лучше отдельно решать каждый.

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
git diff HEAD~1            # что было в последнем коммите

# Откат если что-то сломалось
git reset --hard <hash>    # последний рабочий до этапа 1: 8572fea
```

---

## Архитектурные заметки (чтобы не забыть)

- **TLS на машине автора**: все скрипты обёрнуты в `cross-env NODE_OPTIONS="--use-system-ca"`. Без этого `npm install` и сетевые запросы падают.
- **OneDrive путь с кириллицей** иногда даёт WARN от git «LF will be replaced by CRLF» — это нормально.
- **Web Worker**: математика стратегий крутится в `src/workers/mpt.worker.ts`, не блокирует UI. Если меняешь `buildAllStrategies` — заодно проверь, что воркер правильно отдаёт ответ.
- **localStorage policy**: ключ `mpt-simulator:policy/v1`. Расширяй `PolicyState` в `storage.ts` если нужны новые поля.
- **CoinGecko `/api/marketcaps`** — disk-кэш 6 часов в `{PERSISTENT_DISK_ROOT}/marketcaps.json`. Локально это `.cache-disk/marketcaps.json`. Если CG падает — fallback на захардкоженный snapshot в `marketCaps.ts`.

---

## Связанные документы

- `README.md` в корне — описание стека, маршрутов, экспортов
- `C:/Users/pifag/OneDrive/Криптофонд/` — родительский проект Pifagor Fund (frontend, backend, NAV-логика, MASTER-SPEC.md)
- Дизайн-система Криптофонда: `Криптофонд/apps/frontend/src/app/globals.css` + `tailwind.config.js`

---

## TL;DR для первой минуты завтра

1. Открыть этот файл (`HANDOFF.md`).
2. Запустить `npm run dev` и пройти все 5 sub-tabs `/portfolio`. Проверить новые элементы (Confidence badge, Rebalance plan, Recommendation Modes, Calmar/Ulcer/β колонки).
3. Решить с пользователем 4 open questions из «Шаг 2».
4. Двигаться к этапу 2 — подключить HRP/MaxDiv как 10-11 стратегии, добавить Cluster Analysis + Rotation Suggestions + Model Contribution.
