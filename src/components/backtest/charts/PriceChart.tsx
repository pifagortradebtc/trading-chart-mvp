"use client";

import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/types/candle";
import type { TradeRecord } from "@/lib/backtest/types";

interface Props {
  candles: Candle[];
  trades: TradeRecord[];
  /** Для производительности отображаем последние N баров */
  maxBars?: number;
  height?: number;
}

export function PriceChart({ candles, trades, maxBars = 4000, height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0c0e14" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#2e3241" },
        horzLines: { color: "#2e3241" },
      },
      rightPriceScale: { borderColor: "#2e3241" },
      timeScale: { borderColor: "#2e3241" },
    });
    chartRef.current = chart;
    const cs = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    seriesRef.current = cs;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    chart.applyOptions({ width: containerRef.current.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    const slice = candles.length > maxBars ? candles.slice(-maxBars) : candles;
    const data = slice.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(data);

    const markers: import("lightweight-charts").SeriesMarker<UTCTimestamp>[] = [];
    for (const tr of trades) {
      const ent = Math.floor(tr.entryTime / 1000) as UTCTimestamp;
      markers.push({
        time: ent,
        position: tr.side === "long" ? "belowBar" : "aboveBar",
        color: tr.side === "long" ? "#22c55e" : "#f97316",
        shape: tr.side === "long" ? "arrowUp" : "arrowDown",
        text: `${tr.side === "long" ? "L" : "S"}${tr.id}`,
      });
    }
    seriesRef.current.setMarkers(markers);
  }, [candles, trades, maxBars]);

  const hidden = candles.length > maxBars;

  return (
    <div className="space-y-2">
      {hidden && (
        <p className="text-xs text-amber-500/90">
          На графике последние {maxBars} баров из {candles.length} для скорости отрисовки.
        </p>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-[#2e3241] bg-[#0c0e14]"
      />
    </div>
  );
}
