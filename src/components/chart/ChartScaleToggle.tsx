"use client";

import { useMarketStore } from "@/store/useMarketStore";

/** Переключатель линейной / логарифмической ценовой шкалы — поверх графика справа сверху. */
export function ChartScaleToggle() {
  const logScale = useMarketStore((s) => s.logScale);
  const setLogScale = useMarketStore((s) => s.setLogScale);

  return (
    <div
      className="pointer-events-auto absolute right-14 top-2 z-10 flex overflow-hidden rounded border border-tv-border bg-tv-panel/90 text-[11px] font-medium shadow-sm backdrop-blur-sm"
      role="group"
      aria-label="Масштаб ценовой шкалы"
    >
      <button
        type="button"
        onClick={() => setLogScale(false)}
        aria-pressed={!logScale}
        className={`px-2 py-1 transition-colors ${
          !logScale
            ? "bg-tv-accent text-white"
            : "text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
        }`}
      >
        Lin
      </button>
      <button
        type="button"
        onClick={() => setLogScale(true)}
        aria-pressed={logScale}
        className={`border-l border-tv-border px-2 py-1 transition-colors ${
          logScale
            ? "bg-tv-accent text-white"
            : "text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
        }`}
      >
        Log
      </button>
    </div>
  );
}
