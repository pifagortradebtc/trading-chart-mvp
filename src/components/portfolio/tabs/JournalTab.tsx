"use client";

/**
 * Engine Run Journal — отдельная sub-tab с историей рекомендаций.
 *
 * Источник: localStorage (мгновенный, основа правды) + /api/engine-runs
 * (durable, fallback при clean install в новом браузере). На load делаем
 * мерж local-first, без блокировок UI на сервере.
 *
 * Каждая строка — snapshot params + выданных весов на момент времени.
 * При нажатии Copy NAV в Recommended Tab — `publishedAt` помечается,
 * и в журнале строка показывает «published» badge.
 *
 * Поддерживает:
 *   - Inline-редактирование note (на местe, без modal)
 *   - Compare two runs (diff weights)
 *   - Re-copy того же allocation в clipboard (тот же JSON, что был при оригинальном publish)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, History, MessageSquare, RefreshCw } from "lucide-react";
import {
  diffWeights,
  loadLocalRuns,
  updateRunNote,
  type EngineRunSnapshot,
} from "@/lib/portfolio/engineRuns";
import { prettySymbol } from "@/lib/portfolio/format";

export function JournalTab() {
  const [runs, setRuns] = useState<EngineRunSnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    // Local first — мгновенно показать
    const local = loadLocalRuns();
    setRuns(local);
    // Затем сервер — если есть runs, которых нет локально, добавить
    try {
      const res = await fetch("/api/engine-runs?limit=100", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { runs?: EngineRunSnapshot[] };
        const serverRuns = Array.isArray(data?.runs) ? data.runs : [];
        if (serverRuns.length > 0) {
          // Merge by id — local wins для notes/publishedAt (мог отредактировать локально)
          const byId = new Map<string, EngineRunSnapshot>();
          for (const r of serverRuns) byId.set(r.id, r);
          for (const r of local) byId.set(r.id, r);
          const merged = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
          setRuns(merged);
        }
      }
    } catch {
      // network error — local is sufficient
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const compareRuns = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = runs.find((r) => r.id === compareIds[0]);
    const b = runs.find((r) => r.id === compareIds[1]);
    if (!a || !b) return null;
    // Order by createdAt ascending so the diff reads "older → newer"
    const [older, newer] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
    return { older, newer, rows: diffWeights(older, newer) };
  }, [compareIds, runs]);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // keep last, replace first
      return [...prev, id];
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">audit trail</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-display-tight text-ink sm:text-[2.25rem]">
            Engine Run <span className="accent-serif text-brand-light">Journal</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            История расчётов — какие веса выдал engine, с какими параметрами, когда.
            Каждый Copy NAV помечает run как опубликованный.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : undefined} />
          <span>Refresh</span>
        </button>
      </header>

      {runs.length === 0 && !refreshing && (
        <div className="rounded-2xl border border-dashed border-surface-border bg-surface p-8 text-center text-sm text-ink-muted">
          Журнал пуст. Открой Recommended Tab и нажми «Copy NAV» — первый run сохранится сюда.
        </div>
      )}

      {compareRuns && (
        <CompareCard
          older={compareRuns.older}
          newer={compareRuns.newer}
          rows={compareRuns.rows}
          onClose={() => setCompareIds([])}
        />
      )}

      {runs.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface">
          <header className="flex items-center justify-between border-b border-surface-border px-5 py-3 text-[10px] uppercase tracking-[0.22em] text-ink-faint">
            <span className="flex items-center gap-2">
              <History size={12} className="text-brand-light/70" />
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink-faint/60">
              {compareIds.length === 0
                ? "Tip: жми Compare на двух runs чтобы увидеть delta весов"
                : compareIds.length === 1
                  ? "Выбран 1 / 2"
                  : "Сравнение готово ↑"}
            </span>
          </header>
          <ul className="divide-y divide-surface-border">
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                isInCompare={compareIds.includes(r.id)}
                isEditingNote={editingNoteId === r.id}
                onToggleCompare={() => toggleCompare(r.id)}
                onStartEditNote={() => setEditingNoteId(r.id)}
                onSaveNote={async (note) => {
                  await updateRunNote(r.id, note);
                  setRuns((prev) =>
                    prev.map((x) => (x.id === r.id ? { ...x, note } : x)),
                  );
                  setEditingNoteId(null);
                }}
                onCancelEditNote={() => setEditingNoteId(null)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunRow({
  run,
  isInCompare,
  isEditingNote,
  onToggleCompare,
  onStartEditNote,
  onSaveNote,
  onCancelEditNote,
}: {
  run: EngineRunSnapshot;
  isInCompare: boolean;
  isEditingNote: boolean;
  onToggleCompare: () => void;
  onStartEditNote: () => void;
  onSaveNote: (note: string) => void;
  onCancelEditNote: () => void;
}) {
  const [draft, setDraft] = useState(run.note ?? "");
  useEffect(() => {
    if (isEditingNote) setDraft(run.note ?? "");
  }, [isEditingNote, run.note]);

  const topWeights = useMemo(() => {
    return Object.entries(run.weights)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [run.weights]);

  const created = new Date(run.createdAt);
  const published = run.publishedAt ? new Date(run.publishedAt) : null;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-muted">
              {created.toISOString().slice(0, 16).replace("T", " ")} UTC
            </span>
            <span className="rounded-full border border-surface-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
              {run.mode}
            </span>
            {published && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                <Check size={10} /> published
              </span>
            )}
            <span className="font-mono text-[10px] text-ink-faint">
              hash {run.paramsHash.slice(0, 8)}
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              conf {(run.confidence * 100).toFixed(0)}%
            </span>
            {run.liveMarketCapsUsed && (
              <span className="font-mono text-[10px] text-ink-faint">live-mcaps</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-ink-muted">
            {topWeights.map(([sym, w]) => (
              <span key={sym}>
                <span className="text-ink">{prettySymbol(sym)}</span>{" "}
                <span className="text-ink-faint">{(w * 100).toFixed(1)}%</span>
              </span>
            ))}
            {Object.keys(run.weights).length > 5 && (
              <span className="text-ink-faint">…+{Object.keys(run.weights).length - 5}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStartEditNote}
            className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:border-brand/40 hover:text-ink"
            title={run.note ? `Note: ${run.note}` : "Добавить заметку"}
          >
            <MessageSquare size={10} />
            {run.note ? "Edit note" : "Add note"}
          </button>
          <button
            type="button"
            onClick={onToggleCompare}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
              isInCompare
                ? "border-brand/60 bg-brand/10 text-brand-light"
                : "border-surface-border bg-white/[0.04] text-ink-muted hover:border-brand/40 hover:text-ink"
            }`}
          >
            <BookOpen size={10} />
            {isInCompare ? "Selected" : "Compare"}
          </button>
        </div>
      </div>

      {isEditingNote ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            placeholder="Например: «ребаланс после Q1 отчёта, увеличили вес HYPE»"
            className="w-full rounded-md border border-surface-border bg-white/[0.04] p-2 font-mono text-xs text-ink placeholder-ink-faint/60 focus:border-brand/60 focus:outline-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSaveNote(draft.trim())}
              className="rounded-md border border-brand/40 bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light hover:border-brand/60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEditNote}
              className="rounded-md border border-surface-border bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:border-rose-500/40 hover:text-rose-200"
            >
              Cancel
            </button>
            <span className="ml-auto self-center font-mono text-[10px] text-ink-faint">
              {draft.length} / 500
            </span>
          </div>
        </div>
      ) : (
        run.note && (
          <p className="mt-2 max-w-3xl text-xs text-ink-muted">{run.note}</p>
        )
      )}
    </li>
  );
}

function CompareCard({
  older,
  newer,
  rows,
  onClose,
}: {
  older: EngineRunSnapshot;
  newer: EngineRunSnapshot;
  rows: { symbol: string; before: number; after: number; delta: number }[];
  onClose: () => void;
}) {
  const olderTs = new Date(older.createdAt).toISOString().slice(0, 16).replace("T", " ");
  const newerTs = new Date(newer.createdAt).toISOString().slice(0, 16).replace("T", " ");

  return (
    <section className="rounded-2xl border border-brand/30 bg-brand/[0.04] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">compare runs</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-ink">
            <span className="font-mono text-xs text-ink-muted">{olderTs}</span>
            <span className="mx-2 text-ink-faint">→</span>
            <span className="font-mono text-xs text-ink-muted">{newerTs}</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-surface-border bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:border-rose-500/40 hover:text-rose-200"
        >
          Close
        </button>
      </header>
      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            <th className="py-1.5 font-medium">Symbol</th>
            <th className="py-1.5 text-right font-medium">Before</th>
            <th className="py-1.5 text-right font-medium">After</th>
            <th className="py-1.5 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-surface-border">
              <td className="py-1.5 text-ink">{prettySymbol(r.symbol)}</td>
              <td className="py-1.5 text-right text-ink-muted">
                {(r.before * 100).toFixed(2)}%
              </td>
              <td className="py-1.5 text-right text-ink-muted">
                {(r.after * 100).toFixed(2)}%
              </td>
              <td
                className={`py-1.5 text-right ${
                  Math.abs(r.delta) < 0.005
                    ? "text-ink-faint"
                    : r.delta > 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                }`}
              >
                {r.delta > 0 ? "+" : ""}
                {(r.delta * 100).toFixed(2)}pp
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

