import type { DrawingObject } from "@/types/drawing";

const NEAR = 8;

function distToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
  const nx = x1 + t * dx,
    ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

/** First object hit at pixel (top-most = last in array). */
export function hitTestDrawings(
  px: number,
  py: number,
  objects: DrawingObject[],
  map: {
    timeToX: (t: number) => number | null;
    priceToY: (p: number) => number | null;
  },
): string | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const d = objects[i];
    if (d.kind === "hline") {
      const y = map.priceToY(d.price);
      if (y != null && Math.abs(py - y) < NEAR) return d.id;
    }
    if (d.kind === "vline") {
      const x = map.timeToX(d.t);
      if (x != null && Math.abs(px - x) < NEAR) return d.id;
    }
    if (d.kind === "trend" || d.kind === "fib") {
      const x1 = map.timeToX(d.a.t),
        y1 = map.priceToY(d.a.p);
      const x2 = map.timeToX(d.b.t),
        y2 = map.priceToY(d.b.p);
      if (
        x1 != null &&
        y1 != null &&
        x2 != null &&
        y2 != null &&
        distToSeg(px, py, x1, y1, x2, y2) < NEAR
      )
        return d.id;
    }
    if (d.kind === "rect") {
      const x1 = map.timeToX(d.a.t),
        y1 = map.priceToY(d.a.p);
      const x2 = map.timeToX(d.b.t),
        y2 = map.priceToY(d.b.p);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      const l = Math.min(x1, x2),
        r = Math.max(x1, x2),
        t = Math.min(y1, y2),
        b = Math.max(y1, y2);
      if (px >= l && px <= r && py >= t && py <= b) return d.id;
    }
    if (d.kind === "brush" && d.points.length > 1) {
      for (let k = 1; k < d.points.length; k++) {
        const xa = map.timeToX(d.points[k - 1].t),
          ya = map.priceToY(d.points[k - 1].p);
        const xb = map.timeToX(d.points[k].t),
          yb = map.priceToY(d.points[k].p);
        if (
          xa != null &&
          ya != null &&
          xb != null &&
          yb != null &&
          distToSeg(px, py, xa, ya, xb, yb) < NEAR
        )
          return d.id;
      }
    }
  }
  return null;
}
