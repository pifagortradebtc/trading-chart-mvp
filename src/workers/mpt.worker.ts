/// <reference lib="webworker" />

import { runMPT } from "@/lib/portfolio/mpt";
import type { MPTResult, RunMPTOptions } from "@/lib/portfolio/types";

export type WorkerRequest = {
  id: number;
  type: "run";
  payload: RunMPTOptions;
};

export type WorkerResponse =
  | { id: number; type: "result"; result: MPTResult; durationMs: number }
  | { id: number; type: "error"; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  if (type !== "run") return;

  const startedAt = performance.now();
  try {
    const result = runMPT(payload);
    const response: WorkerResponse = {
      id,
      type: "result",
      result,
      durationMs: performance.now() - startedAt,
    };
    ctx.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      type: "error",
      message: err instanceof Error ? err.message : "Неизвестная ошибка симуляции.",
    };
    ctx.postMessage(response);
  }
});

export {};
