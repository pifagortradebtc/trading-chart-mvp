"use client";

import type { MPTResult, Portfolio } from "@/lib/portfolio/types";
import { Info } from "lucide-react";
import { prettySymbol } from "@/lib/portfolio/format";

interface Props {
  result: MPTResult;
}

interface Row {
  portfolio: Portfolio;
  isMinVol: boolean;
  isMaxSharpe: boolean;
  isMaxSortino: boolean;
}

export function PortfolioTable({ result }: Props) {
  const rows = buildRows(result, 12);
  const prettySymbols = result.symbols.map(prettySymbol);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[var(--rex-glass)]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--rex-text)]">
          Примеры весов портфелей
        </h3>
        <Info size={14} className="text-[var(--rex-muted)]" />
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--rex-bg-elevated)]/95 text-[10px] uppercase tracking-wider text-[var(--rex-muted)]">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left font-medium">Volatility</th>
              <th className="px-3 py-2 text-left font-medium">Exp. Return</th>
              <th className="px-3 py-2 text-left font-medium">Sharpe</th>
              <th className="px-3 py-2 text-left font-medium">Sortino</th>
              {prettySymbols.map((s) => (
                <th key={s} className="px-3 py-2 text-left font-medium">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-white/[0.04] text-[var(--rex-text)] transition hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2 font-mono">
                  {row.portfolio.volatility.toFixed(3)}
                  {row.isMinVol && (
                    <span className="ml-1.5 text-[10px] font-semibold text-sky-300">
                      (Min)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {row.portfolio.return.toFixed(3)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {row.portfolio.sharpe.toFixed(3)}
                  {row.isMaxSharpe && (
                    <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">
                      (Max)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">
                  {Number.isFinite(row.portfolio.sortino)
                    ? row.portfolio.sortino.toFixed(3)
                    : "—"}
                  {row.isMaxSortino && (
                    <span className="ml-1.5 text-[10px] font-semibold text-violet-300">
                      (Max)
                    </span>
                  )}
                </td>
                {row.portfolio.weights.map((w, j) => (
                  <td key={j} className="px-3 py-2 font-mono">
                    {(w * 100).toFixed(0)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildRows(result: MPTResult, count: number): Row[] {
  const seen = new Set<Portfolio>();
  const rows: Row[] = [];

  const push = (
    portfolio: Portfolio,
    flags: Partial<Pick<Row, "isMinVol" | "isMaxSharpe" | "isMaxSortino">>
  ) => {
    if (seen.has(portfolio)) return;
    seen.add(portfolio);
    rows.push({
      portfolio,
      isMinVol: !!flags.isMinVol,
      isMaxSharpe: !!flags.isMaxSharpe,
      isMaxSortino: !!flags.isMaxSortino,
    });
  };

  push(result.maxSharpe, { isMaxSharpe: true });
  push(result.maxSortino, { isMaxSortino: true });
  push(result.minVol, { isMinVol: true });

  const frontier = result.frontier;
  const remaining = Math.max(0, count - rows.length);
  if (remaining > 0 && frontier.length > 0) {
    const step = frontier.length / (remaining + 1);
    for (let i = 1; i <= remaining; i++) {
      const idx = Math.min(frontier.length - 1, Math.floor(i * step));
      push(frontier[idx], {});
    }
  }

  return rows.sort((a, b) => a.portfolio.volatility - b.portfolio.volatility);
}
