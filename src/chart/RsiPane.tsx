"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  createChart,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { useChartRuntime } from "@/chart/ChartRuntimeContext";
import { useMarketStore } from "@/store/useMarketStore";
import { useIndicatorStore } from "@/store/useIndicatorStore";
import { rsi as computeRsi } from "@/lib/indicators/math";

/** RSI sub-pane (canvas) — time axis synced with main chart only. */
export function RsiPane() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const { chart: mainChart } = useChartRuntime();
  const candles = useMarketStore((s) => s.candles);
  const instances = useIndicatorStore((s) => s.instances);
  const rsiInst = instances.find((i) => i.pluginId === "rsi");

  const rsiData = useMemo(() => {
    if (!rsiInst?.visible || candles.length < 3) return [];
    const period = Math.max(2, Math.floor(rsiInst.params.period ?? 14));
    return computeRsi(candles, period)
      .filter((x): x is { time: number; value: number } => x.value != null)
      .map((x) => ({ time: x.time as Time, value: x.value }));
  }, [candles, rsiInst]);

  /* Mount RSI chart */
  useEffect(() => {
    if (!rsiInst?.visible) {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      return;
    }

    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0c0e14" },
        textColor: "#787b86",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(54, 58, 69, 0.35)" },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: {
          width: 1,
          color: "#758696",
          style: LineStyle.LargeDashed,
          labelBackgroundColor: "#2a2e39",
        },
      },
      rightPriceScale: {
        borderColor: "#2e3241",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        visible: false,
        borderColor: "#2e3241",
      },
    });

    const series = chart.addLineSeries({
      color: "#9ccc65",
      lineWidth: 1,
      priceScaleId: "right",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    series.setData(rsiData);

    chart.priceScale("right").applyOptions({
      mode: PriceScaleMode.Normal,
    });

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      chartRef.current.applyOptions({ width: r.width, height: r.height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // rsiData updates handled in the following effect — avoid remounting chart each tick
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount chart only when RSI pane visibility toggles
  }, [rsiInst?.visible]);

  /* Push computed RSI */
  useEffect(() => {
    if (!seriesRef.current || !rsiInst?.visible) return;
    seriesRef.current.setData(rsiData);
  }, [rsiData, rsiInst?.visible]);

  /* Sync visible time range with main chart */
  useEffect(() => {
    const rsiChart = chartRef.current;
    if (!mainChart || !rsiChart || !rsiInst?.visible) return;

    const sync = () => {
      const r = mainChart.timeScale().getVisibleRange();
      if (r) rsiChart.timeScale().setVisibleRange(r);
    };

    sync();
    mainChart.timeScale().subscribeVisibleTimeRangeChange(sync);
    return () => {
      mainChart.timeScale().unsubscribeVisibleTimeRangeChange(sync);
    };
  }, [mainChart, rsiInst?.visible]);

  if (!rsiInst?.visible) return null;

  return (
    <div
      ref={wrapRef}
      className="h-[88px] min-h-[88px] w-full shrink-0 border-t border-[#2e3241] bg-[#0c0e14]"
    />
  );
}
