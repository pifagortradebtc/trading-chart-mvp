"use client";

import type { DrawingTool } from "@/types/drawing";
import { useDrawingStore } from "@/store/useDrawingStore";

const TOOLS: { id: DrawingTool; label: string; title: string }[] = [
  { id: "cursor", label: "⎋", title: "Cursor" },
  { id: "trend", label: "╱", title: "Trend line" },
  { id: "hline", label: "─", title: "Horizontal" },
  { id: "vline", label: "│", title: "Vertical" },
  { id: "rect", label: "▢", title: "Rectangle" },
  { id: "fib", label: "ɸ", title: "Fibonacci" },
  { id: "brush", label: "✎", title: "Brush" },
];

export function LeftToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setTool = useDrawingStore((s) => s.setTool);
  const magnet = useDrawingStore((s) => s.magnet);
  const toggleMagnet = useDrawingStore((s) => s.toggleMagnet);
  const undo = useDrawingStore((s) => s.undo);
  const redo = useDrawingStore((s) => s.redo);
  const clearAll = useDrawingStore((s) => s.clearAll);

  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-2"
      aria-label="Drawing tools"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.title}
          onClick={() => setTool(t.id)}
          className={`flex h-9 w-9 items-center justify-center rounded text-sm ${
            activeTool === t.id
              ? "bg-tv-accent/40 text-white"
              : "text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
          }`}
        >
          {t.label}
        </button>
      ))}
      <div className="my-1 h-px w-6 bg-tv-border" />
      <button
        type="button"
        title="Magnet (snap to OHLC)"
        onClick={toggleMagnet}
        className={`flex h-9 w-9 items-center justify-center rounded text-sm ${
          magnet ? "bg-tv-accent/30 text-amber-200" : "text-tv-muted hover:bg-tv-toolbar"
        }`}
      >
        ⧉
      </button>
      <button
        type="button"
        title="Undo"
        onClick={undo}
        className="flex h-9 w-9 items-center justify-center rounded text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
      >
        ↶
      </button>
      <button
        type="button"
        title="Redo"
        onClick={redo}
        className="flex h-9 w-9 items-center justify-center rounded text-tv-muted hover:bg-tv-toolbar hover:text-tv-text"
      >
        ↷
      </button>
      <button
        type="button"
        title="Clear all drawings"
        onClick={clearAll}
        className="mt-1 flex h-9 w-9 items-center justify-center rounded text-tv-muted hover:bg-red-900/40 hover:text-red-200"
      >
        ⌧
      </button>
    </aside>
  );
}
