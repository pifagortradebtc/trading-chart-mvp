"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, IPriceLine, ISeriesApi, Time } from "lightweight-charts";
import { ChartRuntimeContext } from "@/chart/ChartRuntimeContext";
import { useMarketStore } from "@/store/useMarketStore";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";
import { useIndicatorStore } from "@/store/useIndicatorStore";
import { sma, ema } from "@/lib/indicators/math";
import { buildBacktestChartMarkers } from "@/lib/backtest/chartTradeMarkers";
import {
  buildDcaSegmentSpecs,
  MAX_TRADES_FOR_DCA_SEGMENTS,
} from "@/lib/backtest/chartDcaSegments";
import {
  ALTS_CHART_COLORS,
  buildAltsChartLineData,
} from "@/lib/backtest/chartAltsOverlay";
import { ChartScaleToggle } from "@/components/chart/ChartScaleToggle";

/** Core candlestick + volume + MA overlays. RSI lives in `RsiPane`. Series refs cleaned on unmount. */
export function ChartHost({ children }: { children?: React.ReactNode }) {
  /** Dedicated mount node — LWC must not share DOM with React-managed siblings. */
  const chartMountRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  const candles = useMarketStore((s) => s.candles);
  const symbol = useMarketStore((s) => s.symbol);
  const logScale = useMarketStore((s) => s.logScale);
  const instances = useIndicatorStore((s) => s.instances);
  const pathname = usePathname();
  const overlayLevels = useBacktestOverlayStore((s) => s.levels);
  const cleanChartUi = useBacktestOverlayStore((s) => s.cleanChartUi);
  const sessionTrades = useBacktestOverlayStore((s) => s.sessionTrades);
  /** Свечи + сделки без EMA/объёма/RSI: режим бэктеста или страница `/chart`. */
  const minimalChartMode = cleanChartUi || pathname === "/chart";

  /** На длинных прогонах отрисовываем последние N сделок (как и отрезки DCA). */
  const sessionTradesChart = useMemo(() => {
    if (sessionTrades.length <= MAX_TRADES_FOR_DCA_SEGMENTS) return sessionTrades;
    return sessionTrades.slice(-MAX_TRADES_FOR_DCA_SEGMENTS);
  }, [sessionTrades]);

  const dcaPriceLinesRef = useRef<IPriceLine[]>([]);
  /** Отрезки уровней DCA (сигнал → выход по TP), без бесконечных горизонталей. */
  const dcaGridSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const altsLineSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  const showAltsChannel = useMemo(
    () =>
      minimalChartMode &&
      sessionTrades.length > 0 &&
      sessionTrades.some((t) => (t.comment ?? "").includes("Pifagor")),
    [minimalChartMode, sessionTrades],
  );

  const altsLineData = useMemo(() => {
    if (!showAltsChannel || candles.length === 0) {
      return { upper: [], lower: [] };
    }
    return buildAltsChartLineData(candles, symbol);
  }, [showAltsChannel, candles, symbol]);

  const tradeMarkers = useMemo(
    () =>
      minimalChartMode && sessionTradesChart.length > 0
        ? buildBacktestChartMarkers(sessionTradesChart)
        : [],
    [minimalChartMode, sessionTradesChart],
  );

  const [ctx, setCtx] = useState<{
    chart: IChartApi | null;
    candleSeries: ISeriesApi<"Candlestick"> | null;
  }>({ chart: null, candleSeries: null });

  const candleData = useMemo(
    () =>
      candles.map((c) => ({
        time: c.time as import("lightweight-charts").Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    [candles],
  );

  const volData = useMemo(
    () =>
      candles.map((c) => ({
        time: c.time as import("lightweight-charts").Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(38, 166, 154, 0.45)"
            : "rgba(239, 83, 80, 0.45)",
      })),
    [candles],
  );

  /* Create chart once */
  useEffect(() => {
    const el = chartMountRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0c0e14" },
        textColor: "#c8cdd9",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(54, 58, 69, 0.55)" },
        horzLines: { color: "rgba(54, 58, 69, 0.55)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: "#758696",
          style: LineStyle.LargeDashed,
          labelBackgroundColor: "#2a2e39",
        },
        horzLine: {
          width: 1,
          color: "#758696",
          style: LineStyle.LargeDashed,
          labelBackgroundColor: "#2a2e39",
        },
      },
      rightPriceScale: {
        borderColor: "#2e3241",
        scaleMargins: { top: 0.06, bottom: 0.18 },
      },
      timeScale: {
        borderColor: "#2e3241",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlesSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    const vol = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#26a69a",
    });

    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candlesSeries;
    volRef.current = vol;
    setCtx({ chart, candleSeries: candlesSeries });

    const ro = new ResizeObserver(() => {
      if (!outerRef.current || !chartRef.current) return;
      const r = outerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions({ width: r.width, height: r.height });
    });
    const outerEl = outerRef.current;
    if (outerEl) ro.observe(outerEl);

    return () => {
      ro.disconnect();
      const overlaySeries = indicatorSeriesRef.current;
      overlaySeries.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      });
      overlaySeries.clear();
      dcaGridSeriesRef.current.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      });
      dcaGridSeriesRef.current = [];
      altsLineSeriesRef.current.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      });
      altsLineSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      setCtx({ chart: null, candleSeries: null });
    };
  }, []);

  /* OHLCV data */
  useEffect(() => {
    if (!candleRef.current || !volRef.current) return;
    candleRef.current.setData(candleData);
    volRef.current.setData(volData);
    chartRef.current?.timeScale().fitContent();
  }, [candleData, volData]);

  /** Режим бэктеста: без объёма под свечами — ценовая шкала на всю высоту. */
  useEffect(() => {
    const chart = chartRef.current;
    const vol = volRef.current;
    if (!chart || !vol) return;
    if (minimalChartMode) {
      vol.applyOptions({ visible: false });
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.06, bottom: 0.06 },
      });
    } else {
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.06, bottom: 0.18 },
      });
    }
  }, [minimalChartMode]);

  /* Log scale */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale]);

  /* SMA / EMA overlays + volume visibility */
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const vol = volRef.current;
    if (!chart || !candleSeries || !vol || candles.length === 0) return;

    if (minimalChartMode) {
      vol.applyOptions({ visible: false });
      indicatorSeriesRef.current.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      });
      indicatorSeriesRef.current.clear();
      return;
    }

    indicatorSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s);
      } catch {
        /* ignore */
      }
    });
    indicatorSeriesRef.current.clear();

    const volInst = instances.find((i) => i.pluginId === "volume");
    vol.applyOptions({ visible: volInst?.visible !== false });

    instances.forEach((inst) => {
      if (!inst.visible) return;
      if (inst.pluginId === "volume") return;
      if (inst.pluginId === "rsi") return;

      const period = Math.max(2, Math.floor(inst.params.period ?? 14));
      const raw =
        inst.pluginId === "sma"
          ? sma(candles, period)
          : inst.pluginId === "ema"
            ? ema(candles, period)
            : [];
      if (!raw.length) return;

      const line = chart.addLineSeries({
        color: inst.pluginId === "sma" ? "#ffb74d" : "#b388ff",
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      line.setData(
        raw
          .filter((x): x is { time: number; value: number } => x.value != null)
          .map((x) => ({ time: x.time as Time, value: x.value })),
      );
      indicatorSeriesRef.current.set(inst.id, line);
    });
  }, [candles, instances, minimalChartMode]);

  /** ALTS-канал Pifagor (aaa1 + line_aaa1), как в TradingView. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    altsLineSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s);
      } catch {
        /* ignore */
      }
    });
    altsLineSeriesRef.current = [];

    if (!showAltsChannel || altsLineData.upper.length === 0) return;

    const baseOpts = {
      priceScaleId: "right" as const,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    };

    const upper = chart.addLineSeries({
      ...baseOpts,
      color: ALTS_CHART_COLORS.upper,
      lineWidth: 1,
    });
    upper.setData(altsLineData.upper);

    const lowerGlow = chart.addLineSeries({
      ...baseOpts,
      color: ALTS_CHART_COLORS.lowerGlow,
      lineWidth: 4,
    });
    lowerGlow.setData(altsLineData.lower);

    const lowerCore = chart.addLineSeries({
      ...baseOpts,
      color: ALTS_CHART_COLORS.lowerCore,
      lineWidth: 2,
    });
    lowerCore.setData(altsLineData.lower);

    altsLineSeriesRef.current.push(upper, lowerGlow, lowerCore);
  }, [showAltsChannel, altsLineData]);

  /** Входы и выходы сделок (бэктест). */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    series.setMarkers(tradeMarkers);
  }, [tradeMarkers, candleData]);

  /** Уровни лимитной сетки DCA — только отрезки от сигнала до TP (см. buildDcaSegmentSpecs). */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    dcaGridSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s);
      } catch {
        /* ignore */
      }
    });
    dcaGridSeriesRef.current = [];

    if (!minimalChartMode || sessionTradesChart.length === 0) return;

    const specs = buildDcaSegmentSpecs(sessionTradesChart);
    for (const spec of specs) {
      const line = chart.addLineSeries({
        color: spec.color,
        lineWidth: spec.lineWidth,
        lineStyle: LineStyle.Solid,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      line.setData([
        { time: spec.t0, value: spec.price },
        { time: spec.t1, value: spec.price },
      ]);
      dcaGridSeriesRef.current.push(line);
    }
  }, [sessionTradesChart, candleData, minimalChartMode]);

  /** Горизонтальные линии уровней из стора (обычно пусто в режиме бэктеста). */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    dcaPriceLinesRef.current.forEach((pl) => {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    });
    dcaPriceLinesRef.current = [];

    overlayLevels.forEach((lvl) => {
      const pl = series.createPriceLine({
        price: lvl.price,
        color: lvl.color,
        lineWidth: lvl.kind === "tp" || lvl.kind === "liq" ? 2 : 1,
        lineStyle: lvl.kind === "liq" ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: lvl.label,
      });
      dcaPriceLinesRef.current.push(pl);
    });
  }, [overlayLevels]);

  return (
    <ChartRuntimeContext.Provider value={ctx}>
      <div
        ref={outerRef}
        className="relative h-full min-h-[320px] w-full flex-1"
      >
        <div ref={chartMountRef} className="absolute inset-0" />
        <ChartScaleToggle />
        {children}
      </div>
    </ChartRuntimeContext.Provider>
  );
}
