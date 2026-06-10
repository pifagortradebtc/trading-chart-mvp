/**
 * PATCH /api/engine-runs/[id] — обновление поля snapshot'а (note, publishedAt).
 * Используется когда оператор:
 *   - редактирует note задним числом
 *   - нажимает Copy NAV (помечает run как опубликованный)
 */

import path from "path";
import { NextResponse } from "next/server";
import {
  getPersistentRoot,
  readJsonFile,
  writeJsonFile,
} from "@/lib/server/persistentStore";

export const runtime = "nodejs";

// SECURITY: hard cap на body ДО JSON.parse. PATCH меняет только note (≤500
// символов) + publishedAt (число) — реальное тело ≤ ~1КБ. 10КБ с запасом.
// Раньше req.json() парсил неограниченный body в память (auth-gated DoS).
const MAX_BODY_BYTES = 10_000;

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

function isValidId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(s);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }
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
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }
  const filePath = path.join(getPersistentRoot(), "engine-runs", `${id}.json`);
  const existing = await readJsonFile<EngineRunSnapshot>(filePath);
  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const updated: EngineRunSnapshot = {
    ...existing,
    ...(typeof patch.note === "string" && patch.note.length <= 500
      ? { note: patch.note }
      : {}),
    ...(typeof patch.publishedAt === "number" &&
    Number.isFinite(patch.publishedAt)
      ? { publishedAt: patch.publishedAt }
      : {}),
  };
  try {
    await writeJsonFile(filePath, updated);
  } catch (e) {
    console.error("engine-runs patch write failed", e);
    return NextResponse.json({ error: "disk write failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
