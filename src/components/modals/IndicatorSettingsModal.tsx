"use client";

import { useIndicatorStore } from "@/store/useIndicatorStore";
import type { BuiltinIndicatorId } from "@/types/indicator";

export function IndicatorSettingsModal() {
  const open = useIndicatorStore((s) => s.settingsModalOpen);
  const editingId = useIndicatorStore((s) => s.editingId);
  const instances = useIndicatorStore((s) => s.instances);
  const patchParams = useIndicatorStore((s) => s.patchParams);
  const closeSettings = useIndicatorStore((s) => s.closeSettings);
  const addBuiltin = useIndicatorStore((s) => s.addBuiltin);

  if (!open) return null;

  const editing = instances.find((i) => i.id === editingId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && closeSettings()}
    >
      <div className="w-full max-w-md rounded-lg border border-tv-border bg-tv-panel p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-tv-text">Indicators</h2>

        {!editing && (
          <div className="space-y-2">
            <p className="mb-3 text-sm text-tv-muted">Add built-in:</p>
            {(["sma", "ema", "rsi", "volume"] as BuiltinIndicatorId[]).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  className="mr-2 rounded bg-tv-toolbar px-3 py-2 text-sm uppercase text-tv-text hover:bg-tv-toolbar/80"
                  onClick={() => addBuiltin(id)}
                >
                  + {id}
                </button>
              ),
            )}
          </div>
        )}

        {editing && (
          <div className="space-y-3">
            <p className="text-sm text-tv-muted">
              Edit <span className="text-tv-text">{editing.pluginId}</span>
            </p>
            {(editing.pluginId === "sma" ||
              editing.pluginId === "ema" ||
              editing.pluginId === "rsi") && (
              <label className="flex items-center gap-3 text-sm">
                <span className="w-24 text-tv-muted">Period</span>
                <input
                  type="number"
                  min={2}
                  max={500}
                  value={editing.params.period ?? 14}
                  onChange={(e) =>
                    patchParams(editing.id, {
                      period: Number(e.target.value) || 14,
                    })
                  }
                  className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-tv-text"
                />
              </label>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeSettings}
            className="rounded bg-tv-accent px-4 py-2 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
