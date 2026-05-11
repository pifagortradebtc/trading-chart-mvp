import type { IndicatorPlugin } from "@/indicators/types";

/** Central registry for custom indicators — call `registerIndicator` from app bootstrap. */
const registry = new Map<string, IndicatorPlugin<Record<string, number | undefined>>>();

export function registerIndicator(
  plugin: IndicatorPlugin<Record<string, number | undefined>>,
) {
  registry.set(plugin.id, plugin);
}

export function getRegisteredIndicator(id: string) {
  return registry.get(id);
}

export function listRegisteredIndicators() {
  return [...registry.keys()];
}
