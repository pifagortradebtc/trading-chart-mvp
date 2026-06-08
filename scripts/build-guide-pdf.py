#!/usr/bin/env python3
"""
Генератор презентационного PDF-руководства для команды Pifagor Fund.

Использует reportlab + Platypus. Brand: gold (#c9a962) + ink на белом
фоне (для удобства печати и чтения). Cover — тёмный premium-look.

Запуск:
  python scripts/build-guide-pdf.py

Output:
  docs/Pifagor-Portfolio-Research-Guide.pdf
"""

from __future__ import annotations

from pathlib import Path
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─────────────────────────────────────────────────────────────────────────
# Регистрация TTF-шрифтов с поддержкой кириллицы
# Built-in Helvetica/Times у reportlab не поддерживает Unicode — рендерят
# кириллицу как .notdef (■). Используем Windows-системные Arial/Courier,
# они есть на любой Windows-машине.
# ─────────────────────────────────────────────────────────────────────────

import os

FONT_DIRS = [
    r"C:\Windows\Fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/Library/Fonts",
]

FONT_CANDIDATES = {
    "Body": ["arial.ttf", "DejaVuSans.ttf", "Arial.ttf"],
    "Body-Bold": ["arialbd.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"],
    "Body-Italic": ["ariali.ttf", "DejaVuSans-Oblique.ttf", "Arial Italic.ttf"],
    "Mono": ["cour.ttf", "DejaVuSansMono.ttf", "Courier New.ttf"],
    "Mono-Bold": ["courbd.ttf", "DejaVuSansMono-Bold.ttf"],
}


def find_font(filenames: list[str]) -> str | None:
    for d in FONT_DIRS:
        for name in filenames:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return p
    return None


for logical_name, candidates in FONT_CANDIDATES.items():
    path = find_font(candidates)
    if path:
        try:
            pdfmetrics.registerFont(TTFont(logical_name, path))
        except Exception as e:
            print(f"[warn] не удалось загрузить {logical_name}: {e}")
    else:
        print(f"[warn] не найден шрифт для {logical_name} ({candidates})")

# Имена шрифтов для стилей
FONT_REG = "Body"
FONT_BOLD = "Body-Bold"
FONT_ITALIC = "Body-Italic"
FONT_MONO = "Mono"

# ─────────────────────────────────────────────────────────────────────────
# Brand palette
# ─────────────────────────────────────────────────────────────────────────
GOLD = HexColor("#c9a962")
GOLD_DARK = HexColor("#a8843e")
GOLD_LIGHT = HexColor("#e6c989")
INK = HexColor("#1a1d24")
INK_MUTED = HexColor("#5c6478")
INK_FAINT = HexColor("#8b93a8")
PAPER = HexColor("#fdfcf8")  # cream white
LINE = HexColor("#d8d3c4")
COVER_BG = HexColor("#0a0d14")
ACCENT_BLUE = HexColor("#4a90c5")
ACCENT_GREEN = HexColor("#5fb37e")
ACCENT_RED = HexColor("#c9526a")

PAGE_W, PAGE_H = A4
MARGIN_L = 2.0 * cm
MARGIN_R = 2.0 * cm
MARGIN_T = 2.5 * cm
MARGIN_B = 2.5 * cm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

# ─────────────────────────────────────────────────────────────────────────
# Styles
# ─────────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

eyebrow = ParagraphStyle(
    "eyebrow",
    fontName="Body-Bold",
    fontSize=8,
    leading=10,
    textColor=GOLD_DARK,
    spaceAfter=4,
)

h1 = ParagraphStyle(
    "h1",
    fontName="Body-Bold",
    fontSize=22,
    leading=26,
    textColor=INK,
    spaceBefore=8,
    spaceAfter=10,
)

h2 = ParagraphStyle(
    "h2",
    fontName="Body-Bold",
    fontSize=14,
    leading=17,
    textColor=INK,
    spaceBefore=12,
    spaceAfter=6,
)

h3 = ParagraphStyle(
    "h3",
    fontName="Body-Bold",
    fontSize=11,
    leading=14,
    textColor=GOLD_DARK,
    spaceBefore=10,
    spaceAfter=4,
)

body = ParagraphStyle(
    "body",
    fontName="Body",
    fontSize=10,
    leading=14,
    textColor=INK,
    spaceAfter=6,
    alignment=TA_LEFT,
)

body_muted = ParagraphStyle(
    "body_muted",
    parent=body,
    textColor=INK_MUTED,
    fontSize=9,
    leading=12,
)

mono = ParagraphStyle(
    "mono",
    fontName="Mono",
    fontSize=8,
    leading=10,
    textColor=INK_MUTED,
)

caption = ParagraphStyle(
    "caption",
    fontName="Body-Italic",
    fontSize=8,
    leading=10,
    textColor=INK_FAINT,
    alignment=TA_CENTER,
    spaceBefore=2,
    spaceAfter=10,
)

bullet = ParagraphStyle(
    "bullet",
    parent=body,
    leftIndent=14,
    bulletIndent=2,
    spaceAfter=3,
)

stop_signal = ParagraphStyle(
    "stop",
    parent=body,
    textColor=ACCENT_RED,
    leftIndent=14,
    spaceAfter=3,
)

# ─────────────────────────────────────────────────────────────────────────
# Custom flowables
# ─────────────────────────────────────────────────────────────────────────


class ScreenshotPlaceholder(Flowable):
    """Серая рамка с пометкой — куда вставить скрин."""

    def __init__(self, label: str, height: float = 5 * cm, width: float | None = None):
        super().__init__()
        self.label = label
        self.height = height
        self.width = width or CONTENT_W

    def wrap(self, _availWidth, _availHeight):
        return self.width, self.height

    def draw(self):
        c = self.canv
        # Frame
        c.setStrokeColor(LINE)
        c.setFillColor(HexColor("#f4f1e8"))
        c.setLineWidth(0.5)
        c.setDash(3, 3)
        c.rect(0, 0, self.width, self.height, stroke=1, fill=1)
        c.setDash()
        # Label
        c.setFillColor(INK_FAINT)
        c.setFont("Body-Italic", 9)
        c.drawCentredString(self.width / 2, self.height / 2 + 5, "[ скриншот ]")
        c.setFont("Body", 8)
        c.drawCentredString(self.width / 2, self.height / 2 - 8, self.label)


class GoldRule(Flowable):
    """Тонкая золотая линия-разделитель."""

    def __init__(self, width: float | None = None, height: float = 0.8 * mm):
        super().__init__()
        self.width = width or CONTENT_W
        self.height = height

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(GOLD)
        c.rect(0, 0, self.width, self.height, stroke=0, fill=1)


# ─────────────────────────────────────────────────────────────────────────
# Page templates
# ─────────────────────────────────────────────────────────────────────────


def cover_page(canv: canvas.Canvas, _doc):
    """Тёмная cover-страница с премиум-вёрсткой."""
    canv.saveState()
    # Background
    canv.setFillColor(COVER_BG)
    canv.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Subtle gold accent: горизонтальная линия сверху
    canv.setFillColor(GOLD)
    canv.rect(0, PAGE_H - 8 * mm, PAGE_W, 1.5 * mm, stroke=0, fill=1)

    # π monogram
    canv.setFillColor(GOLD)
    canv.setFont("Body-Bold", 60)
    canv.drawString(MARGIN_L, PAGE_H - 6 * cm, "π")

    # Eyebrow
    canv.setFillColor(GOLD_LIGHT)
    canv.setFont("Body-Bold", 9)
    canv.drawString(MARGIN_L, PAGE_H - 8 * cm, "PIFAGOR FUND  ·  PORTFOLIO RESEARCH")

    # Title
    canv.setFillColor(white)
    canv.setFont("Body-Bold", 36)
    canv.drawString(MARGIN_L, PAGE_H - 11 * cm, "Визуальное")
    canv.drawString(MARGIN_L, PAGE_H - 12.8 * cm, "руководство")

    # Subtitle
    canv.setFillColor(HexColor("#a9b2c4"))
    canv.setFont("Body", 14)
    canv.drawString(MARGIN_L, PAGE_H - 15 * cm, "Тур по интерфейсу платформы")
    canv.drawString(MARGIN_L, PAGE_H - 15.8 * cm, "по экранам и кнопкам")

    # Gold rule
    canv.setFillColor(GOLD)
    canv.rect(MARGIN_L, PAGE_H - 17.5 * cm, 4 * cm, 0.6 * mm, stroke=0, fill=1)

    # Meta block (правый низ)
    canv.setFillColor(GOLD_LIGHT)
    canv.setFont("Body-Bold", 8)
    canv.drawString(MARGIN_L, 4.0 * cm, "ВЕРСИЯ ДОКУМЕНТА")
    canv.setFillColor(white)
    canv.setFont("Body", 11)
    canv.drawString(MARGIN_L, 3.4 * cm, "2026-05-20")

    canv.setFillColor(GOLD_LIGHT)
    canv.setFont("Body-Bold", 8)
    canv.drawString(MARGIN_L + 6 * cm, 4.0 * cm, "АУДИТОРИЯ")
    canv.setFillColor(white)
    canv.setFont("Body", 11)
    canv.drawString(MARGIN_L + 6 * cm, 3.4 * cm, "Команда фонда")

    canv.setFillColor(GOLD_LIGHT)
    canv.setFont("Body-Bold", 8)
    canv.drawString(MARGIN_L + 12 * cm, 4.0 * cm, "PRODUCTION")
    canv.setFillColor(white)
    canv.setFont("Body", 9)
    canv.drawString(MARGIN_L + 12 * cm, 3.4 * cm, "trading-chart-mvp.onrender.com")

    # Footer ribbon
    canv.setFillColor(GOLD)
    canv.rect(0, 0, PAGE_W, 8 * mm, stroke=0, fill=1)
    canv.setFillColor(COVER_BG)
    canv.setFont("Body-Bold", 8)
    canv.drawCentredString(PAGE_W / 2, 2.8 * mm, "Внутренний документ Pifagor Fund — research tool")

    canv.restoreState()


def content_page(canv: canvas.Canvas, doc):
    """Стандартная content-страница: header + page number + footer."""
    canv.saveState()

    # Top header
    canv.setFillColor(GOLD)
    canv.rect(MARGIN_L, PAGE_H - 1.5 * cm, 0.8 * cm, 1.5 * mm, stroke=0, fill=1)
    canv.setFillColor(INK_MUTED)
    canv.setFont("Body-Bold", 8)
    canv.drawString(
        MARGIN_L + 1.2 * cm,
        PAGE_H - 1.4 * cm,
        "PIFAGOR FUND  ·  PORTFOLIO RESEARCH  ·  ВИЗУАЛЬНОЕ РУКОВОДСТВО",
    )

    # Bottom — page number
    canv.setFillColor(INK_MUTED)
    canv.setFont("Body", 8)
    canv.drawRightString(
        PAGE_W - MARGIN_R, MARGIN_B / 2 - 2 * mm, f"стр. {doc.page}"
    )
    canv.drawString(
        MARGIN_L, MARGIN_B / 2 - 2 * mm, "trading-chart-mvp.onrender.com"
    )

    # Decorative dot
    canv.setFillColor(GOLD)
    canv.circle(PAGE_W / 2, MARGIN_B / 2 - 1 * mm, 0.5 * mm, stroke=0, fill=1)

    canv.restoreState()


# ─────────────────────────────────────────────────────────────────────────
# Content blocks helpers
# ─────────────────────────────────────────────────────────────────────────


def section(title: str, eyebrow_text: str | None = None) -> list:
    """Заголовок секции с eyebrow."""
    out: list = [PageBreak()]
    if eyebrow_text:
        out.append(Paragraph(eyebrow_text.upper(), eyebrow))
    out.append(Paragraph(title, h1))
    out.append(GoldRule())
    out.append(Spacer(1, 8))
    return out


def sub(title: str) -> Paragraph:
    return Paragraph(title, h2)


def micro(title: str) -> Paragraph:
    return Paragraph(title, h3)


def p(text: str) -> Paragraph:
    return Paragraph(text, body)


def pm(text: str) -> Paragraph:
    return Paragraph(text, body_muted)


def bul(text: str) -> Paragraph:
    return Paragraph(f"• {text}", bullet)


def stop(text: str) -> Paragraph:
    return Paragraph(f"🔴  {text}", stop_signal)


def screen(label: str, height: float = 5 * cm):
    """
    Если в `docs/images/<имя-файла>` лежит реальный скрин — возвращаем его
    как reportlab Image. Имя файла извлекается из label: формат либо
    "12-name.png — описание", либо просто описание (для legacy placeholders).
    Иначе fallback на серую рамку с подсказкой.
    """
    # Попытка извлечь имя файла из метки (до первого пробела или " —")
    candidate_filename: str | None = None
    head = label.split(" —", 1)[0].split(" -", 1)[0].strip()
    if head.lower().endswith(".png"):
        candidate_filename = head

    if candidate_filename:
        path = Path(__file__).resolve().parent.parent / "docs" / "images" / candidate_filename
        if path.is_file():
            # Скейлим до фиксированной ширины content area; высота — пропорциональная.
            # reportlab разместит на странице как один flowable, переносом на новую
            # страницу если не влезает по высоте.
            try:
                from PIL import Image as PILImage
                pil = PILImage.open(str(path))
                pw, ph = pil.size
                target_w = CONTENT_W
                target_h = target_w * ph / pw
                # Ограничим максимальную высоту: один скрин не больше 20см,
                # иначе отдельные большие куски делать руками (split на части).
                max_h = 20 * cm
                if target_h > max_h:
                    target_h = max_h
                    target_w = target_h * pw / ph
                img = Image(str(path), width=target_w, height=target_h, kind="proportional")
                img.hAlign = "CENTER"
                return img
            except Exception:
                pass  # fallback на placeholder

    return ScreenshotPlaceholder(label, height=height)


def cap(text: str) -> Paragraph:
    return Paragraph(text, caption)


def boxed_table(rows: list[list[str]], col_widths: list[float] | None = None) -> Table:
    """Таблица с brand-стилем (gold header)."""
    if col_widths is None:
        col_widths = [CONTENT_W / len(rows[0])] * len(rows[0])
    t = Table(rows, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), "Body-Bold", 8),
                ("FONT", (0, 1), (-1, -1), "Body", 8.5),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                ("BACKGROUND", (0, 0), (-1, 0), GOLD_DARK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PAPER, HexColor("#f6f3eb")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, GOLD),
            ]
        )
    )
    return t


# ─────────────────────────────────────────────────────────────────────────
# Build story
# ─────────────────────────────────────────────────────────────────────────


story: list = []

# ── TOC ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Содержание", h1))
story.append(GoldRule())
story.append(Spacer(1, 12))

toc_rows = [
    ["№", "Раздел", "Что внутри"],
    ["1", "Введение", "Что это, как сюда попасть, базовая навигация"],
    ["2", "Шапка управления", "Активы / Период / Симуляции / Безрисковая ставка / Recalculate"],
    ["3", "Вкладка Simulation", "Облако портфелей, Efficient Frontier, три именные точки"],
    ["4", "Вкладка Strategies", "14 моделей построения портфеля + сравнительная таблица"],
    ["5", "Вкладка Risk Caps & Views", "Правила игры: caps, aggregate rules, CVaR-Defense, views"],
    ["6", "Вкладка Stress Test", "Сценарии шоков и историческая хвостовая статистика"],
    ["7", "Вкладка Recommended", "Финальный портфель фонда — главная вкладка"],
    ["8", "Вкладка Journal", "Audit trail всех расчётов + Compare two runs"],
    ["9", "Стоп-сигналы", "Когда НЕ нужно публиковать NAV"],
    ["10", "Полезные ссылки", "Production, репозиторий, контакты"],
]
story.append(boxed_table(toc_rows, col_widths=[1.2 * cm, 5.0 * cm, CONTENT_W - 6.2 * cm]))

# ── 1. Введение ──────────────────────────────────────────────────────────
story.extend(section("Введение", "раздел 1"))

story.append(p(
    "<b>Portfolio Research</b> — внутренняя аналитическая площадка Pifagor Fund. "
    "Помогает ответить на один вопрос: «какая композиция портфеля должна быть у фонда "
    "на следующий период?»."
))
story.append(p(
    "Платформа <b>не торгует</b> и <b>не пишет в фонд напрямую</b>. Между research "
    "и production-фондом всегда стоит управляющий: проверяет результат, "
    "копирует JSON, вручную подаёт его в админку Криптофонда."
))

story.append(sub("Как сюда попасть"))
story.append(p(
    "1. Открой <font color='#a8843e'><b>trading-chart-mvp.onrender.com</b></font><br/>"
    "2. В правом верхнем углу нажми кнопку <b>«Портфель»</b><br/>"
    "3. После загрузки откроется панель с шапкой управления и шестью вкладками"
))

story.append(screen("01-landing.png — главная страница", height=5.5 * cm))
story.append(cap("Главная страница: кнопки «Бэктест» и «Портфель» сверху справа."))

# ── 2. Шапка управления ──────────────────────────────────────────────────
story.extend(section("Шапка управления", "раздел 2"))
story.append(p(
    "Над шестью вкладками — панель параметров. Тут задаётся <b>что</b> платформа "
    "считает: какие активы, на каком окне истории, с какой плотностью симуляции."
))

story.append(screen("02-header.png — вся шапка управления", height=5.5 * cm))

story.append(micro("Активы"))
story.append(p(
    "Чипы с тикерами — твой текущий <b>universe</b>. ✕ убирает актив, "
    "поле справа добавляет новый. «Быстрый выбор» — одобренные тикеры, "
    "которых ещё нет в universe."
))
story.append(screen("03-assets.png — блок Активы с чипами", height=3 * cm))

story.append(micro("Период истории"))
story.append(p(
    "Кнопки <b>1 / 2 / 3 / 5 лет</b> — на каком окне обучать модели.<br/>"
    "<b>Default: 2 года</b> — компромисс между длинной историей и включением HYPE "
    "(он торгуется ~17 месяцев)."
))
story.append(screen("04-period.png — кнопки периода", height=2.2 * cm))

story.append(micro("Симуляций"))
story.append(p(
    "<b>10 000 / 25 000 / 50 000 / 100 000</b> — количество Monte-Carlo точек "
    "для Simulation tab. Больше = точнее, но дольше. <b>Default: 50 000</b>."
))
story.append(screen("05-simulations.png — кнопки симуляций", height=2.2 * cm))

story.append(micro("Безрисковая ставка"))
story.append(p(
    "Слайдер 0–10%. Используется в формуле Sharpe = (return − rf) / vol. "
    "<b>Default: 4.0%</b> (примерный US Treasury 10Y)."
))
story.append(screen("06-rf.png — слайдер безрисковой ставки", height=2.2 * cm))

story.append(micro("Ограничения долей"))
story.append(p(
    "Сворачиваемая секция. Min/max доли для <b>Monte-Carlo симуляции</b> "
    "(не путать с Risk Caps в отдельной вкладке — те для финальной композиции). "
    "Обычно не трогают."
))
story.append(screen("07-bounds.png — раскрытые Ограничения долей", height=3.5 * cm))

story.append(micro("Пересчитать"))
story.append(p(
    "Главная кнопка справа. После нажатия платформа тянет котировки с бирж, "
    "считает 14 моделей параллельно (5–15 сек) и обновляет все шесть вкладок."
))
story.append(screen("08-recalculate.png — кнопка Пересчитать + Пресеты", height=2.5 * cm))

# ── 3. Simulation ────────────────────────────────────────────────────────
story.extend(section("Вкладка Simulation", "раздел 3"))
story.append(p(
    "Первая вкладка после Пересчитать. Показывает <b>пространство возможностей</b> — "
    "50 000 случайных портфелей на графике риск × доходность. Помогает понять "
    "ландшафт прежде чем смотреть конкретные модели."
))
story.append(screen("10-simulation.png — полная вкладка Simulation", height=8 * cm))

story.append(sub("Как читать график"))
story.append(boxed_table(
    [
        ["Элемент", "Что значит"],
        ["Ось X (горизонталь)", "Годовая волатильность — насколько портфель скачет"],
        ["Ось Y (вертикаль)", "Годовая доходность"],
        ["Цвет точки", "Sharpe ratio: синий — низкий, фиолетовый — высокий"],
        ["Зелёная кривая", "Efficient Frontier — лучшие портфели для каждого уровня риска"],
    ],
    col_widths=[5 * cm, CONTENT_W - 5 * cm],
))

story.append(sub("Три именные точки на frontier"))
story.append(p(
    "На кривой выделены три «звёздных» решения, каждое оптимизирует свой критерий:"
))
story.append(bul("<font color='#4a90c5'><b>Min Volatility</b></font> — самый «спокойный» портфель"))
story.append(bul("<font color='#5fb37e'><b>Max Sharpe</b></font> — лучший по соотношению доходности к риску"))
story.append(bul("<font color='#a8843e'><b>Max Sortino</b></font> — то же, но «не наказывает за рост»"))
story.append(screen("11-frontier-points.png — три точки на frontier", height=4.5 * cm))

story.append(sub("Карточки и таблица"))
story.append(p(
    "Справа от графика — три карточки с подробной раскладкой каждой точки "
    "(Sharpe / Sortino / реализованные return и vol / веса активов)."
))
story.append(screen("12-sim-cards.png — три карточки справа", height=5 * cm))
story.append(p(
    "Ниже под графиком — таблица «Примеры весов портфелей»: несколько образцовых "
    "точек с разной волатильностью, видно как меняется состав вдоль frontier."
))
story.append(screen("13-sim-table.png — таблица примеров", height=4.5 * cm))

# ── 4. Strategies ────────────────────────────────────────────────────────
story.extend(section("Вкладка Strategies", "раздел 4"))
story.append(p(
    "<b>14 моделей построения портфеля</b>, считаются параллельно на одних и тех же "
    "данных. Каждая модель = отдельная философия. Это не «выбери одну», это "
    "research-площадка: «вот что 14 умных подходов сказали»."
))
story.append(screen("14-strategies.png — общий вид Strategies", height=8 * cm))

story.append(sub("Одна карточка модели"))
story.append(screen("15-strategy-card.png — зум одной карточки", height=4.5 * cm))
story.append(p("Каждая карточка содержит:"))
story.append(bul("<b>Название</b> модели + ID (например, <i>MAXSHARPE</i>)"))
story.append(bul("<b>Главная метрика</b> в углу: Sharpe для Max Sharpe, σ для Min Vol и т.п."))
story.append(bul("<b>Три полоски</b> снизу: Return / Vol / Max DD — реализованные характеристики"))
story.append(bul("<b>Раскладка по активам</b> — все веса ≥ 1%, отсортированные по убыванию"))

story.append(sub("Что значат 14 моделей"))
story.append(boxed_table(
    [
        ["Модель", "Идея в одной фразе"],
        ["Market Cap", "По капитализации — пассивный equilibrium"],
        ["Equal Weight", "Поровну — наивный, но устойчивый бенчмарк"],
        ["Min Volatility", "Минимум скачков любой ценой"],
        ["Max Sharpe", "Лучшее «доходность / риск» — классический tangent"],
        ["Max Sortino", "То же, но штрафует только просадки (downside-σ)"],
        ["Risk Parity", "Каждый актив несёт равный риск-вклад"],
        ["Black-Litterman", "Equilibrium-prior + твои views"],
        ["CVaR-Optimal", "Защита от худших дней (минимум CVaR-95)"],
        ["HRP", "Hierarchical Risk Parity, López de Prado — robust к шуму"],
        ["Max Diversification", "Максимум разнообразия (Choueifaty & Coignard)"],
        ["Momentum", "Веса по 200-дневному моментуму"],
        ["Fractional Kelly", "Half-Kelly haircut — осторожный long-term growth"],
        ["Resampled Markowitz", "Усреднение MVO по бутстрапу (Michaud)"],
        ["Final Fund Portfolio", "Реальная композиция: BL → caps → CVaR defense"],
    ],
    col_widths=[5 * cm, CONTENT_W - 5 * cm],
))

story.append(sub("Сравнительная таблица"))
story.append(p(
    "Под карточками — Strategy Comparison: те же 14 моделей одной строкой, со всеми "
    "метриками сразу. Подходит для глубокого сравнения и экспорта."
))
story.append(screen("16-strategy-table.png — сравнительная таблица", height=7 * cm))

story.append(p("Что значат колонки:"))
story.append(boxed_table(
    [
        ["Колонка", "Что"],
        ["RETURN", "Годовая доходность"],
        ["VOL", "Годовая волатильность"],
        ["SHARPE / SORTINO", "Risk-adjusted return метрики"],
        ["MAX DD", "Максимальная историческая просадка"],
        ["CVaR 95% / 99%", "Средняя потеря в худшие 5% / 1% дней"],
        ["CALMAR", "Return / |Max DD| — доходность за просадку"],
        ["ULCER", "Глубина + длительность просадок"],
        ["B-BTC / P-BTC", "Beta и корреляция к BTC (зависимость от ядра рынка)"],
        ["BTC / ETH / ALTS", "Состав по трём группам"],
        ["NOTE", "Описание модели или флаг о применённых caps"],
    ],
    col_widths=[4.5 * cm, CONTENT_W - 4.5 * cm],
))
story.append(Spacer(1, 4))
story.append(pm(
    "В правом верхнем углу таблицы — кнопка <b>Copy CSV</b> для выгрузки в Excel / Sheets. "
    "Клик на строку выбирает стратегию для Stress Test."
))

# ── 5. Risk Caps & Views ─────────────────────────────────────────────────
story.extend(section("Вкладка Risk Caps & Views", "раздел 5"))
story.append(p(
    "<b>Правила игры</b> для оптимизатора. Без них Max Sharpe бы поставил 73% в HYPE — "
    "здесь живёт защита, благодаря которой Final Fund никогда так не делает."
))
story.append(screen("17-risk-caps.png — общий вид Risk Caps", height=8 * cm))

story.append(sub("Recommendation Mode"))
story.append(p("Три preset'а — один клик меняет все настройки под выбранный профиль:"))
story.append(boxed_table(
    [
        ["Mode", "BTC ≤", "CVaR порог", "Sleeves", "Когда выбирать"],
        ["Conservative", "70%", "−6.0%", "5%", "Защитная фаза, осторожные LP"],
        ["Balanced (default)", "65%", "−8.0%", "10%", "Базовый режим"],
        ["Aggressive", "55%", "−10.0%", "10%", "Бычья фаза, искушённые LP"],
    ],
    col_widths=[3.5 * cm, 1.8 * cm, 2.2 * cm, 1.8 * cm, CONTENT_W - 9.3 * cm],
))
story.append(screen("18-modes.png — три карточки Mode", height=4.5 * cm))

story.append(sub("Per-Asset Caps"))
story.append(p(
    "Таблица min/max по каждому активу. <i>«—»</i> в min = «нет минимального лимита, "
    "может быть 0%». Это <b>главная защита</b> от наивной MVO."
))
story.append(screen("19-caps-table.png — таблица Per-Asset Caps", height=6 * cm))

story.append(sub("Aggregate Rules"))
story.append(p(
    "Два слайдера для <b>групповых правил</b>:<br/>"
    "• <b>BTC + ETH Floor</b> — сумма ядра не может быть меньше (защита от ухода в альты)<br/>"
    "• <b>Small Alts Cap</b> — максимум на сумму мелких альтов (защита от 7×5%)"
))
story.append(screen("20-aggregate.png — два слайдера Aggregate Rules", height=3 * cm))

story.append(sub("CVaR-Defense порог"))
story.append(p(
    "Если CVaR-95 финального портфеля окажется глубже этого значения — система "
    "<b>автоматически добавит +10% веса в BTC/ETH</b> из non-core активов. Последний "
    "рубеж защиты от корреляционных хвостов."
))
story.append(screen("21-cvar-defense.png — слайдер CVaR-Defense", height=2.5 * cm))

story.append(sub("Black-Litterman Views"))
story.append(p(
    "Ниже на странице — твои субъективные ожидания по активам. Для каждого:<br/>"
    "• <b>Expected return</b> — какую годовую отдачу ждёшь<br/>"
    "• <b>Confidence</b> — насколько уверен (0–100%)<br/>"
    "• <b>Max weight</b> — твой hard limit<br/><br/>"
    "Чем выше confidence — тем сильнее engine учтёт твой view в Black-Litterman модели."
))
story.append(screen("22-views.png — раздел Views", height=5 * cm))

# ── 6. Stress Test ───────────────────────────────────────────────────────
story.extend(section("Вкладка Stress Test", "раздел 6"))
story.append(p(
    "Проверка устойчивости портфеля к <b>резким шокам</b>. Состоит из исторической "
    "хвостовой статистики (что было) и сценарных шоков (что будет если)."
))
story.append(screen("24-stress.png — вкладка Stress Test целиком", height=8 * cm))

story.append(sub("Карточки исторической статистики"))
story.append(p("Четыре числа сверху:"))
story.append(bul("<b>CVaR-95</b> — средняя потеря в худшие 5% дней"))
story.append(bul("<b>CVaR-99</b> — средняя потеря в худший 1% дней"))
story.append(bul("<b>Worst day</b> — самая большая дневная просадка за бэктест"))
story.append(bul("<b>Max DD</b> — пиковая историческая просадка"))
story.append(screen("26-stress-hist.png — карточки CVaR", height=3.5 * cm))

story.append(sub("Сценарии шоков"))
story.append(p("Три заранее заданных «storyboard-сценария» + кастомный:"))
story.append(boxed_table(
    [
        ["Сценарий", "Описание", "Аналог в истории"],
        ["Moderate bear", "BTC −20%, альты −35..40%", "Q1-2022"],
        ["Severe drawdown", "BTC −40%, альты −60..70%", "Март 2020 / FTX-неделя"],
        ["Idiosyncratic shock", "Один-два актива −50%", "Терра, USDC де-пеггинг"],
        ["Custom", "Задаёшь сам", "Для презентаций инвесторам"],
    ],
    col_widths=[3.8 * cm, 7.5 * cm, CONTENT_W - 11.3 * cm],
))
story.append(screen("27-stress-scenarios.png — сценарии", height=5 * cm))

story.append(sub("Tail-risk contribution"))
story.append(p(
    "Бар-чарт ниже — разложение CVaR-95 по активам: кто исторически больше всех "
    "«болит» в плохие дни. Помогает выявить <b>концентрационный риск</b>."
))
story.append(screen("28-stress-bars.png — бар-чарт contribution", height=4.5 * cm))

# ── 7. Recommended ───────────────────────────────────────────────────────
story.extend(section("Вкладка Recommended", "раздел 7"))
story.append(p(
    "<b>Центральная вкладка платформы.</b> Здесь живёт Final Fund Portfolio и все "
    "артефакты, которые нужны управляющему для принятия решения о ребалансе."
))
story.append(screen("29-recommended.png — верхняя часть Recommended", height=8 * cm))

story.append(sub("Кнопки в шапке справа"))
story.append(screen("30-recommended-buttons.png — три кнопки", height=2.5 * cm))
story.append(bul("<b>Copy JSON</b> — полный snapshot расчёта (для отладки и аудита)"))
story.append(bul("<b>Copy NAV</b> — главная кнопка: JSON в формате админки Криптофонда"))
story.append(bul("<b>Print</b> — PDF cover-page для инвесторов"))
story.append(pm(
    "При нажатии Copy NAV расчёт автоматически записывается в Journal с пометкой "
    "<i>published</i>."
))

story.append(sub("Блоки на странице сверху вниз"))

story.append(micro("Confidence badge"))
story.append(p(
    "Триаж от 0% до 100% по 8 факторам (data quality, model agreement, liquidity и др.):"
))
story.append(bul("<font color='#5fb37e'><b>🟢 High (≥ 70)</b></font> — можно публиковать NAV"))
story.append(bul("<font color='#c9a962'><b>🟡 Medium (40–70)</b></font> — внимательно проверь narrative"))
story.append(bul("<font color='#c9526a'><b>🔴 Low (&lt; 40)</b></font> — не публикуй без ревью комитета"))
story.append(screen("31-confidence.png — Confidence badge", height=4 * cm))

story.append(micro("Why narrative"))
story.append(p(
    "5 параграфов обычным языком — <b>почему</b> такая раскладка. Готовый текст "
    "для отчёта инвесторам, можно копировать."
))
story.append(screen("33-why.png — Why narrative", height=6 * cm))

story.append(micro("Две donut-диаграммы"))
story.append(p(
    "<b>Слева:</b> «Раскладка спот-куска» — веса криптоактивов <i>внутри</i> спот-куска "
    "(сумма = 100% внутри спота, не до 100% фонда).<br/>"
    "<b>Справа:</b> «Полный портфель фонда» — те же позиции + sleeves (Bot, Manual). "
    "Сумма = 100% фонда."
))
story.append(screen("34-donuts.png — две donut-диаграммы", height=6 * cm))
story.append(cap("Например: BTC 71.3% в Spot × 80% sleeve scale = 57.0% всего фонда."))

story.append(micro("Cluster Exposure"))
story.append(p(
    "Распределение по семи кластерам (Core, Infra, High-beta L1, Exchange, Alpha, "
    "Meme, Other). Каждый имеет soft ceiling, цветовая полоска показывает превышение."
))
story.append(screen("35-clusters.png — Cluster Exposure", height=4 * cm))

story.append(micro("Δ vs Live Fund"))
story.append(p(
    "Сравнение <b>target</b> (что engine рекомендует) с <b>live</b> (что в фонде сейчас, "
    "тянем напрямую через <i>pifagor.fund/api/portfolio/public</i>). Таблица по каждому "
    "активу с пометкой BUY / SELL / HOLD (band ±1pp)."
))
story.append(screen("36-delta-fund.png — Δ vs Live Fund таблица", height=5.5 * cm))
story.append(p(
    "Две кнопки сверху блока:<br/>"
    "• <b>Import current</b> — автозаполнить Rebalance Plan живыми весами фонда<br/>"
    "• <b>Refresh</b> — повторный запрос к фонду (60-секундный кеш)"
))

story.append(micro("Rebalance Plan"))
story.append(p(
    "Конкретный план сделок: вводишь текущие веса (или импортируешь), engine считает "
    "delta vs target. Каждая позиция получает <b>action</b> (BUY/SELL/HOLD/WATCH ONLY) "
    "и <b>priority</b> (High/Medium/Low)."
))
story.append(screen("37-rebalance.png — Rebalance Plan таблица", height=5.5 * cm))

story.append(micro("Rotation Suggestions"))
story.append(p(
    "Стратегические тикеты на ротацию из четырёх источников:"
))
story.append(bul("Data quality — короткая история → урезать"))
story.append(bul("Cluster overshoot — превышен soft ceiling сектора"))
story.append(bul("Liquidity tier — актив в red tier → урезать"))
story.append(bul("Core deficit — BTC+ETH ниже floor → добавить"))
story.append(screen("38-rotation.png — Rotation Suggestions", height=4 * cm))

story.append(micro("Watchlist"))
story.append(p(
    "Активы вне портфеля, но под наблюдением. Четыре типа: <i>no-data</i>, "
    "<i>uncategorized</i>, <i>effectively-zero</i>, <i>honorary</i>."
))
story.append(screen("39-watchlist.png — Watchlist", height=4 * cm))

story.append(micro("Liquidity Layer"))
story.append(p(
    "Оценка глубины рынка: USD volume за 30 дней, tier (🔵 blue ≥ $1B, 🟢 green $100M–$1B, "
    "🟡 yellow $10M–$100M, 🔴 red &lt; $10M), max executable ticket (5% от ADV) и basket score."
))
story.append(screen("40-liquidity.png — Liquidity Layer", height=5 * cm))

story.append(micro("Model Contribution"))
story.append(p(
    "Рейтинг 14 моделей по влиянию на финальную композицию. Помогает понять, какая "
    "модель «победила» в синтезе."
))
story.append(screen("41-model-contrib.png — Model Contribution", height=4 * cm))

story.append(micro("Equity curves"))
story.append(p(
    "Две кривые капитала:<br/>"
    "• <b>Backtested</b> — статичные веса весь период (in-sample)<br/>"
    "• <b>Walk-forward</b> — HRP с переобучением каждые N дней (out-of-sample)<br/><br/>"
    "Если walk-forward значительно ниже backtested — модель переобучена (overfit)."
))
story.append(screen("42-equity.png — Equity curves", height=5 * cm))

story.append(micro("«Why this allocation» — 4 reason cards"))
story.append(p("Резюме в четырёх пунктах: BL + tilt, caps applied, CVaR defense, model agreement."))
story.append(screen("43-reasons.png — 4 reason cards", height=4 * cm))

story.append(micro("Disclaimer"))
story.append(pm(
    "Формальное «это internal research, не публичная финансовая рекомендация» — внизу страницы."
))

# ── 8. Journal ───────────────────────────────────────────────────────────
story.extend(section("Вкладка Journal", "раздел 8"))
story.append(p(
    "<b>Audit trail</b> всех расчётов. Каждый Copy NAV автоматически создаёт запись. "
    "Можно сравнивать два run'а, добавлять заметки."
))
story.append(screen("45-journal.png — Journal со списком runs", height=8 * cm))

story.append(sub("Структура одной строки"))
story.append(screen("46-run-row.png — зум на одну строку", height=3 * cm))
story.append(p("Каждая строка содержит:"))
story.append(bul("<b>Дата + время UTC</b> — когда расчёт был сделан"))
story.append(bul("<b>Mode badge</b> — какой режим был активен (Balanced/Conservative/Aggressive)"))
story.append(bul("<b>✓ Published</b> — нажимал ли Copy NAV"))
story.append(bul("<b>hash</b> — детерминированный SHA-256 параметров (одинаковый hash = одинаковые настройки)"))
story.append(bul("<b>conf</b> — Confidence score на момент расчёта"))
story.append(bul("<b>live-mcaps</b> — был ли использован живой market cap snapshot"))
story.append(bul("<b>Веса</b> — все активы ≥ 0.1%, отсортированные по убыванию"))

story.append(sub("Действия над run'ом"))
story.append(screen("47-run-actions.png — кнопки Add note / Compare", height=2.5 * cm))
story.append(bul("<b>Add note</b> — inline-комментарий до 500 символов, например «ребаланс после Q1 отчёта»"))
story.append(bul("<b>Compare</b> — выбери два run'а → diff весов по каждому активу"))

story.append(sub("Compare two runs"))
story.append(screen("48-compare.png — открытое сравнение", height=5 * cm))
story.append(p(
    "Когда выбрал два run'а — появляется таблица «Before / After / Δpp» по каждому активу, "
    "отсортированная по убыванию |Δ|. Видно мгновенно: что изменилось в композиции."
))

# ── 9. Стоп-сигналы ──────────────────────────────────────────────────────
story.extend(section("Стоп-сигналы — когда НЕ публиковать NAV", "раздел 9"))
story.append(p(
    "Если видишь любой из этих признаков — <b>не нажимай Copy NAV</b>. Сначала разберись."
))
story.append(Spacer(1, 8))

story.append(stop("<b>Confidence &lt; 40</b> — серьёзные проблемы с данными или согласием моделей"))
story.append(stop("<b>HYPE в Final Fund &gt; 5%</b> — баг (cap не сработал), репорти разработке"))
story.append(stop("<b>Severe drawdown сценарий показывает потерю &gt; 60%</b> — корзина слишком хрупкая"))
story.append(stop("<b>Basket Liquidity score &lt; 50</b> — корзину невозможно исполнить в нужном объёме"))
story.append(stop("<b>Δ vs Live Fund &gt; 20pp по нескольким позициям</b> — лучше TWAP несколько дней"))
story.append(stop("<b>Walk-forward equity сильно ниже Backtested</b> — модель переобучена"))
story.append(stop("<b>Warning «Не удалось загрузить котировки»</b> на ключевом активе — нет данных"))

story.append(Spacer(1, 10))
story.append(GoldRule())
story.append(Spacer(1, 6))
story.append(pm(
    "Стоп-сигналы — это <b>презумпция осторожности</b>. Они не значат «всё пропало», "
    "они значат «остановись и подумай». Иногда после анализа можно опубликовать с note "
    "в Journal с обоснованием — для аудита."
))

# ── 10. Полезные ссылки ─────────────────────────────────────────────────
story.extend(section("Полезные ссылки", "раздел 10"))

story.append(sub("Production-окружение"))
story.append(p(
    "<b>Research:</b> <font color='#a8843e'>trading-chart-mvp.onrender.com</font><br/>"
    "<b>Криптофонд (publishing NAV):</b> <font color='#a8843e'>pifagor.fund</font><br/>"
    "<b>Админка фонда:</b> <font color='#a8843e'>pifagor.fund/admin</font>"
))

story.append(sub("Документация в репозитории"))
story.append(p(
    "<b>Репозиторий:</b> <font color='#a8843e'>github.com/pifagortradebtc/trading-chart-mvp</font><br/>"
    "<b>Quickstart (5 минут):</b> <i>docs/QUICKSTART.md</i><br/>"
    "<b>Полный гайд с FAQ и глоссарием:</b> <i>docs/USER-GUIDE.md</i><br/>"
    "<b>Этот документ (markdown-исходник):</b> <i>docs/VISUAL-TOUR.md</i>"
))

story.append(sub("Если что-то непонятно"))
story.append(bul("<b>Технические вопросы</b> (баг, странное поведение) — issues на GitHub или к разработке"))
story.append(bul("<b>Бизнес-вопросы</b> (mandate, изменения policy) — комитет фонда"))
story.append(bul("<b>Финансовые термины</b> — глоссарий в <i>docs/USER-GUIDE.md</i>"))

story.append(Spacer(1, 16))
story.append(GoldRule())
story.append(Spacer(1, 8))
story.append(pm(
    "Документ обновляется по мере развития платформы. Текущая версия: 2026-05-20. "
    "По мере появления новых вкладок и метрик — изменения будут отражены здесь и в "
    "<i>HANDOFF.md</i> репозитория."
))

# ─────────────────────────────────────────────────────────────────────────
# Build PDF
# ─────────────────────────────────────────────────────────────────────────


def build():
    out_path = Path(__file__).resolve().parent.parent / "docs" / "Pifagor-Portfolio-Research-Guide.pdf"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title="Pifagor Fund · Portfolio Research — визуальное руководство",
        author="Pifagor Fund",
        subject="UI-walkthrough платформы trading-chart-mvp",
        creator="reportlab + Pifagor Fund toolkit",
    )

    # Frame для всех страниц кроме cover
    content_frame = Frame(
        MARGIN_L,
        MARGIN_B,
        CONTENT_W,
        PAGE_H - MARGIN_T - MARGIN_B,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="content",
    )

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[content_frame], onPage=cover_page),
        PageTemplate(id="content", frames=[content_frame], onPage=content_page),
    ])

    # Сначала пустой spacer чтобы заполнить cover (он рисуется отдельно)
    cover_filler = [Spacer(1, PAGE_H - MARGIN_T - MARGIN_B - 1)]
    final_story = cover_filler + [PageBreak()] + story[1:] if story and isinstance(story[0], PageBreak) else cover_filler + [PageBreak()] + story

    # Заставляем второй страницы и далее использовать content template
    final_story = (
        cover_filler
        + [NextPageTemplate("content"), PageBreak()]
        + (story[1:] if story and isinstance(story[0], PageBreak) else story)
    )

    doc.build(final_story)
    print(f"[OK] PDF created: {out_path}")
    print(f"     Size: {out_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    build()
