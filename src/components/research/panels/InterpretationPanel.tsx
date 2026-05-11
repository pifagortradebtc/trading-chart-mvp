"use client";

import type { InterpretationItem } from "@/lib/research/interpretationRules";
import { GlassCard, NeonBadge } from "../ui";

function severityVariant(s: InterpretationItem["severity"]): "risk" | "ok" | "warn" | "default" {
  if (s === "danger") return "risk";
  if (s === "success") return "ok";
  if (s === "warning") return "warn";
  return "default";
}

export function InterpretationPanel({ items }: { items: InterpretationItem[] }) {
  if (!items.length) {
    return (
      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold text-[var(--rex-text)]">Интерпретация (rule-based)</h3>
        <p className="mt-2 text-xs text-[var(--rex-muted)]">
          Запустите бэктест — появятся выводы по просадке, ликвидациям, profit factor и Sharpe.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow="violet" className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--rex-text)]">Интерпретация</h3>
        <NeonBadge variant="warn">Explain mode</NeonBadge>
      </div>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <NeonBadge variant={severityVariant(it.severity)}>{it.severity}</NeonBadge>
              <span className="font-medium text-[var(--rex-text)]">{it.title}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--rex-muted)]">{it.detail}</p>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
