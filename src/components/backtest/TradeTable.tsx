"use client";

import type { TradeRecord } from "@/lib/backtest/types";

const fmt = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").slice(0, 19);

export function TradeTable({
  trades,
  onSelect,
  onOpenChart,
}: {
  trades: TradeRecord[];
  onSelect: (t: TradeRecord) => void;
  /** Открыть терминал графика с горизонтальными уровнями DCA */
  onOpenChart?: (t: TradeRecord) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#2e3241]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#131722] text-xs uppercase tracking-wide text-[#787b86]">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Вход</th>
            <th className="px-3 py-2">Выход</th>
            <th className="px-3 py-2">Пара</th>
            <th className="px-3 py-2">Сторона</th>
            <th className="px-3 py-2">Режим</th>
            <th className="px-3 py-2">1-й вход</th>
            <th className="px-3 py-2">Средняя</th>
            <th className="px-3 py-2">DCA max</th>
            <th className="px-3 py-2">Просадка %</th>
            <th className="px-3 py-2">PnL USDT</th>
            <th className="px-3 py-2">PnL % маржи</th>
            <th className="px-3 py-2">Комиссии</th>
            <th className="px-3 py-2">Выход</th>
            <th className="px-3 py-2">Длительность</th>
            {onOpenChart ? <th className="px-3 py-2">График</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2e3241]">
          {trades.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer hover:bg-[#1e222d]/80"
              onClick={() => onSelect(t)}
            >
              <td className="px-3 py-2 font-mono text-[#2962ff]">{t.id}</td>
              <td className="px-3 py-2 font-mono text-xs">{fmt(t.entryTime)}</td>
              <td className="px-3 py-2 font-mono text-xs">{fmt(t.exitTime)}</td>
              <td className="px-3 py-2">{t.symbol}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    t.side === "long" ? "text-emerald-400" : "text-orange-400"
                  }
                >
                  {t.side.toUpperCase()}
                </span>
              </td>
              <td className="px-3 py-2">{t.regime}</td>
              <td className="px-3 py-2 font-mono">{t.firstEntryPrice.toFixed(4)}</td>
              <td className="px-3 py-2 font-mono">{t.avgEntryPrice.toFixed(4)}</td>
              <td className="px-3 py-2">{t.maxDcaIndex}</td>
              <td className="px-3 py-2 text-amber-400/90">{t.maxDrawdownPct.toFixed(2)}</td>
              <td
                className={`px-3 py-2 font-mono ${t.pnlUsdt >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {t.pnlUsdt.toFixed(2)}
              </td>
              <td className="px-3 py-2 font-mono">{t.pnlPctOnMargin.toFixed(2)}</td>
              <td className="px-3 py-2 font-mono text-[#787b86]">{t.feesUsdt.toFixed(4)}</td>
              <td className="px-3 py-2 text-xs">{t.exitReason}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {(t.durationMs / 3600000).toFixed(1)} ч
              </td>
              {onOpenChart ? (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="rounded-lg bg-sky-900/80 px-2 py-1 text-xs font-medium text-sky-100 hover:bg-sky-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChart(t);
                    }}
                  >
                    На графике
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length === 0 && (
        <p className="p-6 text-center text-[#787b86]">Нет сделок для выбранных параметров.</p>
      )}
    </div>
  );
}
