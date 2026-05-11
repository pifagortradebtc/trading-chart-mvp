/**
 * Файловый кеш на persistent disk (Render) или локально в .cache-disk.
 * Используется только на сервере (Route Handlers).
 */

import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

/** Корень данных: на Render смонтированный диск, локально — папка в проекте. */
export function getPersistentRoot(): string {
  const env = process.env.PERSISTENT_DISK_ROOT;
  if (env && env.trim()) return path.resolve(env.trim());
  return path.join(process.cwd(), ".cache-disk");
}

export function ohlcvDir(): string {
  return path.join(getPersistentRoot(), "ohlcv");
}

export function snapshotsDir(): string {
  return path.join(getPersistentRoot(), "snapshots");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function safeOhlcvFileId(symbol: string, interval: string, startMs: number, endMs: number): string {
  const h = createHash("sha256")
    .update(`${symbol}\0${interval}\0${startMs}\0${endMs}`)
    .digest("hex")
    .slice(0, 40);
  return `${symbol}_${interval}_${h}.json`;
}

export async function readJsonFile<T>(fullPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fullPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(fullPath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, JSON.stringify(data), "utf-8");
}
