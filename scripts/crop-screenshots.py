#!/usr/bin/env python3
"""
Вырезает все недостающие фрагменты скриншотов из уже скачанных full-page
снимков вкладок (docs/images/tab-*.png) через PIL crop.

Координаты — примерные, выставлены глазомерно по структуре UI. Если кадр
ушёл — поправь box и перезапусти.

Запуск:
  python scripts/crop-screenshots.py
"""

from pathlib import Path
from PIL import Image

IMG_DIR = Path(__file__).resolve().parent.parent / "docs" / "images"


def crop(src_name: str, box: tuple[int, int, int, int], out_name: str):
    src_path = IMG_DIR / src_name
    if not src_path.is_file():
        print(f"[skip] {src_name} not found")
        return
    img = Image.open(src_path)
    out = img.crop(box)
    out_path = IMG_DIR / out_name
    out.save(out_path, optimize=True)
    print(f"{out_name}: {out.size}")


# ─────────────────────────────────────────────────────────────────────────
# Шапка управления (tab-simulation.png 1440x1782)
# ─────────────────────────────────────────────────────────────────────────

# Активы — чипы + Quick Picks (полоса посередине шапки)
crop("tab-simulation.png", (30, 305, 1410, 450), "03-assets.png")

# Период истории — 4 кнопки
crop("tab-simulation.png", (30, 455, 280, 545), "04-period.png")

# Симуляций — 4 кнопки
crop("tab-simulation.png", (300, 455, 620, 545), "05-simulations.png")

# Безрисковая ставка — слайдер
crop("tab-simulation.png", (640, 455, 880, 545), "06-rf.png")

# Ограничения долей — свёрнутая секция (раскрытую сделаем отдельно через firecrawl)
crop("tab-simulation.png", (30, 555, 1410, 615), "07-bounds.png")

# Кнопки Пресеты + Пересчитать в правом верхнем
crop("tab-simulation.png", (1130, 355, 1410, 410), "08-recalculate.png")

# ─────────────────────────────────────────────────────────────────────────
# Simulation (tab-simulation.png)
# ─────────────────────────────────────────────────────────────────────────

# Три именные точки на frontier — верхний край графика
crop("tab-simulation.png", (90, 780, 920, 870), "11-frontier-points.png")

# Три карточки справа от графика
crop("tab-simulation.png", (945, 735, 1410, 900), "12-sim-cards.png")

# Таблица «Примеры весов портфелей»
crop("tab-simulation.png", (945, 905, 1410, 1410), "13-sim-table.png")

# ─────────────────────────────────────────────────────────────────────────
# Strategies (tab-strategies.png 1440x3457)
# ─────────────────────────────────────────────────────────────────────────

# Одна карточка модели — Market Cap, топ-левая
crop("tab-strategies.png", (30, 220, 490, 480), "15-strategy-card.png")

# ─────────────────────────────────────────────────────────────────────────
# Risk Caps & Views (tab-risk-caps.png 1440x2527)
# ─────────────────────────────────────────────────────────────────────────

# Три карточки Mode (Conservative / Balanced / Aggressive)
crop("tab-risk-caps.png", (30, 230, 1410, 540), "18-modes.png")

# Per-Asset Caps — таблица
crop("tab-risk-caps.png", (30, 580, 1410, 1320), "19-caps-table.png")

# Aggregate Rules — два слайдера
crop("tab-risk-caps.png", (30, 1350, 1410, 1530), "20-aggregate.png")

# CVaR-Defense — слайдер
crop("tab-risk-caps.png", (30, 1550, 1410, 1770), "21-cvar-defense.png")

# Views — раздел (нижняя часть страницы)
crop("tab-risk-caps.png", (30, 1800, 1410, 2520), "22-views.png")

# ─────────────────────────────────────────────────────────────────────────
# Stress Test (tab-stress.png 1440x1725)
# ─────────────────────────────────────────────────────────────────────────

# Карточки CVaR-95 / CVaR-99 / Worst day / Max DD
crop("tab-stress.png", (30, 200, 1410, 400), "26-stress-hist.png")

# Сценарии шоков (Moderate / Severe / Idiosyncratic / Custom)
crop("tab-stress.png", (30, 420, 1410, 1100), "27-stress-scenarios.png")

# Бар-чарт Tail-risk contribution
crop("tab-stress.png", (30, 1130, 1410, 1700), "28-stress-bars.png")

# ─────────────────────────────────────────────────────────────────────────
# Recommended (tab-recommended.png 1440x5784)
# ─────────────────────────────────────────────────────────────────────────

# Три кнопки в шапке (Copy JSON / Copy NAV / Print)
crop("tab-recommended.png", (1050, 30, 1410, 130), "30-recommended-buttons.png")

# Confidence badge
crop("tab-recommended.png", (30, 230, 1410, 600), "31-confidence.png")

# Vol Target card
crop("tab-recommended.png", (30, 620, 1410, 900), "32-vol-target.png")

# Why narrative
crop("tab-recommended.png", (30, 920, 1410, 1480), "33-why.png")

# Cluster Exposure
crop("tab-recommended.png", (30, 1880, 1410, 2250), "35-clusters.png")

# Δ vs Live Fund (если есть)
crop("tab-recommended.png", (30, 2270, 1410, 2780), "36-delta-fund.png")

# Rotation Suggestions
crop("tab-recommended.png", (30, 3160, 1410, 3620), "38-rotation.png")

# Watchlist
crop("tab-recommended.png", (30, 3640, 1410, 4030), "39-watchlist.png")

# Liquidity Layer
crop("tab-recommended.png", (30, 4050, 1410, 4540), "40-liquidity.png")

# Model Contribution
crop("tab-recommended.png", (30, 4560, 1410, 4960), "41-model-contrib.png")

# Equity curves (backtested + walk-forward)
crop("tab-recommended.png", (30, 4980, 1410, 5430), "42-equity.png")

# 4 reason cards "Why this allocation"
crop("tab-recommended.png", (30, 5440, 1410, 5740), "43-reasons.png")

# ─────────────────────────────────────────────────────────────────────────
# Journal (tab-journal.png 1440x1171)
# ─────────────────────────────────────────────────────────────────────────

# Одна строка run'а — зум на самой первой записи
crop("tab-journal.png", (30, 340, 1410, 560), "46-run-row.png")

# Кнопки Add note / Compare на одной строке (правый край)
crop("tab-journal.png", (1000, 360, 1410, 440), "47-run-actions.png")

# Compare two runs — на static-снимке такой блок не отображается
# (требуется 2 run'а + клик Compare на обоих), оставляем placeholder.
print("[info] 48-compare.png требует interactive flow, placeholder оставлен")

# Refresh button
crop("tab-journal.png", (1300, 220, 1410, 280), "49-refresh.png")

print("[done] crop завершён")
