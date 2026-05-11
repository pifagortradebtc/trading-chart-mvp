"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { DrawingObject, DrawingTool } from "@/types/drawing";

interface DrawingState {
  activeTool: DrawingTool;
  magnet: boolean;
  objects: DrawingObject[];
  selectedId: string | null;
  undoStack: string[];
  redoStack: string[];

  setTool: (t: DrawingTool) => void;
  toggleMagnet: () => void;
  clearAll: () => void;
  select: (id: string | null) => void;
  pushUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  addObject: (o: DrawingObject) => void;
  replaceObject: (id: string, o: DrawingObject) => void;
  removeObject: (id: string) => void;
}

const MAX_UNDO = 60;

export const useDrawingStore = create<DrawingState>()(
  immer((set) => ({
    activeTool: "cursor",
    magnet: false,
    objects: [],
    selectedId: null,
    undoStack: [],
    redoStack: [],

    setTool: (activeTool) =>
      set((s) => {
        s.activeTool = activeTool;
        if (activeTool !== "cursor") s.selectedId = null;
      }),

    toggleMagnet: () =>
      set((s) => {
        s.magnet = !s.magnet;
      }),

    pushUndoSnapshot: () =>
      set((s) => {
        const json = JSON.stringify(s.objects);
        s.undoStack.push(json);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack.length = 0;
      }),

    undo: () =>
      set((s) => {
        const cur = JSON.stringify(s.objects);
        const prev = s.undoStack.pop();
        if (!prev) return;
        s.redoStack.push(cur);
        s.objects = JSON.parse(prev) as DrawingObject[];
        s.selectedId = null;
      }),

    redo: () =>
      set((s) => {
        const cur = JSON.stringify(s.objects);
        const next = s.redoStack.pop();
        if (!next) return;
        s.undoStack.push(cur);
        s.objects = JSON.parse(next) as DrawingObject[];
        s.selectedId = null;
      }),

    clearAll: () =>
      set((s) => {
        if (s.objects.length === 0) return;
        s.undoStack.push(JSON.stringify(s.objects));
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack.length = 0;
        s.objects = [];
        s.selectedId = null;
      }),

    select: (selectedId) =>
      set((s) => {
        s.selectedId = selectedId;
      }),

    addObject: (o) =>
      set((s) => {
        s.objects.push(o);
      }),

    replaceObject: (id, o) =>
      set((s) => {
        const i = s.objects.findIndex((x) => x.id === id);
        if (i >= 0) s.objects[i] = o;
      }),

    removeObject: (id) =>
      set((s) => {
        s.objects = s.objects.filter((x) => x.id !== id);
        if (s.selectedId === id) s.selectedId = null;
      }),
  })),
);

/** Snap price to nearest OHLC at time `t` when magnet enabled. */
export function snapToCandle(
  candles: { time: number; open: number; high: number; low: number; close: number }[],
  t: number,
  price: number,
  pxThreshold: number,
  priceToY: (p: number) => number | null,
): number {
  if (!candles.length) return price;
  let best = candles[0];
  let bd = Infinity;
  for (const c of candles) {
    const d = Math.abs(c.time - t);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  const cands = [best.open, best.high, best.low, best.close];
  let nearest = price;
  let bestDy = Infinity;
  const py = priceToY(price);
  if (py == null) return price;
  for (const p of cands) {
    const y = priceToY(p);
    if (y == null) continue;
    const dy = Math.abs(y - py);
    if (dy < bestDy && dy < pxThreshold * 4) {
      bestDy = dy;
      nearest = p;
    }
  }
  return nearest;
}
