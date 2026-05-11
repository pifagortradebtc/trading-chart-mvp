export type ResearchTabId =
  | "strategy"
  | "results"
  | "risk"
  | "trades"
  | "dca"
  | "optimize"
  | "walkforward"
  | "montecarlo"
  | "stress"
  | "benchmark"
  | "data"
  | "reports";

export const RESEARCH_TABS: {
  id: ResearchTabId;
  label: string;
  short: string;
  group: "core" | "labs" | "system";
}[] = [
  { id: "strategy", label: "Strategy Setup", short: "Setup", group: "core" },
  { id: "results", label: "Backtest Results", short: "Results", group: "core" },
  { id: "risk", label: "Risk Analytics", short: "Risk", group: "core" },
  { id: "trades", label: "Trade Analytics", short: "Trades", group: "core" },
  { id: "dca", label: "DCA Grid", short: "DCA", group: "core" },
  { id: "optimize", label: "Optimization Lab", short: "Optimize", group: "labs" },
  { id: "walkforward", label: "Walk-Forward", short: "WF", group: "labs" },
  { id: "montecarlo", label: "Monte Carlo", short: "MC", group: "labs" },
  { id: "stress", label: "Stress Tests", short: "Stress", group: "labs" },
  { id: "benchmark", label: "Benchmarks", short: "Bench", group: "labs" },
  { id: "data", label: "Data Quality", short: "Data", group: "system" },
  { id: "reports", label: "Reporting", short: "Export", group: "system" },
];
