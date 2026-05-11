import { NextResponse } from "next/server";
import path from "path";
import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { BacktestSnapshotFile } from "@/lib/backtest/snapshotTypes";
import type { BacktestSettings, EquityPoint, TradeRecord } from "@/lib/backtest/types";
import { readJsonFile, snapshotsDir, writeJsonFile } from "@/lib/server/persistentStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const LATEST = "latest-backtest.json";

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
    const body = (await req.json()) as Partial<BacktestSnapshotFile>;
    if (!body.settings || !body.trades || !body.equity || !body.metrics) {
      return NextResponse.json({ error: "Неполное тело запроса" }, { status: 400 });
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
