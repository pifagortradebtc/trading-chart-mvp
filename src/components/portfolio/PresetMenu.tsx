"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, Save, Trash2, X } from "lucide-react";
import type { Preset } from "@/lib/portfolio/types";
import { prettySymbol } from "@/lib/portfolio/format";

interface Props {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (preset: Preset) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function PresetMenu({ presets, onSave, onLoad, onDelete, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowSaveInput(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleSave = () => {
    const trimmed = savingName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setSavingName("");
    setShowSaveInput(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
      >
        <Bookmark size={13} />
        Пресеты
        {presets.length > 0 && (
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 text-[10px] text-[var(--rex-muted)]">
            {presets.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-white/[0.08] bg-[var(--rex-bg-elevated)] p-2 shadow-2xl shadow-black/60">
          <div className="px-2 py-1.5">
            {showSaveInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
                className="flex items-center gap-1"
              >
                <input
                  autoFocus
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder="Имя пресета"
                  className="w-full rounded-md border border-surface-border bg-white/[0.03] px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-brand/50 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-[var(--bg-deep)] transition hover:bg-brand-light"
                >
                  <Save size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveInput(false);
                    setSavingName("");
                  }}
                  className="rounded-md p-1 text-[var(--rex-muted)] hover:bg-white/[0.06] hover:text-[var(--rex-text)]"
                >
                  <X size={12} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-surface-border-strong px-2 py-1.5 text-xs font-medium text-ink transition hover:border-brand/40 hover:text-ink"
              >
                <Plus size={13} />
                Сохранить текущую конфигурацию
              </button>
            )}
          </div>

          <div className="my-1 h-px bg-white/[0.06]" />

          {presets.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--rex-muted)]">
              Пока нет сохранённых пресетов.
            </div>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto px-1 py-1">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="group rounded-md border border-transparent transition hover:border-white/[0.08] hover:bg-white/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(p);
                      setOpen(false);
                    }}
                    className="flex w-full items-start justify-between px-2.5 py-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--rex-text)]">
                        {p.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--rex-muted)]">
                        {p.assets.map(prettySymbol).join(" · ")} ·{" "}
                        {formatDays(p.historyDays)} · rf{" "}
                        {(p.riskFreeRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p.id);
                      }}
                      className="ml-2 shrink-0 rounded p-1 text-[var(--rex-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.06] hover:text-rose-300"
                      aria-label="Удалить пресет"
                    >
                      <Trash2 size={13} />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDays(days: number): string {
  if (days >= 365) {
    const years = days / 365;
    return `${years.toFixed(years % 1 === 0 ? 0 : 1)} г.`;
  }
  return `${days} дн.`;
}
