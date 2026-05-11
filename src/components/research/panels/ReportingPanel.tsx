"use client";

import type { BacktestSettings } from "@/lib/backtest/types";
import type { EquityPoint, TradeRecord } from "@/lib/backtest/types";
import {
  downloadBlob,
  exportEquityCsv,
  exportSettingsJson,
  exportTradesCsv,
} from "@/lib/research/reporting";
import { GlassCard } from "../ui";

export function ReportingPanel({
  trades,
  equity,
  settings,
  symbol,
  interval,
  onImportSettings,
}: {
  trades: TradeRecord[];
  equity: EquityPoint[];
  settings: BacktestSettings;
  symbol: string;
  interval: string;
  onImportSettings?: (s: BacktestSettings) => void;
}) {
  const stamp = `${symbol}_${interval}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-[var(--rex-text)]">Экспорт и отчёты</h3>
      <p className="mt-2 text-sm text-[var(--rex-muted)]">
        CSV и JSON формируются в браузере. PDF и shareable links — следующий этап (reportingEngine).
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {onImportSettings && (
          <label className="cursor-pointer rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-100 hover:bg-violet-500/20">
            Импорт JSON настроек
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const t = await f.text();
                  const j = JSON.parse(t) as BacktestSettings;
                  if (j?.dca && j?.indicator) onImportSettings(j);
                } catch {
                  /* ignore */
                }
              }}
            />
          </label>
        )}
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm hover:bg-white/[0.08]"
          onClick={() =>
            downloadBlob(`trades_${stamp}.csv`, exportTradesCsv(trades), "text/csv;charset=utf-8")
          }
        >
          Сделки CSV
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm hover:bg-white/[0.08]"
          onClick={() =>
            downloadBlob(`equity_${stamp}.csv`, exportEquityCsv(equity), "text/csv;charset=utf-8")
          }
        >
          Equity CSV
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm hover:bg-white/[0.08]"
          onClick={() =>
            downloadBlob(
              `settings_${stamp}.json`,
              exportSettingsJson(settings),
              "application/json;charset=utf-8",
            )
          }
        >
          Настройки JSON
        </button>
      </div>
    </GlassCard>
  );
}
