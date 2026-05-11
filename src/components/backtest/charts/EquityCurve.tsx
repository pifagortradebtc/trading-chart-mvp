"use client";

import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { EquityPoint } from "@/lib/backtest/types";

interface Props {
  data: EquityPoint[];
  liquidations?: { time: number }[];
  height?: number;
}

export function EquityCurve({ data, liquidations = [], height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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

    const eq = chart.addLineSeries({
      color: "#2962ff",
      lineWidth: 2,
    });
    seriesRef.current = eq;

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
    if (!seriesRef.current || !data.length) return;
    const eqPts = data.map((p) => ({
      time: Math.floor(p.time / 1000) as import("lightweight-charts").Time,
      value: p.equity,
    }));
    seriesRef.current.setData(eqPts);

    if (liquidations.length) {
      seriesRef.current.setMarkers(
        liquidations.map((l) => ({
          time: Math.floor(l.time / 1000) as import("lightweight-charts").Time,
          position: "belowBar",
          color: "#ef4444",
          shape: "circle",
          text: "Liq",
        })),
      );
    } else {
      seriesRef.current.setMarkers([]);
    }
  }, [data, liquidations]);

  return <div ref={containerRef} className="w-full rounded-lg border border-[#2e3241] bg-[#0c0e14]" />;
}
