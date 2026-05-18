import type { PinnedPortfolio, Preset } from "./types";

const PRESETS_KEY = "mpt-simulator:presets/v1";
const PINNED_KEY = "mpt-simulator:pinned/v1";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable — best-effort, ignore.
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadPresets(): Preset[] {
  return readJSON<Preset[]>(PRESETS_KEY, []);
}

export function savePreset(input: Omit<Preset, "id" | "createdAt">): Preset {
  const preset: Preset = { ...input, id: uuid(), createdAt: Date.now() };
  const current = loadPresets();
  writeJSON(PRESETS_KEY, [preset, ...current]);
  return preset;
}

export function deletePreset(id: string): Preset[] {
  const filtered = loadPresets().filter((p) => p.id !== id);
  writeJSON(PRESETS_KEY, filtered);
  return filtered;
}

export function loadPinned(): PinnedPortfolio[] {
  return readJSON<PinnedPortfolio[]>(PINNED_KEY, []);
}

export function savePinned(pinned: PinnedPortfolio[]): void {
  writeJSON(PINNED_KEY, pinned);
}

export function addPinned(
  pinned: PinnedPortfolio[],
  next: Omit<PinnedPortfolio, "id" | "pinnedAt">
): PinnedPortfolio[] {
  const entry: PinnedPortfolio = { ...next, id: uuid(), pinnedAt: Date.now() };
  const updated = [...pinned, entry];
  savePinned(updated);
  return updated;
}

export function removePinned(
  pinned: PinnedPortfolio[],
  id: string
): PinnedPortfolio[] {
  const updated = pinned.filter((p) => p.id !== id);
  savePinned(updated);
  return updated;
}
