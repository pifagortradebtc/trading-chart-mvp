"use client";

import { useMemo } from "react";
import type { TradeRecord } from "@/lib/backtest/types";
import { GlassCard, MetricTile } from "../ui";

export function DcaGridSection({
  trades,
  avgDcaPerTrade,
  maxDcaInTrade,
  fullGridHits,
}: {
  trades: TradeRecord[];
  avgDcaPerTrade: number;
  maxDcaInTrade: number;
  fullGridHits: number;
}) {
  const sample = useMemo(() => {
    if (!trades.length) return null;
    let best = trades[0]!;
    for (const t of trades) {
      if (t.maxDcaIndex > best.maxDcaIndex) best = t;
    }
    return { grid: best.dcaGrid, meta: { id: best.id } };
  }, [trades]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Avg DCA depth (orders)" value={avgDcaPerTrade.toFixed(2)} />
        <MetricTile label="Max DCA depth" value={String(maxDcaInTrade)} />
        <MetricTile label="Full grid hits" value={String(fullGridHits)} />
        <MetricTile
          label="Capital efficiency (proxy)"
          value={fullGridHits === 0 ? "↑ сетка реже исчерпывалась" : "сетка часто полная"}
          sub="Грубый ориентир; полный score — в research engine."
        />
      </div>

      {!sample && (
        <GlassCard className="p-6">
          <p className="text-sm text-[var(--rex-muted)]">Нет сделок для отображения сетки.</p>
        </GlassCard>
      )}

      {sample && (
        <GlassCard glow="violet" className="overflow-hidden p-0">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--rex-text)]">Сетка DCA (образец)</h3>
            <p className="mt-1 text-xs text-[var(--rex-muted)]">
              Показана сетка сделки с максимальной глубиной DCA (#{sample.meta.id}). Уровни совпадают с
              конфигурацией на момент входа.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-[var(--rex-muted)]">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Цена</th>
                  <th className="px-3 py-2">Размер USDT</th>
                  <th className="px-3 py-2">Кум. нотионал</th>
                  <th className="px-3 py-2">Средняя</th>
                  <th className="px-3 py-2">TP цена</th>
                  <th className="px-3 py-2">~Ликвидация</th>
                  <th className="px-3 py-2">Маржа</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-xs">
                {sample.grid.rows.map((r) => (
                  <tr key={r.orderIndex} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-cyan-300">{r.orderIndex}</td>
                    <td className="px-3 py-2">{r.price.toFixed(4)}</td>
                    <td className="px-3 py-2">{r.orderUsdt.toFixed(2)}</td>
                    <td className="px-3 py-2">{r.cumNotionalUsdt.toFixed(2)}</td>
                    <td className="px-3 py-2">{r.avgPrice.toFixed(4)}</td>
                    <td className="px-3 py-2 text-emerald-300/90">{r.takeProfitPrice.toFixed(4)}</td>
                    <td className="px-3 py-2 text-rose-300/90">{r.approxLiquidationPrice.toFixed(4)}</td>
                    <td className="px-3 py-2">{r.marginUsedUsdt.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
