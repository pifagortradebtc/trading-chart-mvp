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

/** Папка кеша для bid/ask depth серий (BuyForce/SellForce backtest). */
export function bidaskDir(): string {
  return path.join(getPersistentRoot(), "bidask");
}

/**
 * Стабильное имя файла для depth-серии: одна серия на пару + TF + глубину лет.
 * Префикс "v1_" чтобы оставить место для будущих изменений формата.
 */
export function stableBidaskFileName(
  symbol: string,
  interval: string,
  yearsBack: number,
): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `v1_${sym}_${interval}_y${yearsBack}.json`;
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

/**
 * Стабильное имя файла: одна серия на пару + TF + глубину лет (без startMs/endMs).
 *
 * `sourcePrefix` (e.g. "okx_", "coingecko_") разделяет кеши по источнику —
 * без префикса (default "") сохраняем обратную совместимость с уже лежащими
 * Binance-кешами. См. `sourceFilenamePrefix()` в `ohlcvSource.ts`.
 */
export function stableOhlcvFileName(
  symbol: string,
  interval: string,
  yearsBack: number,
  sourcePrefix = "",
): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `v2_${sourcePrefix}${sym}_${interval}_y${yearsBack}.json`;
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
  // CORRECTNESS FIX: atomic write — записываем в tmp файл, потом rename
  // на финальное имя. fs.rename атомарен на одной FS — concurrent reader
  // увидит либо старую версию, либо новую, но никогда truncated/partial.
  // Раньше прямой writeFile создавал TOCTOU окно: GET в момент write
  // мог прочитать неполный JSON и закешировать invalid state.
  const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data), "utf-8");
    await fs.rename(tmpPath, fullPath);
  } catch (e) {
    // Best-effort cleanup of tmp on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw e;
  }
}
