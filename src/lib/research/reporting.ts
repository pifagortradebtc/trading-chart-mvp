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
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function exportEquityCsv(equity: EquityPoint[]): string {
  const headers = ["timeMs", "equity", "drawdownPct", "peakEquity"];
  const rows = equity.map(
    (p) =>
      `${p.time},${p.equity},${p.drawdownPct},${p.peakEquity}`,
  );
  return [headers.join(","), ...rows].join("\n");
}

export function exportSettingsJson(settings: BacktestSettings): string {
  return JSON.stringify(settings, null, 2);
}
