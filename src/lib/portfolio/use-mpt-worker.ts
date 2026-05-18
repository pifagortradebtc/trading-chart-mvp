"use client";

import { useEffect, useRef } from "react";
import { MPTWorkerClient } from "./mpt-worker-client";

export function useMPTWorker(): MPTWorkerClient {
  const ref = useRef<MPTWorkerClient | null>(null);
  if (!ref.current) ref.current = new MPTWorkerClient();

  useEffect(() => {
    const client = ref.current;
    return () => client?.terminate();
  }, []);

  return ref.current;
}
