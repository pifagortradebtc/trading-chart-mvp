export function prettySymbol(symbol: string): string {
  return symbol
    .replace(/USDT$/, "")
    .replace(/USDC$/, "")
    .replace(/BUSD$/, "");
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}
