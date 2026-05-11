"use client";

import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { EquityPoint } from "@/lib/backtest/types";

/** Кривая «underwater»: отрицательная просадка от пика эквити, %. */
export function UnderwaterChart({
  equity,
  height = 220,
}: {
  equity: EquityPoint[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.12)" },
        horzLines: { color: "rgba(148,163,184,0.12)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
      timeScale: { borderColor: "rgba(148,163,184,0.2)" },
    });
    chartRef.current = chart;

    const area = chart.addAreaSeries({
      lineColor: "#f43f5e",
      topColor: "rgba(244,63,94,0.35)",
      bottomColor: "rgba(244,63,94,0.02)",
      lineWidth: 2,
    });
    seriesRef.current = area;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
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
    if (!seriesRef.current || !equity.length) return;
    let peak = equity[0]!.equity;
    const pts = equity.map((p) => {
      if (p.equity > peak) peak = p.equity;
      const dd =
        peak > 0 ? -((peak - p.equity) / peak) * 100 : 0;
      return {
        time: Math.floor(p.time / 1000) as import("lightweight-charts").Time,
        value: dd,
      };
    });
    seriesRef.current.setData(pts);
  }, [equity]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--rex-bg-elevated)]"
    />
  );
}
