"use client";

import { usePathname } from "next/navigation";
import { ChartHost } from "@/chart/ChartHost";
import { DrawingLayer } from "@/chart/DrawingLayer";
import { RsiPane } from "@/chart/RsiPane";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

/** Main chart area: isolated LWC mount + overlay canvas + optional RSI pane. */
export function ChartWorkspace() {
  const pathname = usePathname();
  const cleanChart = useBacktestOverlayStore((s) => s.cleanChartUi);
  /** Маршрут `/chart` — только график бэктеста, без RSI и рисования. */
  const minimal = cleanChart || pathname === "/chart";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <ChartHost>
          {!minimal ? <DrawingLayer /> : null}
        </ChartHost>
      </div>
      {!minimal ? <RsiPane /> : null}
    </div>
  );
}
