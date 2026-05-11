"use client";

import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  glow,
}: {
  children: ReactNode;
  className?: string;
  /** neon edge */
  glow?: "cyan" | "violet" | "amber" | "none";
}) {
  const glowCls =
    glow === "cyan"
      ? "shadow-[0_0_40px_-10px_rgba(34,211,238,0.35)] border-cyan-500/20"
      : glow === "violet"
        ? "shadow-[0_0_40px_-10px_rgba(167,139,250,0.35)] border-violet-500/20"
        : glow === "amber"
          ? "shadow-[0_0_40px_-10px_rgba(251,191,36,0.25)] border-amber-500/20"
          : "border-white/[0.06]";

  return (
    <div
      className={`rounded-2xl border bg-[var(--rex-glass)]/80 backdrop-blur-xl ${glowCls} ${className}`}
    >
      {children}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  trend,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  tooltip?: string;
}) {
  const trendCls =
    trend === "up"
      ? "text-emerald-400"
      : trend === "down"
        ? "text-rose-400"
        : "text-[var(--rex-text)]";

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-4"
      title={tooltip}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--rex-muted)]">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-semibold tabular-nums ${trendCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--rex-muted)]">{sub}</div>}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

export function NeonBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "risk" | "ok" | "warn";
}) {
  const v =
    variant === "risk"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : variant === "ok"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : variant === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
          : "border-white/10 bg-white/[0.04] text-[var(--rex-muted)]";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${v}`}>
      {children}
    </span>
  );
}

export function TooltipHint({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-cyan-500/30 text-[10px] text-cyan-400/90"
      title={text}
    >
      ?
    </span>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-white/[0.06] via-white/[0.12] to-white/[0.06] bg-[length:200%_100%] ${className}`}
    />
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-8 py-16 text-center">
      <div className="text-sm font-medium text-[var(--rex-text)]">{title}</div>
      {hint && <p className="mt-2 max-w-md text-xs text-[var(--rex-muted)]">{hint}</p>}
    </div>
  );
}
