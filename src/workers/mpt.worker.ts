/// <reference lib="webworker" />

import { runMPT } from "@/lib/portfolio/mpt";
import { buildAllStrategies } from "@/lib/portfolio/strategies";
import type { MPTResult, PriceSeries, RunMPTOptions } from "@/lib/portfolio/types";
import type {
  AggregateRules,
  StrategyResult,
  ViewInput,
} from "@/lib/portfolio/strategyTypes";

export type WorkerRequest =
  | { id: number; type: "run"; payload: RunMPTOptions }
  | {
      id: number;
      type: "runWithStrategies";
      payload: RunMPTOptions & {
        views: ViewInput[];
        riskCaps: Record<string, { min?: number; max?: number }>;
        aggregateRules: AggregateRules;
        cvarDefenseThreshold?: number;
        liveMarketCaps?: Record<string, number> | null;
      };
    }
  | {
      id: number;
      type: "computeStrategies";
      payload: {
        priceSeries: PriceSeries[];
        riskFreeRate: number;
        mptResult: MPTResult;
        views: ViewInput[];
        riskCaps: Record<string, { min?: number; max?: number }>;
        aggregateRules: AggregateRules;
        cvarDefenseThreshold?: number;
        liveMarketCaps?: Record<string, number> | null;
      };
    };

export type WorkerResponse =
  | { id: number; type: "result"; result: MPTResult; durationMs: number }
  | {
      id: number;
      type: "resultWithStrategies";
      result: MPTResult;
      strategies: StrategyResult[];
      durationMs: number;
    }
  | {
      id: number;
      type: "strategiesResult";
      strategies: StrategyResult[];
      durationMs: number;
    }
  | { id: number; type: "error"; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, type } = event.data;
  const startedAt = performance.now();

  try {
    if (type === "run") {
      const result = runMPT(event.data.payload);
      ctx.postMessage({
        id,
        type: "result",
        result,
        durationMs: performance.now() - startedAt,
      } satisfies WorkerResponse);
      return;
    }

    if (type === "runWithStrategies") {
      const {
        views,
        riskCaps,
        aggregateRules,
        cvarDefenseThreshold,
        liveMarketCaps,
        ...mptOpts
      } = event.data.payload;
      const result = runMPT(mptOpts);
      const strategies = buildAllStrategies({
        priceSeries: mptOpts.priceSeries,
        riskFreeRate: mptOpts.riskFreeRate,
        mptResult: result,
        views,
        riskCaps,
        aggregateRules,
        cvarDefenseThreshold,
        liveMarketCaps,
      });
      ctx.postMessage({
        id,
        type: "resultWithStrategies",
        result,
        strategies,
        durationMs: performance.now() - startedAt,
      } satisfies WorkerResponse);
      return;
    }

    if (type === "computeStrategies") {
      const strategies = buildAllStrategies(event.data.payload);
      ctx.postMessage({
        id,
        type: "strategiesResult",
        strategies,
        durationMs: performance.now() - startedAt,
      } satisfies WorkerResponse);
      return;
    }
  } catch (err) {
    ctx.postMessage({
      id,
      type: "error",
      message: err instanceof Error ? err.message : "Неизвестная ошибка симуляции.",
    } satisfies WorkerResponse);
  }
});

export {};
