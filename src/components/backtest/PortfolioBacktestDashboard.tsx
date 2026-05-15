"use client";

import { useMemo, useState } from "react";
import type { PortfolioBacktestResult, PortfolioSymbolResult } from "@/lib/backtest/portfolioAltsTypes";
import { EquityCurve } from "./charts/EquityCurve";

function fmtUsdt(n: number): string {
  const sign = n >= 0 ? "" : "−";
  return `${sign}${Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function fmtDays(ms: number): string {
  const d = ms / (24 * 3600 * 1000);
  if (d >= 100) return `${d.toFixed(0)} д`;
  if (d >= 1) return `${d.toFixed(1)} д`;
  return `${(ms / 3600000).toFixed(1)} ч`;
}

function pnlClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-[#d1d4dc]";
}

function Kpi({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-[#2e3241] bg-[#131722] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#787b86]">{label}</div>
      <div className={`mt-1 font-mono text-xl ${valueClass ?? "text-[#d1d4dc]"}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-[#787b86]">{sub}</div> : null}
    </div>
  );
}

type SortKey = "pnl" | "trades" | "dd" | "duration";
type OpenSortKey =
  | "unrealized"
  | "dd"
  | "duration"
  | "entries"
  | "avgEntry"
  | "mark"
  | "coin";

export function PortfolioBacktestDashboard({ result }: { result: PortfolioBacktestResult }) {
  const { summary, symbols, combinedEquity } = result;
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [openSortKey, setOpenSortKey] = useState<OpenSortKey>("unrealized");
  const [showSkipped, setShowSkipped] = useState(false);

  const sorted = useMemo(() => {
    const list = showSkipped ? symbols : symbols.filter((s) => s.status === "ok");
    return [...list].sort((a, b) => {
      const ma = a.metrics;
      const mb = b.metrics;
      switch (sortKey) {
        case "trades":
          return (mb?.trades ?? 0) - (ma?.trades ?? 0);
        case "dd":
          return (mb?.maxEquityDrawdownPct ?? 0) - (ma?.maxEquityDrawdownPct ?? 0);
        case "duration":
          return (mb?.avgTradeDurationMs ?? 0) - (ma?.avgTradeDurationMs ?? 0);
        default:
          return (mb?.totalPnlUsdt ?? 0) - (ma?.totalPnlUsdt ?? 0);
      }
    });
  }, [symbols, sortKey, showSkipped]);

  const openRows = useMemo(() => {
    const list = symbols.filter((s) => s.openPositionAtDataEnd);
    return [...list].sort((a, b) => {
      const pa = a.openPositionAtDataEnd!;
      const pb = b.openPositionAtDataEnd!;
      switch (openSortKey) {
        case "coin":
          return a.label.localeCompare(b.label);
        case "avgEntry":
          return pb.avgEntryPrice - pa.avgEntryPrice;
        case "mark":
          return pb.markPrice - pa.markPrice;
        case "dd":
          return pb.maxDrawdownPct - pa.maxDrawdownPct;
        case "duration":
          return pb.durationMs - pa.durationMs;
        case "entries":
          return pb.filledLevels - pa.filledLevels;
        default:
          return pb.unrealizedPnlPctOnMargin - pa.unrealizedPnlPctOnMargin;
      }
    });
  }, [symbols, openSortKey]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
        Портфельный режим: на <strong>каждую</strong> монету депозит{" "}
        <span className="font-mono">{summary.depositPerSymbolUsdt.toLocaleString("ru-RU")} USDT</span> и вход{" "}
        <span className="font-mono">{summary.entryNotionalPerSymbolUsdt.toLocaleString("ru-RU")} USDT</span> (
        суммарный капитал{" "}
        <span className="font-mono">{summary.totalDepositUsdt.toLocaleString("ru-RU")} USDT</span> по{" "}
        {summary.symbolsOk} монетам). OHLCV из кеша:{" "}
        {summary.ohlcvLoads.fromIdb + summary.ohlcvLoads.fromServerDisk} / {summary.symbolsOk}{" "}
        (браузер {summary.ohlcvLoads.fromIdb}, диск сервера {summary.ohlcvLoads.fromServerDisk}).
        Закрытие +100%: {summary.closewhen100 ? "включено" : "выключено"}.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi
          label="Итоговый PnL"
          value={`${fmtUsdt(summary.totalPnlUsdt)} USDT`}
          sub={fmtPct(summary.totalReturnPct)}
          valueClass={pnlClass(summary.totalPnlUsdt)}
        />
        <Kpi
          label="Финальная equity"
          value={`${fmtUsdt(summary.finalEquityUsdt)} USDT`}
        />
        <Kpi
          label="Max DD (весь депозит)"
          value={`${summary.maxEquityDrawdownPct.toFixed(2)}%`}
          valueClass="text-amber-300"
        />
        <Kpi label="Сделок всего" value={summary.totalTrades} sub={`закрыто ${summary.closedTrades}`} />
        <Kpi
          label="Win rate"
          value={`${summary.winRatePct.toFixed(1)}%`}
        />
        <Kpi
          label="Средняя длительность"
          value={fmtDays(summary.avgTradeDurationMs)}
          sub={`макс ${fmtDays(summary.maxTradeDurationMs)}`}
        />
      </div>

      <div className="rounded-xl border border-[#2e3241] bg-[#131722] p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#787b86]">
          Совокупная equity ({summary.interval}, {summary.yearsBack} лет)
        </div>
        <EquityCurve data={combinedEquity} height={280} />
      </div>

      {openRows.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
              Открытые позиции на конец данных ({openRows.length})
            </h3>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 text-sm text-[#d1d4dc]"
              value={openSortKey}
              onChange={(e) => setOpenSortKey(e.target.value as OpenSortKey)}
            >
              <option value="unrealized">Сортировка: unrealized PnL</option>
              <option value="dd">Сортировка: DD позиции</option>
              <option value="duration">Сортировка: длительность</option>
              <option value="entries">Сортировка: входов</option>
              <option value="avgEntry">Сортировка: средняя входа</option>
              <option value="mark">Сортировка: mark</option>
              <option value="coin">Сортировка: монета (A→Z)</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#2e3241]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#0c0e14] text-[11px] uppercase tracking-wide text-[#787b86]">
                <tr>
                  <th className="px-3 py-2">Монета</th>
                  <th className="px-3 py-2">Средняя входа</th>
                  <th className="px-3 py-2">Mark</th>
                  <th className="px-3 py-2">Unrealized</th>
                  <th className="px-3 py-2">DD позиции</th>
                  <th className="px-3 py-2">Длительность</th>
                  <th className="px-3 py-2" title="Сколько раз сработал сигнал enter (по $5k каждый)">
                    Входов
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2e3241]">
                {openRows.map((row) => {
                  const pos = row.openPositionAtDataEnd!;
                  return (
                    <tr key={row.symbol} className="text-[#d1d4dc]">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 font-mono text-xs">{pos.avgEntryPrice.toFixed(6)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{pos.markPrice.toFixed(6)}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${pnlClass(pos.unrealizedPnlPctOnMargin)}`}>
                        {fmtPct(pos.unrealizedPnlPctOnMargin)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-amber-300">
                        {pos.maxDrawdownPct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtDays(pos.durationMs)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{pos.filledLevels}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
            PnL по монетам
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-[#787b86]">
              <input
                type="checkbox"
                checked={showSkipped}
                onChange={(e) => setShowSkipped(e.target.checked)}
                className="rounded border-[#2e3241]"
              />
              Показать пропущенные
            </label>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 text-[#d1d4dc]"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="pnl">Сортировка: PnL</option>
              <option value="trades">Сортировка: сделки</option>
              <option value="dd">Сортировка: max DD</option>
              <option value="duration">Сортировка: длительность</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#2e3241]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#0c0e14] text-[11px] uppercase tracking-wide text-[#787b86]">
              <tr>
                <th className="px-3 py-2">Монета</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">PnL USDT</th>
                <th className="px-3 py-2">Return</th>
                <th className="px-3 py-2">Сделок</th>
                <th className="px-3 py-2">Win%</th>
                <th className="px-3 py-2">Max DD</th>
                <th className="px-3 py-2">Avg hold</th>
                <th className="px-3 py-2">Баров</th>
                <th className="px-3 py-2">Примечание</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2e3241]">
              {sorted.map((row) => (
                <SymbolRow key={row.symbol} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SymbolRow({ row }: { row: PortfolioSymbolResult }) {
  const m = row.metrics;
  const statusLabel =
    row.status === "ok" ? "OK" : row.status === "skipped" ? "Пропуск" : "Ошибка";
  const statusClass =
    row.status === "ok"
      ? "text-emerald-400"
      : row.status === "skipped"
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <tr className="text-[#d1d4dc]">
      <td className="px-3 py-2 font-medium">{row.label}</td>
      <td className={`px-3 py-2 text-xs ${statusClass}`}>{statusLabel}</td>
      <td className={`px-3 py-2 font-mono text-xs ${pnlClass(m?.totalPnlUsdt ?? 0)}`}>
        {m ? fmtUsdt(m.totalPnlUsdt) : "—"}
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${pnlClass(m?.totalReturnPct ?? 0)}`}>
        {m ? fmtPct(m.totalReturnPct) : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{m?.trades ?? "—"}</td>
      <td className="px-3 py-2 font-mono text-xs">
        {m && m.closedTrades > 0 ? `${m.winRatePct.toFixed(0)}%` : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-amber-300">
        {m ? `${m.maxEquityDrawdownPct.toFixed(1)}%` : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {m && m.avgTradeDurationMs > 0 ? fmtDays(m.avgTradeDurationMs) : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{row.candleCount || "—"}</td>
      <td className="max-w-xs px-3 py-2 text-xs text-[#787b86]">
        {row.error ?? row.warning ?? (row.openPositionAtDataEnd ? "открыта позиция" : "")}
      </td>
    </tr>
  );
}
