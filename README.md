# Pifagor Fund — Кабинет аналитики

Внутренний research-стек закрытого криптофонда. Next.js 15 + TypeScript + Tailwind v3 + lightweight-charts + Plotly + Web Workers. Не публичный финансовый продукт.

## Маршруты

| Путь | Назначение |
|------|------------|
| `/` | Landing-страница фонда. Хедер с π-логотипом, hero-слоган, две CTA в разделы. |
| `/portfolio` | **Кабинет аналитики**: 14 моделей построения портфеля + risk caps + liquidity + CVaR-стресс + рекомендованная аллокация. |
| `/backtest` | **Бэктест стратегий**: DCA с индикатором V2 ЧайкКельт и Pifagor ALTS на исторических OHLCV. |
| `/chart` | Просмотр графика со сделками из бэктеста (кнопка «График со сделками»). |

## Кабинет аналитики (`/portfolio`)

Пять под-вкладок:

- **Simulation** — Monte-Carlo cloud по Markowitz, efficient frontier, Max Sharpe / Max Sortino / Min Vol.
- **Strategies** — 14 параллельных моделей: Market Cap, Equal Weight, Min Vol, Max Sharpe, Max Sortino, Risk Parity, Black-Litterman (view-tilt), CVaR-Optimal, HRP, Max Diversification, Momentum Overlay, Fractional Kelly, Resampled Markowitz (Michaud), Final Fund Portfolio. Карточки + сравнительная таблица с CSV-экспортом.
- **Risk Caps & Views** — pill-кнопки Conservative/Balanced/Aggressive presets, per-asset min/max, агрегатные правила (BTC+ETH floor, small-alts ceiling), CVaR-defense порог, fund sleeves (bot / manual), Black-Litterman views (expected return + confidence + max weight).
- **Stress Test** — историческая CVaR-95/99 + сценарные шоки + tail-contribution chart.
- **Recommended** — финальный premium-вид: Confidence Score, Vol Target advisory, Why-narrative, два donut'а (spot / total fund), Cluster Exposure, Rebalance Plan, Rotation Suggestions, Watchlist, Liquidity Layer, Model Contribution, equity curve, walk-forward HRP equity (OOS retraining), JSON snapshot и Print/PDF с титульной страницей.

Источники данных:
- **OHLCV** (закрытия дневные/часовые) — Binance Spot через `/api/ohlcv` с дисковым кэшем.
- **Market caps** — CoinGecko через `/api/marketcaps` (6h disk-кэш, fallback на хардкодный snapshot).

Расчёты — в Web Worker (`src/workers/mpt.worker.ts`), UI не блокируется. Политика (риск-капы, views, CVaR-порог, sleeves, активная вкладка) сохраняется в `localStorage`.

## Бэктест (`/backtest`)

Терминал V2 ЧайкКельт + Pifagor ALTS:
- Параметрический DCA с индикатором ЧайкКельт + Keltner + ADX
- Pifagor ALTS-режим (pyramiding, mult/diff логика)
- Портфельный режим (30 альтов CMC top)
- Метрики: Sharpe, Sortino, PF, Win Rate, Max DD, Ulcer, IR
- Monte-Carlo перестановки, стресс-сценарии, мини-сетка оптимизации, бенчмарк Buy & Hold

## Локально

```bash
npm install
npm run dev          # http://localhost:3000
```

На машине автора Node ругается на TLS — поэтому скрипты обёрнуты в `cross-env NODE_OPTIONS=--use-system-ca`. Если у вас другое окружение и cert valid — можно убрать.

## Деплой на Render

1. Запушьте репозиторий на GitHub.
2. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (или **Web Service**).
3. При Blueprint подхватится `render.yaml`. Или вручную:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node 20

После деплоя приложение доступно по URL вида `https://trading-chart-mvp.onrender.com`.

### Persistent Disk (кэш OHLCV, market caps, снапшоты бэктеста)

Чтобы **не скачивать заново** большие исторические ряды и хранить последний результат бэктеста на диске Render:

1. В сервисе → **Disks** → **Add Disk** (в Blueprint задано монтирование в **`/var/data`** — путь может быть любой, главное совпадение с переменной).
2. Переменная **`PERSISTENT_DISK_ROOT`** должна совпадать с Mount Path диска (например **`/var/data`**).

Что кэшируется:
- `GET /api/ohlcv` → `{PERSISTENT_DISK_ROOT}/ohlcv/`
- `GET /api/marketcaps` → `{PERSISTENT_DISK_ROOT}/marketcaps.json` (TTL 6 ч)
- `POST /api/backtest/snapshot` → `{PERSISTENT_DISK_ROOT}/snapshots/`

Локально без переменной используется `.cache-disk/` (в `.gitignore`). См. `.env.example`.

**Примечание:** тариф Free «засыпает» без трафика — первый запрос после паузы может занять ~1 минуту. Persistent disk на Render может требовать платный план; если Blueprint с `disk:` не создаётся — добавьте диск вручную и задайте `PERSISTENT_DISK_ROOT`.

## Экспорт для инвесторов

- **Strategies → Copy CSV** — таблица сравнения 14 моделей с полным набором метрик (включая Calmar, Ulcer, β-BTC), готово для Excel / pitch deck.
- **Recommended → Copy JSON** — full snapshot финального портфеля (модель, символы, spot/total fund веса, метрики, policy, warning).
- **Recommended → Print · PDF** — браузерное «Сохранить как PDF» с титульной страницей и адаптированной светлой темой (golden акценты, ink-чернила, без glass/blur/анимаций).

## Дисклеймер

Образовательная количественная модель, не публичная финансовая рекомендация. Прошлая доходность не гарантирует будущую.
