/**
 * Engine Run Journal server endpoint — durable хранилище для snapshot'ов
 * (поверх localStorage, которое канонично, но улетит при clear browser).
 *
 *   POST /api/engine-runs  body=EngineRunSnapshot          → запись
 *   GET  /api/engine-runs?limit=20                         → list desc by createdAt
 *
 * Хранение: один JSON-файл на run в .cache-disk/engine-runs/<id>.json.
 * После записи prune'ит, оставляя последние MAX_SERVER_RUNS.
 */

import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import {
  ensureDir,
  getPersistentRoot,
  readJsonFile,
  writeJsonFile,
} from "@/lib/server/persistentStore";

export const runtime = "nodejs";

const MAX_SERVER_RUNS = 200;

interface EngineRunSnapshot {
  id: string;
  paramsHash: string;
  createdAt: number;
  publishedAt?: number;
  mode: string;
  assets: string[];
  weights: Record<string, number>;
  confidence: number;
  liveMarketCapsUsed: boolean;
  note?: string;
}

function engineRunsDir(): string {
  return path.join(getPersistentRoot(), "engine-runs");
}

function isValidId(s: unknown): s is string {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
}

function isFiniteRecord(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== "object") return false;
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
  }
  return true;
}

function validateSnapshot(body: unknown): body is EngineRunSnapshot {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    isValidId(b.id) &&
    typeof b.paramsHash === "string" &&
    b.paramsHash.length > 0 &&
    b.paramsHash.length <= 128 &&
    typeof b.createdAt === "number" &&
    Number.isFinite(b.createdAt) &&
    typeof b.mode === "string" &&
    Array.isArray(b.assets) &&
    b.assets.every((s) => typeof s === "string") &&
    isFiniteRecord(b.weights) &&
    typeof b.confidence === "number" &&
    typeof b.liveMarketCapsUsed === "boolean"
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }
  if (!validateSnapshot(body)) {
    return NextResponse.json(
      { error: "Некорректная схема snapshot" },
      { status: 400 },
    );
  }
  const filePath = path.join(engineRunsDir(), `${body.id}.json`);
  try {
    await writeJsonFile(filePath, body);
  } catch (e) {
    console.error("engine-runs write failed", e);
    return NextResponse.json({ error: "disk write failed" }, { status: 500 });
  }
  // Best-effort prune — не блокируем response при ошибке prune
  prune().catch((e) => console.error("engine-runs prune failed", e));
  return NextResponse.json({ ok: true, id: body.id });
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
    : 20;

  const runs: EngineRunSnapshot[] = [];
  try {
    await ensureDir(engineRunsDir());
    const entries = await fs.readdir(engineRunsDir());
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const f = await readJsonFile<EngineRunSnapshot>(
        path.join(engineRunsDir(), entry),
      );
      if (f && validateSnapshot(f)) runs.push(f);
    }
  } catch (e) {
    console.error("engine-runs list failed", e);
  }
  runs.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ runs: runs.slice(0, limit) });
}

async function prune(): Promise<void> {
  const dir = engineRunsDir();
  const entries = await fs.readdir(dir);
  if (entries.length <= MAX_SERVER_RUNS) return;
  const files: { path: string; createdAt: number }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const p = path.join(dir, entry);
    const f = await readJsonFile<EngineRunSnapshot>(p);
    if (f && typeof f.createdAt === "number") {
      files.push({ path: p, createdAt: f.createdAt });
    }
  }
  files.sort((a, b) => b.createdAt - a.createdAt);
  for (const f of files.slice(MAX_SERVER_RUNS)) {
    try {
      await fs.unlink(f.path);
    } catch {
      // best-effort
    }
  }
}
