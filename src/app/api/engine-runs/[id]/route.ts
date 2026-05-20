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
  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
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
