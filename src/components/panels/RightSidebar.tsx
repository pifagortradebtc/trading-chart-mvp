"use client";

import { useMarketStore } from "@/store/useMarketStore";
import { useIndicatorStore } from "@/store/useIndicatorStore";

const WATCH_MOCK = ["BTC-USD", "ETH-USD", "SOL-USD", "XAU-USD"];

export function RightSidebar() {
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const instances = useIndicatorStore((s) => s.instances);
  const toggleVisible = useIndicatorStore((s) => s.toggleVisible);
  const remove = useIndicatorStore((s) => s.remove);
  const openSettings = useIndicatorStore((s) => s.openSettings);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-l border-tv-border bg-tv-panel">
      <div className="border-b border-tv-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-tv-muted">
        Watchlist
      </div>
      <div className="max-h-[40%] overflow-auto p-2">
        {WATCH_MOCK.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSymbol(s)}
            className={`mb-1 w-full rounded px-2 py-2 text-left text-sm ${
              symbol === s
                ? "bg-tv-accent/25 text-tv-text ring-1 ring-tv-accent/50"
                : "bg-tv-toolbar text-tv-muted hover:bg-tv-toolbar/80 hover:text-tv-text"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="border-t border-tv-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-tv-muted">
        Indicators
      </div>
      <div className="flex-1 overflow-auto p-2">
        {instances.map((ind) => (
          <div
            key={ind.id}
            className="mb-2 flex items-center justify-between gap-2 rounded bg-tv-toolbar px-2 py-1.5 text-xs"
          >
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={ind.visible}
                onChange={() => toggleVisible(ind.id)}
              />
              <span className="uppercase text-tv-text">
                {ind.pluginId}
                {ind.params.period != null && (
                  <span className="text-tv-muted"> ({ind.params.period})</span>
                )}
              </span>
            </label>
            <button
              type="button"
              className="text-tv-muted hover:text-tv-accent"
              title="Settings"
              onClick={() => openSettings(ind.id)}
            >
              ⚙
            </button>
            <button
              type="button"
              className="text-tv-muted hover:text-red-400"
              title="Remove"
              onClick={() => remove(ind.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
