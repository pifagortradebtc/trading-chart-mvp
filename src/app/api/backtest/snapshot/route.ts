import { NextResponse } from "next/server";
import path from "path";
import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestSnapshotFile } from "@/lib/backtest/snapshotTypes";
import type { BacktestSettings, EquityPoint, TradeRecord } from "@/lib/backtest/types";
import { readJsonFile, snapshotsDir, writeJsonFile } from "@/lib/server/persistentStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const LATEST = "latest-backtest.json";

// SECURITY: hard caps. Раньше body не ограничивался — auth-юзер мог
// забить диск Render-плана. Backtest snapshot может быть большим
// (тысячи trades + equity points), но 10МБ — это уже на 3-5 лет
// minute-bar backtest с тысячами сделок. Реальные snapshot'ы ~50-500КБ.
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_TRADES = 100_000;
const MAX_EQUITY = 500_000;

/** GET — последнее сохранённое состояние бэктеста (без свечей). */
export async function GET() {
  const p = path.join(snapshotsDir(), LATEST);
  const data = await readJsonFile<BacktestSnapshotFile>(p);
  if (!data?.version) {
    return NextResponse.json({ snapshot: null }, { status: 200 });
  }
  return NextResponse.json({ snapshot: data });
}

/** POST — сохранить результат бэктеста на диск (графики восстанавливаются из trades + equity). */
export async function POST(req: Request) {
  try {
    // SECURITY: body size cap до JSON.parse.
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Body слишком большой (>${MAX_BODY_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      );
    }
    const body = JSON.parse(raw) as Partial<BacktestSnapshotFile>;
    if (!body.settings || !body.trades || !body.equity || !body.metrics) {
      return NextResponse.json({ error: "Неполное тело запроса" }, { status: 400 });
    }
    // SECURITY: array length caps. Защита от DoS через гигантские массивы.
    if (Array.isArray(body.trades) && body.trades.length > MAX_TRADES) {
      return NextResponse.json(
        { error: `Слишком много trades (>${MAX_TRADES})` },
        { status: 413 },
      );
    }
    if (Array.isArray(body.equity) && body.equity.length > MAX_EQUITY) {
      return NextResponse.json(
        { error: `Слишком много equity points (>${MAX_EQUITY})` },
        { status: 413 },
      );
    }

    const snapshot: BacktestSnapshotFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      symbol: String(body.symbol ?? ""),
      interval: String(body.interval ?? ""),
      yearsBack: Number(body.yearsBack ?? 0),
      settings: body.settings as BacktestSettings,
      trades: body.trades as TradeRecord[],
      equity: body.equity as EquityPoint[],
      metrics: body.metrics as MetricsSummary,
      candleCount: Number(body.candleCount ?? 0),
      customStartDateMs:
        typeof body.customStartDateMs === "number" && Number.isFinite(body.customStartDateMs)
          ? body.customStartDateMs
          : null,
      customEndDateMs:
        typeof body.customEndDateMs === "number" && Number.isFinite(body.customEndDateMs)
          ? body.customEndDateMs
          : null,
    };

    const out = path.join(snapshotsDir(), LATEST);
    await writeJsonFile(out, snapshot);

    /** опциональная копия с таймстампом для истории */
    const hist = path.join(
      snapshotsDir(),
      `backtest-${snapshot.savedAt.replace(/[:.]/g, "-")}.json`,
    );
    try {
      await writeJsonFile(hist, snapshot);
    } catch {
      /** игнор если диск полон */
    }

    return NextResponse.json({ ok: true, savedAt: snapshot.savedAt });
  } catch (e) {
    // SECURITY: не утекаем error.message в response (может содержать stack).
    if (typeof console !== "undefined") {
      console.warn(`[backtest/snapshot] error: ${e instanceof Error ? e.message : String(e)}`);
    }
    return NextResponse.json({ error: "Backtest snapshot save failed" }, { status: 400 });
  }
}
