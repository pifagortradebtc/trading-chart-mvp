export type DrawingTool =
  | "cursor"
  | "trend"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "brush";

export type DrawingKind = Exclude<DrawingTool, "cursor">;

export interface PointT {
  t: number;
  p: number;
}

export type DrawingObject =
  | { id: string; kind: "trend"; a: PointT; b: PointT }
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "vline"; t: number }
  | { id: string; kind: "rect"; a: PointT; b: PointT }
  | { id: string; kind: "fib"; a: PointT; b: PointT }
  | { id: string; kind: "brush"; points: PointT[] };
