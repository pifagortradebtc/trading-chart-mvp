# Скриншоты для VISUAL-TOUR.md

В этой папке лежат картинки, на которые ссылается [`docs/VISUAL-TOUR.md`](../VISUAL-TOUR.md).

## Как добавить

1. Сделай скрин нужного элемента на <https://trading-chart-mvp.onrender.com/portfolio>
2. Сохрани в `docs/images/` под нужным именем (см. список ниже)
3. Закоммить и запушь — на GitHub картинки автоматически рендерятся в VISUAL-TOUR

## Список нужных скриншотов (49 штук)

### Введение

| Файл | Что должно быть на скрине |
|---|---|
| `01-landing.png` | Главная страница `/` с кнопками «Бэктест» и «Портфель» |

### Шапка управления (2.x)

| Файл | Что |
|---|---|
| `02-header.png` | Вся шапка целиком после клика «Портфель» |
| `03-assets.png` | Только блок «Активы» с чипами и Quick-Picks |
| `04-period.png` | Кнопки «1 год / 2 года / 3 года / 5 лет» |
| `05-simulations.png` | Кнопки симуляций |
| `06-rf.png` | Слайдер безрисковой ставки |
| `07-bounds.png` | Раскрытая секция «Ограничения долей» |
| `08-recalculate.png` | Кнопки «Пересчитать» и «Пресеты» крупным планом |

### Вкладки общий вид

| Файл | Что |
|---|---|
| `09-tabs.png` | Полоса из 6 вкладок (Simulation / Strategies / Risk / Stress / Recommended / Journal) |

### Simulation (4.x)

| Файл | Что |
|---|---|
| `10-simulation.png` | Полная вкладка Simulation — облако точек + frontier + карточки |
| `11-frontier-points.png` | Зум на три именные точки на frontier (Min Vol / Max Sharpe / Max Sortino) |
| `12-sim-cards.png` | Три карточки справа (Max Sharpe / Max Sortino / Min Volatility) |
| `13-sim-table.png` | Таблица «Примеры весов портфелей» |

### Strategies (5.x)

| Файл | Что |
|---|---|
| `14-strategies.png` | Полная вкладка с 14 карточками |
| `15-strategy-card.png` | Зум на одну карточку (например, Max Sharpe) — показать все элементы |
| `16-strategy-table.png` | Сравнительная таблица Strategy Comparison |

### Risk Caps & Views (6.x)

| Файл | Что |
|---|---|
| `17-risk-caps.png` | Полная вкладка Risk Caps & Views |
| `18-modes.png` | Три карточки Conservative / Balanced / Aggressive |
| `19-caps-table.png` | Таблица Per-Asset Caps |
| `20-aggregate.png` | Два слайдера (BTC+ETH Floor + Small Alts Cap) |
| `21-cvar-defense.png` | Слайдер CVaR-Defense порога |
| `22-views.png` | Раздел Black-Litterman Views |
| `23-reset.png` | Кнопка «Reset to defaults» |

### Stress Test (7.x)

| Файл | Что |
|---|---|
| `24-stress.png` | Полная вкладка Stress Test |
| `25-stress-select.png` | Dropdown выбора стратегии |
| `26-stress-hist.png` | Карточки CVaR-95 / CVaR-99 / Worst day / Max DD |
| `27-stress-scenarios.png` | Три сценария (Moderate / Severe / Idiosyncratic) + Custom |
| `28-stress-bars.png` | Бар-чарт Tail-risk contribution по активам |

### Recommended (8.x)

| Файл | Что |
|---|---|
| `29-recommended.png` | Верхняя часть вкладки Recommended (header + Confidence) |
| `30-recommended-buttons.png` | Кнопки Copy JSON / Copy NAV / Print в шапке |
| `31-confidence.png` | Confidence badge с разбором факторов |
| `33-why.png` | Why narrative (5 параграфов) |
| `34-donuts.png` | Две donut-диаграммы (Spot + Total Fund) |
| `35-clusters.png` | Cluster Exposure bar |
| `36-delta-fund.png` | Δ vs Live Fund — таблица target/live/Δ/action |
| `37-rebalance.png` | Rebalance Plan — список BUY/SELL/HOLD |
| `38-rotation.png` | Rotation Suggestions — тикеты |
| `39-watchlist.png` | Watchlist |
| `40-liquidity.png` | Liquidity Layer таблица |
| `41-model-contrib.png` | Model Contribution рейтинг |
| `42-equity.png` | Backtested + Walk-forward equity кривые |
| `43-reasons.png` | 4 reason cards |
| `44-disclaimer.png` | Disclaimer внизу страницы |

### Journal (9.x)

| Файл | Что |
|---|---|
| `45-journal.png` | Полная вкладка Journal со списком run'ов |
| `46-run-row.png` | Зум на одну строку run'а — показать все badges |
| `47-run-actions.png` | Кнопки Add note / Compare на одной строке |
| `48-compare.png` | Открытое сравнение двух run'ов (diff таблица) |
| `49-refresh.png` | Кнопка Refresh в шапке Journal |

## Технические рекомендации

- **Формат**: PNG (для UI скринов) — лучшее качество текста.
- **Размер**: 1200-1600px по ширине достаточно. Очень большие файлы (>500KB) лучше сжать.
- **Тёмная тема**: платформа в dark mode, скрины делать в нём же.
- **Без личных данных**: если попадает в кадр Telegram-ID, JWT, или адреса кошельков — затри пикселями.
- **Анонимизация**: composition фонда — публичная информация, скрывать не нужно.

## Если какой-то скрин временно не сделан

Markdown спокойно отрендерит «битую» картинку с alt-текстом — текст под ней останется читаемым. То есть **гайд работает даже без скриншотов**, просто будет менее красивым. Не нужно ждать пока сделаешь все 49 — можно по мере появления.
