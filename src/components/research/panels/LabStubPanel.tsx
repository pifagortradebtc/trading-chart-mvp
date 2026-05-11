"use client";

import { EmptyState, GlassCard } from "../ui";

export function LabStubPanel({
  title,
  description,
  architectureNote,
}: {
  title: string;
  description: string;
  architectureNote: string;
}) {
  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-[var(--rex-text)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--rex-muted)]">{description}</p>
      <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-100/90">
        <span className="font-semibold text-cyan-300">Архитектура: </span>
        {architectureNote}
      </div>
      <div className="mt-6">
        <EmptyState
          title="Модуль в разработке"
          hint="Интерфейс и типы готовы; расчёт переносится в Web Worker без блокировки UI."
        />
      </div>
    </GlassCard>
  );
}
