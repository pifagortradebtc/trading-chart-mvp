import type { MPTResult, RunMPTOptions } from "./types";

interface PendingJob {
  resolve: (value: { result: MPTResult; durationMs: number }) => void;
  reject: (error: Error) => void;
}

/**
 * Promise-based wrapper around the MPT Web Worker. Multiple concurrent
 * `run()` calls are multiplexed over a single worker instance via numeric
 * request ids — the most recent simulation always wins because the consumer
 * (`useMPTWorker`) only awaits one promise at a time.
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
        | { id: number; type: "error"; message: string };
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      if (data.type === "result") {
        job.resolve({ result: data.result, durationMs: data.durationMs });
      } else {
        job.reject(new Error(data.message));
      }
    };
    this.worker.onerror = (event) => {
      const message = event.message || "Воркер симуляции упал.";
      for (const job of this.pending.values()) job.reject(new Error(message));
      this.pending.clear();
    };
  }

  run(opts: RunMPTOptions): Promise<{ result: MPTResult; durationMs: number }> {
    this.ensureStarted();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type: "run", payload: opts });
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
