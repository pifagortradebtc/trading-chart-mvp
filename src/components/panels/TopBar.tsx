"use client";

import Link from "next/link";
import { TIMEFRAMES, type Timeframe } from "@/types/candle";
import { useMarketStore } from "@/store/useMarketStore";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

export function TopBar() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const logScale = useMarketStore((s) => s.logScale);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const setTimeframe = useMarketStore((s) => s.setTimeframe);
  const setLogScale = useMarketStore((s) => s.setLogScale);
  const cleanChartUi = useBacktestOverlayStore((s) => s.cleanChartUi);

  if (cleanChartUi) {
    return (
      <header className="flex h-[42px] shrink-0 items-center gap-4 border-b border-tv-border bg-tv-panel px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold uppercase tracking-wide text-tv-text">{symbol}</span>
          <span className="rounded bg-tv-toolbar px-2 py-0.5 text-xs font-medium text-tv-muted">{timeframe}</span>
        </div>
        <span className="text-[11px] text-tv-muted">Пара и ТФ совпадают с бэктестом</span>
        <Link
          href="/backtest"
          className="ml-auto shrink-0 text-xs text-tv-accent underline-offset-2 hover:underline"
        >
          ← Бэктест
        </Link>
      </header>
    );
  }

  return (
    <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="h-8 w-[120px] rounded border border-tv-border bg-tv-toolbar px-2 font-semibold uppercase tracking-wide text-tv-text outline-none focus:border-tv-accent"
          spellCheck={false}
          aria-label="Symbol"
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            onClick={() => setTimeframe(tf.id as Timeframe)}
            className={`shrink-0 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              timeframe === tf.id
                ? "bg-tv-accent text-white"
                : "text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-tv-muted">
        <input
          type="checkbox"
          checked={logScale}
          onChange={(e) => setLogScale(e.target.checked)}
          className="rounded border-tv-border"
        />
        Log
      </label>
    </header>
  );
}
