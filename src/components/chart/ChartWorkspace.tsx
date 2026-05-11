"use client";

import { ChartHost } from "@/chart/ChartHost";
import { DrawingLayer } from "@/chart/DrawingLayer";
import { RsiPane } from "@/chart/RsiPane";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

/** Main chart area: isolated LWC mount + overlay canvas + optional RSI pane. */
export function ChartWorkspace() {
  const cleanChart = useBacktestOverlayStore((s) => s.cleanChartUi);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <ChartHost>
          {!cleanChart ? <DrawingLayer /> : null}
        </ChartHost>
      </div>
      {!cleanChart ? <RsiPane /> : null}
    </div>
  );
}
