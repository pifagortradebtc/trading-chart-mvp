/**
 * Экспорт отчётностей (CSV/JSON) без изменения движка бэктеста.
 */

import type { BacktestSettings, EquityPoint, TradeRecord } from "@/lib/backtest/types";

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * SECURITY: экранирование ячейки CSV + защита от formula-injection.
 *
 * Сейчас все поля экспорта внутренние (enum exitReason, валидированный symbol,
 * числа), поэтому это defense-in-depth. Но если в будущем в CSV попадёт
 * свободный текст (note, имя пары из стороннего источника) — без экранирования
 * значение вида `=HYPERLINK(...)` или `+cmd|...` исполнится при открытии файла
 * в Excel/Google Sheets (CSV/formula injection).
 *
 * Правила:
 *   - значение, начинающееся с = + - @ или управляющего символа (TAB/CR/LF),
 *     префиксуется одинарной кавычкой → Excel трактует как текст, не формулу;
 *   - значения с , " \n \r оборачиваются в кавычки, внутренние " удваиваются.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportTradesCsv(trades: TradeRecord[]): string {
  const headers = [
    "id",
    "symbol",
    "side",
    "regime",
    "entryTime",
    "exitTime",
    "firstEntryPrice",
    "avgEntryPrice",
    "exitPrice",
    "maxDcaIndex",
    "maxDrawdownPct",
    "pnlUsdt",
    "feesUsdt",
    "exitReason",
    "durationMs",
  ];
  const rows = trades.map((t) =>
    [
      t.id,
      t.symbol,
      t.side,
      t.regime,
      t.entryTime,
      t.exitTime,
      t.firstEntryPrice,
      t.avgEntryPrice,
      t.exitPrice,
      t.maxDcaIndex,
      t.maxDrawdownPct,
      t.pnlUsdt,
      t.feesUsdt,
      t.exitReason,
      t.durationMs,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.map(csvCell).join(","), ...rows].join("\n");
}

export function exportEquityCsv(equity: EquityPoint[]): string {
  const headers = ["timeMs", "equity", "drawdownPct", "peakEquity"];
  const rows = equity.map((p) =>
    [p.time, p.equity, p.drawdownPct, p.peakEquity].map(csvCell).join(","),
  );
  return [headers.map(csvCell).join(","), ...rows].join("\n");
}

export function exportSettingsJson(settings: BacktestSettings): string {
  return JSON.stringify(settings, null, 2);
}
