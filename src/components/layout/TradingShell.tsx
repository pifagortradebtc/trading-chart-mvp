"use client";

import { TopBar } from "@/components/panels/TopBar";
import { LeftToolbar } from "@/components/panels/LeftToolbar";
import { RightSidebar } from "@/components/panels/RightSidebar";
import { ChartWorkspace } from "@/components/chart/ChartWorkspace";
import { IndicatorSettingsModal } from "@/components/modals/IndicatorSettingsModal";
import { useIndicatorStore } from "@/store/useIndicatorStore";

export function TradingShell() {
  const openSettings = useIndicatorStore((s) => s.openSettings);

  return (
    <div className="flex h-screen min-h-[480px] flex-col bg-tv-bg text-tv-text">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftToolbar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-3">
            <button
              type="button"
              onClick={() => openSettings(null)}
              className="rounded bg-tv-toolbar px-3 py-1.5 text-xs font-medium text-tv-text hover:bg-tv-toolbar/80"
            >
              Indicators
            </button>
            <span className="text-xs text-tv-muted">
              Canvas engine · Mock OHLC · Extensible indicators
            </span>
          </div>
          <ChartWorkspace />
        </div>
        <RightSidebar />
      </div>
      <IndicatorSettingsModal />
    </div>
  );
}
