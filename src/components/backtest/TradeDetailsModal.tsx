"use client";

import { useRouter } from "next/navigation";
import type { Candle } from "@/types/candle";
import type { TradeRecord } from "@/lib/backtest/types";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

function MiniSparkline({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return null;
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 100;
  const h = 48;
  const pts = closes
    .map((v, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="rounded-lg border border-[#2e3241] bg-[#0c0e14] p-3">
      <div className="mb-2 text-xs text-[#787b86]">Цена (close) на участке сделки</div>
      <svg width="100%" height={h + 8} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <polyline
          fill="none"
          stroke="#2962ff"
          strokeWidth="1.5"
          points={pts}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export function TradeDetailsModal({
  trade,
  candles,
  interval,
  onClose,
}: {
  trade: TradeRecord | null;
  candles: Candle[];
  /** Таймфрейм бэктеста (Binance), нужен для загрузки тех же свечей на график */
  interval: string;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!trade) return null;

  const openOnChart = () => {
    useBacktestOverlayStore.getState().openTradeOnChart(trade, trade.symbol, interval);
    router.push("/chart");
    onClose();
  };

  const t0 = trade.entrySignalTime / 1000 - 3600;
  const t1 = trade.exitTime / 1000 + 3600;
  const slice = candles.filter((c) => c.time >= t0 && c.time <= t1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[#2e3241] bg-[#131722] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2e3241] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#d1d4dc]">
            Сделка #{trade.id} · {trade.symbol} · {trade.side.toUpperCase()}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#2e3241] px-3 py-1 text-sm text-[#d1d4dc] hover:bg-[#363a45]"
          >
            Закрыть
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <MiniSparkline candles={slice.length >= 2 ? slice : candles.slice(-200)} />
          <p className="rounded-lg bg-[#0c0e14] p-3 text-[#9ca3af]">
            <span className="text-[#2962ff]">Первый вход:</span> {trade.comment}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric label="Режим" value={trade.regime} />
            <Metric label="Первый вход цена" value={trade.firstEntryPrice.toFixed(6)} />
            <Metric label="Средняя цена" value={trade.avgEntryPrice.toFixed(6)} />
            <Metric label="Выход" value={trade.exitPrice.toFixed(6)} />
            <Metric label="Причина выхода" value={trade.exitReason} />
            <Metric label="PnL USDT" value={trade.pnlUsdt.toFixed(4)} accent />
          </div>

          <h4 className="font-medium text-[#d1d4dc]">
            Лимитная сетка на входе (строки без исполнения приглушены)
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[#2e3241]">
            <table className="min-w-full text-xs">
              <thead className="bg-[#0c0e14] text-[#787b86]">
                <tr>
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Лимит исполнен</th>
                  <th className="px-2 py-2">Цена</th>
                  <th className="px-2 py-2">USDT</th>
                  <th className="px-2 py-2">Монета</th>
                  <th className="px-2 py-2">Σ USDT</th>
                  <th className="px-2 py-2">Средняя</th>
                  <th className="px-2 py-2">TP (от средней)</th>
                  <th className="px-2 py-2">Ликв. ~</th>
                  <th className="px-2 py-2">Просадка %</th>
                  <th className="px-2 py-2">Маржа</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2e3241] font-mono">
                {trade.dcaGrid.rows.map((r) => {
                  const filled = r.orderIndex <= trade.maxDcaIndex;
                  return (
                  <tr
                    key={r.orderIndex}
                    className={filled ? undefined : "opacity-40"}
                  >
                    <td className="px-2 py-1">{r.orderIndex}</td>
                    <td className="px-2 py-1 text-[#9ca3af]">{filled ? "да" : "нет"}</td>
                    <td className="px-2 py-1">{r.price.toFixed(4)}</td>
                    <td className="px-2 py-1">{r.orderUsdt.toFixed(2)}</td>
                    <td className="px-2 py-1">{r.qtyCoin.toFixed(6)}</td>
                    <td className="px-2 py-1">{r.cumNotionalUsdt.toFixed(2)}</td>
                    <td className="px-2 py-1">{r.avgPrice.toFixed(4)}</td>
                    <td className="px-2 py-1 text-emerald-400/90">{r.takeProfitPrice.toFixed(4)}</td>
                    <td className="px-2 py-1 text-red-400/80">{r.approxLiquidationPrice.toFixed(4)}</td>
                    <td className="px-2 py-1 text-amber-400/90">{r.drawdownFromFirstPct.toFixed(2)}</td>
                    <td className="px-2 py-1">{r.marginUsedUsdt.toFixed(2)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#2e3241] bg-[#131722] px-6 py-4">
          <button
            type="button"
            onClick={openOnChart}
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Открыть на графике (уровни DCA, TP, ликвидация)
          </button>
          <p className="flex-1 text-xs text-[#787b86]">
            Подгружаются те же OHLCV, что в бэктесте; на ценовой шкале появятся горизонтальные линии сетки.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[#0c0e14] px-3 py-2">
      <div className="text-[10px] uppercase text-[#787b86]">{label}</div>
      <div className={`font-mono ${accent ? "text-emerald-400" : "text-[#d1d4dc]"}`}>{value}</div>
    </div>
  );
}
