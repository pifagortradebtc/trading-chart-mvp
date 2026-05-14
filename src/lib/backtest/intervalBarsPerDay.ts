/** Примерное число баров на календарный день для Binance-строк интервала (`15m`, `1h`, `4h`, `1d`). */
export function barsPerDayFromInterval(interval: string): number {
  const s = interval.trim().toLowerCase();
  const m = s.match(/^(\d+)(m|h|d)$/);
  if (!m) return 96;
  const n = Number(m[1]);
  const u = m[2]!;
  if (u === "d") return Math.max(1 / n, 0.01);
  if (u === "h") return (24 * 60) / (n * 60);
  return (24 * 60) / n;
}
