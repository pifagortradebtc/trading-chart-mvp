"use client";

import Link from "next/link";
import { TopBar } from "@/components/panels/TopBar";
import { LeftToolbar } from "@/components/panels/LeftToolbar";
import { RightSidebar } from "@/components/panels/RightSidebar";
import { ChartWorkspace } from "@/components/chart/ChartWorkspace";
import { ChartOverlaySync } from "@/components/chart/ChartOverlaySync";
import { IndicatorSettingsModal } from "@/components/modals/IndicatorSettingsModal";
import { useIndicatorStore } from "@/store/useIndicatorStore";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

export function TradingShell() {
  const openSettings = useIndicatorStore((s) => s.openSettings);
  const metaTitle = useBacktestOverlayStore((s) => s.metaTitle);
  const clearOverlay = useBacktestOverlayStore((s) => s.clear);

  return (
    <div className="flex h-screen min-h-[480px] flex-col bg-tv-bg text-tv-text">
      <ChartOverlaySync />
      <TopBar />
      {metaTitle ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sky-900/50 bg-sky-950/35 px-3 py-1.5 text-xs text-sky-100">
          <span className="truncate font-medium">{metaTitle}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sky-300/90 sm:inline">
              Зелёный — вход, оранжевый — DCA, голубой — средняя, зелёный TP, красный — ликвидация
            </span>
            <button
              type="button"
              onClick={() => clearOverlay()}
              className="rounded bg-sky-900/80 px-2 py-0.5 hover:bg-sky-800"
            >
              Скрыть уровни
            </button>
            <Link href="/backtest" className="text-sky-300 underline-offset-2 hover:text-white hover:underline">
              Бэктест
            </Link>
          </span>
        </div>
      ) : null}
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
