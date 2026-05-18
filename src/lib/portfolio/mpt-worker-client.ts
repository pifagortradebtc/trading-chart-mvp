import type { MPTResult, PriceSeries, RunMPTOptions } from "./types";
import type {
  AggregateRules,
  StrategyResult,
  ViewInput,
} from "./strategyTypes";

interface PendingJob {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  expected:
    | "result"
    | "resultWithStrategies"
    | "strategiesResult";
}

export interface RunResult {
  result: MPTResult;
  durationMs: number;
}
export interface RunWithStrategiesResult {
  result: MPTResult;
  strategies: StrategyResult[];
  durationMs: number;
}
export interface StrategiesOnlyResult {
  strategies: StrategyResult[];
  durationMs: number;
}

/**
 * Promise-based wrapper around the MPT Web Worker. Multiple concurrent
 * requests are multiplexed over a single worker via numeric request ids.
 *
 * Three modes:
 *   - run(opts)                — Monte-Carlo cloud only (legacy)
 *   - runWithStrategies(...)   — cloud + all 9 strategies in one round-trip
 *   - computeStrategies(...)   — strategies-only, reusing an existing MPTResult
 */
export class MPTWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingJob>();
  private nextId = 0;

  ensureStarted(): void {
    if (this.worker) return;
    this.worker = new Worker(
      new URL("../../workers/mpt.worker.ts", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
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
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      if (data.type === "error") {
        job.reject(new Error(data.message));
        return;
      }
      if (data.type !== job.expected) {
        job.reject(new Error(`Unexpected worker response type: ${data.type}`));
        return;
      }
      job.resolve(data);
    };
    this.worker.onerror = (event) => {
      const message = event.message || "Воркер симуляции упал.";
      for (const job of this.pending.values()) job.reject(new Error(message));
      this.pending.clear();
    };
  }

  run(opts: RunMPTOptions): Promise<RunResult> {
    this.ensureStarted();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (data) => {
          const d = data as { result: MPTResult; durationMs: number };
          resolve({ result: d.result, durationMs: d.durationMs });
        },
        reject,
        expected: "result",
      });
      this.worker!.postMessage({ id, type: "run", payload: opts });
    });
  }

  runWithStrategies(
    opts: RunMPTOptions & {
      views: ViewInput[];
      riskCaps: Record<string, { min?: number; max?: number }>;
      aggregateRules: AggregateRules;
    }
  ): Promise<RunWithStrategiesResult> {
    this.ensureStarted();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (data) => {
          const d = data as RunWithStrategiesResult;
          resolve({
            result: d.result,
            strategies: d.strategies,
            durationMs: d.durationMs,
          });
        },
        reject,
        expected: "resultWithStrategies",
      });
      this.worker!.postMessage({ id, type: "runWithStrategies", payload: opts });
    });
  }

  computeStrategies(payload: {
    priceSeries: PriceSeries[];
    riskFreeRate: number;
    mptResult: MPTResult;
    views: ViewInput[];
    riskCaps: Record<string, { min?: number; max?: number }>;
    aggregateRules: AggregateRules;
  }): Promise<StrategiesOnlyResult> {
    this.ensureStarted();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (data) => {
          const d = data as StrategiesOnlyResult;
          resolve({ strategies: d.strategies, durationMs: d.durationMs });
        },
        reject,
        expected: "strategiesResult",
      });
      this.worker!.postMessage({ id, type: "computeStrategies", payload });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.pending.values()) {
      job.reject(new Error("Worker terminated."));
    }
    this.pending.clear();
  }
}
