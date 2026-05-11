"use client";

import type { DataQualityReport } from "@/lib/research/dataQuality";
import { GlassCard, NeonBadge } from "../ui";

export function DataQualityPanel({
  report,
  sourceLabel,
  interval,
}: {
  report: DataQualityReport | null;
  sourceLabel: string;
  interval: string;
}) {
  if (!report) {
    return (
      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">Качество данных</h3>
        <p className="mt-2 text-xs text-[var(--rex-muted)]">Нет загруженных свечей.</p>
      </GlassCard>
    );
  }

  const ok = report.warnings.length === 0;

  return (
    <GlassCard glow={ok ? "cyan" : "amber"} className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--rex-text)]">Качество данных</h3>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <NeonBadge>{sourceLabel}</NeonBadge>
          <NeonBadge>{interval}</NeonBadge>
          <NeonBadge variant={ok ? "ok" : "warn"}>{ok ? "OK" : "Внимание"}</NeonBadge>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <dt className="text-[10px] uppercase text-[var(--rex-muted)]">Баров</dt>
          <dd className="font-mono text-lg">{report.barCount}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <dt className="text-[10px] uppercase text-[var(--rex-muted)]">Дубликаты time</dt>
          <dd className="font-mono text-lg text-amber-200">{report.duplicateTimes}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <dt className="text-[10px] uppercase text-[var(--rex-muted)]">Разрывы (оценка)</dt>
          <dd className="font-mono text-lg">{report.gapCount}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <dt className="text-[10px] uppercase text-[var(--rex-muted)]">Аномальные бары</dt>
          <dd className="font-mono text-lg text-rose-200">{report.abnormalBars}</dd>
        </div>
      </dl>
      {report.startMs != null && report.endMs != null && (
        <p className="mt-3 text-xs text-[var(--rex-muted)]">
          Период: {new Date(report.startMs).toISOString().slice(0, 10)} —{" "}
          {new Date(report.endMs).toISOString().slice(0, 10)}
          {report.expectedStepSec != null && (
            <> · ожидаемый шаг ~{report.expectedStepSec}s</>
          )}
        </p>
      )}
      {report.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {report.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
