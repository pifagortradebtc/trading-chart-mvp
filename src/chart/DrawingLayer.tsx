"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChartRuntime } from "@/chart/ChartRuntimeContext";
import { useMarketStore } from "@/store/useMarketStore";
import {
  snapToCandle,
  useDrawingStore,
} from "@/store/useDrawingStore";
import type { DrawingObject, PointT } from "@/types/drawing";
import { hitTestDrawings } from "@/tools/hitTest";

type Draft =
  | { kind: "trend"; a: PointT; b?: PointT }
  | { kind: "hline"; price: number }
  | { kind: "vline"; t: number }
  | { kind: "rect"; a: PointT; b?: PointT }
  | { kind: "fib"; a: PointT; b?: PointT }
  | { kind: "brush"; points: PointT[] };

/** Canvas overlay for drawings — pointer-events only when not using pure cursor (keeps chart wheel zoom). */
export function DrawingLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Draft | null>(null);
  const rafRef = useRef<number>(0);

  const { chart, candleSeries } = useChartRuntime();
  const candles = useMarketStore((s) => s.candles);
  const activeTool = useDrawingStore((s) => s.activeTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const objects = useDrawingStore((s) => s.objects);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const pushUndoSnapshot = useDrawingStore((s) => s.pushUndoSnapshot);
  const addObject = useDrawingStore((s) => s.addObject);
  const select = useDrawingStore((s) => s.select);
  const removeObject = useDrawingStore((s) => s.removeObject);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !candleSeries) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width,
      h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const timeToX = (t: number) => chart.timeScale().timeToCoordinate(t as never);
    const priceToY = (p: number) => candleSeries.priceToCoordinate(p);

    ctx.strokeStyle = "#2962ff";
    ctx.fillStyle = "rgba(41, 98, 255, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';

    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      dash?: boolean,
    ) => {
      ctx.beginPath();
      ctx.setLineDash(dash ? [4, 4] : []);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawObj = (d: DrawingObject, alpha = 1) => {
      ctx.globalAlpha = alpha;
      const sel = d.id === selectedId;
      ctx.strokeStyle = sel ? "#ffd54f" : "#2962ff";

      if (d.kind === "trend" || d.kind === "fib") {
        const x1 = timeToX(d.a.t),
          y1 = priceToY(d.a.p);
        const x2 = timeToX(d.b.t),
          y2 = priceToY(d.b.p);
        if (
          x1 != null &&
          y1 != null &&
          x2 != null &&
          y2 != null
        ) {
          if (d.kind === "trend") line(x1, y1, x2, y2);
          else {
            const low = Math.min(d.a.p, d.b.p),
              high = Math.max(d.a.p, d.b.p);
            const rng = high - low || 1;
            const lvls = [0, 0.236, 0.382, 0.5, 0.618, 1];
            ctx.strokeStyle = sel ? "#ffd54f" : "#787b86";
            lvls.forEach((lv) => {
              const pr = high - rng * lv;
              const yy = priceToY(pr);
              if (yy != null && x1 != null && x2 != null) {
                line(Math.min(x1, x2), yy, Math.max(x1, x2), yy, true);
                ctx.fillStyle = "#787b86";
                ctx.fillText(`${(lv * 100).toFixed(1)}%`, Math.min(x1, x2) + 4, yy - 2);
              }
            });
          }
        }
      }
      if (d.kind === "hline") {
        const y = priceToY(d.price);
        if (y != null) line(0, y, w, y, true);
      }
      if (d.kind === "vline") {
        const x = timeToX(d.t);
        if (x != null) line(x, 0, x, h, true);
      }
      if (d.kind === "rect") {
        const x1 = timeToX(d.a.t),
          y1 = priceToY(d.a.p);
        const x2 = timeToX(d.b.t),
          y2 = priceToY(d.b.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          const l = Math.min(x1, x2),
            t = Math.min(y1, y2),
            rw = Math.abs(x2 - x1),
            rh = Math.abs(y2 - y1);
          ctx.fillStyle = "rgba(41, 98, 255, 0.12)";
          ctx.fillRect(l, t, rw, rh);
          ctx.strokeRect(l, t, rw, rh);
        }
      }
      if (d.kind === "brush" && d.points.length > 1) {
        ctx.beginPath();
        d.points.forEach((pt, i) => {
          const x = timeToX(pt.t),
            y = priceToY(pt.p);
          if (x == null || y == null) return;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#2962ff";
    };

    objects.forEach((o) => drawObj(o));
    ctx.strokeStyle = "#2962ff";

    const draft = draftRef.current;
    if (draft) {
      ctx.setLineDash([5, 5]);
      if (draft.kind === "trend" && draft.a && draft.b) {
        const x1 = timeToX(draft.a.t),
          y1 = priceToY(draft.a.p);
        const x2 = timeToX(draft.b.t),
          y2 = priceToY(draft.b.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null)
          line(x1, y1, x2, y2);
      }
      if (draft.kind === "rect" && draft.a && draft.b) {
        const x1 = timeToX(draft.a.t),
          y1 = priceToY(draft.a.p);
        const x2 = timeToX(draft.b.t),
          y2 = priceToY(draft.b.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          const l = Math.min(x1, x2),
            t = Math.min(y1, y2),
            rw = Math.abs(x2 - x1),
            rh = Math.abs(y2 - y1);
          ctx.strokeRect(l, t, rw, rh);
        }
      }
      if (draft.kind === "fib" && draft.a && draft.b) drawObj(
        {
          id: "_",
          kind: "fib",
          a: draft.a,
          b: draft.b,
        },
        0.7,
      );
      if (draft.kind === "brush" && draft.points.length) {
        ctx.beginPath();
        draft.points.forEach((pt, i) => {
          const x = timeToX(pt.t),
            y = priceToY(pt.p);
          if (x == null || y == null) return;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [chart, candleSeries, objects, selectedId]);

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redraw);
  }, [redraw]);

  useEffect(() => {
    scheduleRedraw();
  }, [scheduleRedraw, objects, selectedId, chart, candleSeries]);

  useEffect(() => {
    if (!chart) return;
    const sub = () => scheduleRedraw();
    chart.timeScale().subscribeVisibleTimeRangeChange(sub);
    return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(sub);
  }, [chart, scheduleRedraw]);

  useEffect(() => {
    window.addEventListener("resize", scheduleRedraw);
    return () => window.removeEventListener("resize", scheduleRedraw);
  }, [scheduleRedraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          pushUndoSnapshot();
          removeObject(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, pushUndoSnapshot, removeObject]);

  function uid() {
    return `dr_${Math.random().toString(36).slice(2, 11)}`;
  }

  function priceAtY(py: number): number | null {
    const raw = candleSeries!.coordinateToPrice(py);
    if (raw === null || raw === undefined) return null;
    return typeof raw === "number" ? raw : Number(raw);
  }

  function snap(px: number, py: number, t: number, p: number) {
    if (!magnet || !candles.length) return { t, p };
    const pySnap = snapToCandle(candles, t, p, 6, (price) =>
      candleSeries ? candleSeries.priceToCoordinate(price) : null,
    );
    return { t, p: pySnap };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!chart || !candleSeries || activeTool === "cursor") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left,
      py = e.clientY - rect.top;
    let t = chart.timeScale().coordinateToTime(px as never) as number | null;
    let p = priceAtY(py);
    if (t == null || p == null) return;
    const sn = snap(px, py, t, p);
    t = sn.t;
    p = sn.p;

    if (activeTool === "hline") {
      pushUndoSnapshot();
      addObject({ id: uid(), kind: "hline", price: p });
      draftRef.current = null;
      scheduleRedraw();
      return;
    }
    if (activeTool === "vline") {
      pushUndoSnapshot();
      addObject({ id: uid(), kind: "vline", t });
      draftRef.current = null;
      scheduleRedraw();
      return;
    }
    if (activeTool === "brush") {
      pushUndoSnapshot();
      draftRef.current = { kind: "brush", points: [{ t, p }] };
      canvasRef.current?.setPointerCapture(e.pointerId);
      scheduleRedraw();
      return;
    }

    pushUndoSnapshot();
    if (activeTool === "trend") {
      draftRef.current = { kind: "trend", a: { t, p } };
    } else if (activeTool === "rect") {
      draftRef.current = { kind: "rect", a: { t, p } };
    } else if (activeTool === "fib") {
      draftRef.current = { kind: "fib", a: { t, p } };
    }
    canvasRef.current?.setPointerCapture(e.pointerId);
    scheduleRedraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const draft = draftRef.current;
    if (!chart || !candleSeries || !draft) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left,
      py = e.clientY - rect.top;
    let t = chart.timeScale().coordinateToTime(px as never) as number | null;
    let p = priceAtY(py);
    if (t == null || p == null) return;
    const sn = snap(px, py, t, p);
    t = sn.t;
    p = sn.p;

    if (draft.kind === "brush") {
      const last = draft.points[draft.points.length - 1];
      const lx = chart.timeScale().timeToCoordinate(last.t as never);
      const ly = candleSeries.priceToCoordinate(last.p);
      const cx = chart.timeScale().timeToCoordinate(t as never);
      const cy = candleSeries.priceToCoordinate(p);
      if (lx != null && ly != null && cx != null && cy != null) {
        if (Math.hypot(cx - lx, cy - ly) > 3) draft.points.push({ t, p });
      }
      scheduleRedraw();
      return;
    }

    if (
      draft.kind === "trend" ||
      draft.kind === "rect" ||
      draft.kind === "fib"
    ) {
      (draft as { b?: PointT }).b = { t, p };
      scheduleRedraw();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const draft = draftRef.current;
    if (!chart || !candleSeries) return;

    if (draft?.kind === "brush") {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      if (draft.points.length > 1) {
        addObject({ id: uid(), kind: "brush", points: [...draft.points] });
      }
      draftRef.current = null;
      scheduleRedraw();
      return;
    }

    if (
      draft &&
      (draft.kind === "trend" ||
        draft.kind === "rect" ||
        draft.kind === "fib")
    ) {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      const b = (draft as { b?: PointT }).b;
      if (!b || (draft.a.t === b.t && draft.a.p === b.p)) {
        draftRef.current = null;
        scheduleRedraw();
        return;
      }
      const id = uid();
      if (draft.kind === "trend")
        addObject({ id, kind: "trend", a: draft.a, b });
      if (draft.kind === "rect")
        addObject({ id, kind: "rect", a: draft.a, b });
      if (draft.kind === "fib")
        addObject({ id, kind: "fib", a: draft.a, b });
      draftRef.current = null;
      scheduleRedraw();
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (activeTool !== "cursor" || !chart || !candleSeries) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left,
      py = e.clientY - rect.top;
    const id = hitTestDrawings(px, py, objects, {
      timeToX: (t) => chart.timeScale().timeToCoordinate(t as never),
      priceToY: (p) => candleSeries.priceToCoordinate(p),
    });
    select(id);
    scheduleRedraw();
  };

  const forwardWheel = (e: React.WheelEvent) => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const canvases = parent.querySelectorAll("canvas");
    const target = Array.from(canvases).find((c) => c !== canvasRef.current);
    if (!target) return;
    target.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        clientX: e.clientX,
        clientY: e.clientY,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 touch-none"
      onWheel={forwardWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={onClick}
    />
  );
}
