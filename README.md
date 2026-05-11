# Trading Chart MVP

Next.js 15 + Tailwind + lightweight-charts. Включает страницу бэктеста DCA с индикатором **V2_ЧайкКельт**: `/backtest`.

## Локально

```bash
npm install
npm run dev
```

Главная страница сайта перенаправляет на бэктест: [http://localhost:3000](http://localhost:3000) → `/backtest`.

Демо графика с mock-данными (старый MVP): [http://localhost:3000/chart](http://localhost:3000/chart).

## Деплой на Render

1. Запушьте репозиторий на GitHub.
2. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (или **Web Service**).
3. Подключите репозиторий; при использовании Blueprint подхватится `render.yaml`.
4. Либо вручную для **Web Service**:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node 20

После деплоя приложение доступно по URL вида `https://trading-chart-mvp.onrender.com`.

### Persistent Disk (кеш OHLCV и снимки бэктеста)

Чтобы **не скачивать заново** большие исторические ряды и хранить последний результат бэктеста на диске Render:

1. В сервисе → **Disks** → **Add Disk** (в Blueprint задано монтирование в **`/var/data`** — можно выбрать любой путь, главное совпадение с переменной ниже).
2. Переменная **`PERSISTENT_DISK_ROOT`** должна быть **ровно как Mount Path** диска (например **`/var/data`**).

На сервере:

- **`GET /api/ohlcv`** кеширует свечи в `{PERSISTENT_DISK_ROOT}/ohlcv/`.
- **`POST /api/backtest/snapshot`** сохраняет метрики, сделки и equity в `{PERSISTENT_DISK_ROOT}/snapshots/`.

Клиент запрашивает OHLCV через этот API. Локально без переменной используется папка **`.cache-disk/`** (в `.gitignore`). См. `.env.example`.

**Примечание:** тариф Free «засыпает» без трафика — первый запрос после паузы может занять ~1 минуту. Отдельный persistent disk на Render может требовать платный план; если Blueprint с `disk:` не создаётся — добавьте диск вручную в Dashboard и задайте `PERSISTENT_DISK_ROOT`.
