# Trading Chart MVP

Next.js 15 + Tailwind + lightweight-charts. Включает страницу бэктеста DCA с индикатором **V2_ЧайкКельт**: `/backtest`.

## Локально

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000/backtest](http://localhost:3000/backtest).

## Деплой на Render

1. Запушьте репозиторий на GitHub.
2. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (или **Web Service**).
3. Подключите репозиторий; при использовании Blueprint подхватится `render.yaml`.
4. Либо вручную для **Web Service**:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node 20

После деплоя приложение доступно по URL вида `https://trading-chart-mvp.onrender.com`.

**Примечание:** тариф Free «засыпает» без трафика — первый запрос после паузы может занять ~1 минуту.
