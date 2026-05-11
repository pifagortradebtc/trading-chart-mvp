"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BuiltinIndicatorId, IndicatorInstanceState } from "@/types/indicator";

function uid() {
  return `ind_${Math.random().toString(36).slice(2, 11)}`;
}

interface IndicatorStore {
  instances: IndicatorInstanceState[];
  settingsModalOpen: boolean;
  editingId: string | null;

  addBuiltin: (pluginId: BuiltinIndicatorId, params?: Record<string, number>) => void;
  remove: (id: string) => void;
  toggleVisible: (id: string) => void;
  patchParams: (id: string, params: Record<string, number>) => void;
  openSettings: (id: string | null) => void;
  closeSettings: () => void;
}

const defaults: Record<BuiltinIndicatorId, Record<string, number>> = {
  sma: { period: 20 },
  ema: { period: 50 },
  rsi: { period: 14 },
  volume: {},
};

export const useIndicatorStore = create<IndicatorStore>()(
  immer((set) => ({
    instances: [
      {
        id: uid(),
        pluginId: "volume",
        visible: true,
        params: {},
      },
      {
        id: uid(),
        pluginId: "ema",
        visible: true,
        params: { period: 21 },
      },
      {
        id: uid(),
        pluginId: "rsi",
        visible: true,
        params: { period: 14 },
      },
    ],
    settingsModalOpen: false,
    editingId: null,

    addBuiltin: (pluginId, params) =>
      set((s) => {
        s.instances.push({
          id: uid(),
          pluginId,
          visible: true,
          params: { ...defaults[pluginId], ...params },
        });
      }),

    remove: (id) =>
      set((s) => {
        s.instances = s.instances.filter((x) => x.id !== id);
        if (s.editingId === id) s.editingId = null;
      }),

    toggleVisible: (id) =>
      set((s) => {
        const x = s.instances.find((i) => i.id === id);
        if (x) x.visible = !x.visible;
      }),

    patchParams: (id, params) =>
      set((s) => {
        const x = s.instances.find((i) => i.id === id);
        if (x) Object.assign(x.params, params);
      }),

    openSettings: (id) =>
      set((s) => {
        s.settingsModalOpen = true;
        s.editingId = id;
      }),

    closeSettings: () =>
      set((s) => {
        s.settingsModalOpen = false;
        s.editingId = null;
      }),
  })),
);
