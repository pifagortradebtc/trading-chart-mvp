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

// SECURITY: hard caps на body. Раньше валидация шейпа была, но не размера —
// auth-юзер мог забить диск Render-плана отправляя body на сотни МБ. Engine
// run snapshot — это metadata (≤ ~5КБ в нормальной форме), 50КБ с большим
// запасом.
const MAX_BODY_BYTES = 50_000;
const MAX_ASSETS = 100;
const MAX_NOTE_CHARS = 500;

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
  // SECURITY: array/string length caps добавлены — раньше assets/weights
  // могли быть произвольно большими.
  if (
    !isValidId(b.id) ||
    typeof b.paramsHash !== "string" ||
    b.paramsHash.length <= 0 ||
    b.paramsHash.length > 128 ||
    typeof b.createdAt !== "number" ||
    !Number.isFinite(b.createdAt) ||
    typeof b.mode !== "string" ||
    b.mode.length > 64 ||
    !Array.isArray(b.assets) ||
    b.assets.length > MAX_ASSETS ||
    !b.assets.every((s) => typeof s === "string" && s.length <= 32) ||
    !isFiniteRecord(b.weights) ||
    Object.keys(b.weights as Record<string, number>).length > MAX_ASSETS ||
    typeof b.confidence !== "number" ||
    !Number.isFinite(b.confidence) ||
    typeof b.liveMarketCapsUsed !== "boolean"
  ) {
    return false;
  }
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length > MAX_NOTE_CHARS)) {
    return false;
  }
  if (
    b.publishedAt !== undefined &&
    (typeof b.publishedAt !== "number" || !Number.isFinite(b.publishedAt))
  ) {
    return false;
  }
  return true;
}

export async function POST(req: Request): Promise<NextResponse> {
  // SECURITY: body size cap ДО JSON.parse. Защита от DoS — раньше юзер
  // мог отправить 1ГБ JSON и сервер сначала бы парсил его в память.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать body" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Body слишком большой (>${MAX_BODY_BYTES} байт)` },
      { status: 413 },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }
  if (!validateSnapshot(parsed)) {
    return NextResponse.json(
      { error: "Некорректная схема snapshot" },
      { status: 400 },
    );
  }
  // SECURITY: field whitelist — пишем ТОЛЬКО известные поля. Раньше писали
  // весь body, что позволяло атакующему пристёгивать произвольные поля
  // (которые потом могли попасть в логи / экспорты / UI).
  const body = parsed as EngineRunSnapshot;
  const sanitized: EngineRunSnapshot = {
    id: body.id,
    paramsHash: body.paramsHash,
    createdAt: body.createdAt,
    publishedAt: body.publishedAt,
    mode: body.mode,
    assets: body.assets,
    weights: body.weights,
    confidence: body.confidence,
    liveMarketCapsUsed: body.liveMarketCapsUsed,
    note: body.note,
  };
  const filePath = path.join(engineRunsDir(), `${sanitized.id}.json`);
  try {
    await writeJsonFile(filePath, sanitized);
  } catch (e) {
    console.error("engine-runs write failed", e);
    return NextResponse.json({ error: "disk write failed" }, { status: 500 });
  }
  // Best-effort prune — не блокируем response при ошибке prune
  prune().catch((e) => console.error("engine-runs prune failed", e));
  return NextResponse.json({ ok: true, id: sanitized.id });
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
