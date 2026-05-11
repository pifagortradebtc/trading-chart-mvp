"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { TradeRecord } from "@/lib/backtest/types";
import { TradeTable } from "@/components/backtest/TradeTable";
import { GlassCard, NeonBadge, TooltipHint } from "../ui";

type PnlFilter = "all" | "profit" | "loss" | "liq";
type RegimeFilter = "all" | "trend" | "range";
type SideFilter = "all" | "long" | "short";
type SortKey = "pnl" | "duration" | "dd" | "dca";

export function TradeAnalyticsSection({
  trades,
  onSelect,
  onOpenChart,
}: {
  trades: TradeRecord[];
  onSelect: (t: TradeRecord) => void;
  onOpenChart?: (t: TradeRecord) => void;
}) {
  const [pnl, setPnl] = useState<PnlFilter>("all");
  const [regime, setRegime] = useState<RegimeFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const processed = useMemo(() => {
    let list = trades.slice();
    if (pnl === "profit") list = list.filter((t) => t.pnlUsdt > 0);
    else if (pnl === "loss") list = list.filter((t) => t.pnlUsdt < 0);
    else if (pnl === "liq") list = list.filter((t) => t.exitReason === "liquidation");

    if (regime === "trend") list = list.filter((t) => t.regime === "trend");
    else if (regime === "range") list = list.filter((t) => t.regime === "range");

    if (side === "long") list = list.filter((t) => t.side === "long");
    else if (side === "short") list = list.filter((t) => t.side === "short");

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "pnl") return dir * (a.pnlUsdt - b.pnlUsdt);
      if (sortKey === "duration") return dir * (a.durationMs - b.durationMs);
      if (sortKey === "dd") return dir * (a.maxDrawdownPct - b.maxDrawdownPct);
      return dir * (a.maxDcaIndex - b.maxDcaIndex);
    });
    return list;
  }, [trades, pnl, regime, side, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "pnl" || k === "dca" ? "desc" : "desc");
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase text-[var(--rex-muted)]">Фильтры</span>
          <NeonBadge>{processed.length} / {trades.length}</NeonBadge>
          <TooltipHint text="Фильтры не меняют расчёт бэктеста — только отображение таблицы." />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterBtn active={pnl === "all"} onClick={() => setPnl("all")}>
            Все
          </FilterBtn>
          <FilterBtn active={pnl === "profit"} onClick={() => setPnl("profit")}>
            Прибыль
          </FilterBtn>
          <FilterBtn active={pnl === "loss"} onClick={() => setPnl("loss")}>
            Убыток
          </FilterBtn>
          <FilterBtn active={pnl === "liq"} onClick={() => setPnl("liq")}>
            Ликвидации
          </FilterBtn>
          <span className="mx-2 hidden h-5 w-px bg-white/10 sm:inline" />
          <FilterBtn active={regime === "all"} onClick={() => setRegime("all")}>
            Режим все
          </FilterBtn>
          <FilterBtn active={regime === "trend"} onClick={() => setRegime("trend")}>
            Trend
          </FilterBtn>
          <FilterBtn active={regime === "range"} onClick={() => setRegime("range")}>
            Range
          </FilterBtn>
          <span className="mx-2 hidden h-5 w-px bg-white/10 sm:inline" />
          <FilterBtn active={side === "all"} onClick={() => setSide("all")}>
            Long+Short
          </FilterBtn>
          <FilterBtn active={side === "long"} onClick={() => setSide("long")}>
            Long
          </FilterBtn>
          <FilterBtn active={side === "short"} onClick={() => setSide("short")}>
            Short
          </FilterBtn>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="text-[var(--rex-muted)]">Сортировка:</span>
          <SortBtn label="PnL" active={sortKey === "pnl"} onClick={() => toggleSort("pnl")} />
          <SortBtn label="Duration" active={sortKey === "duration"} onClick={() => toggleSort("duration")} />
          <SortBtn label="DD %" active={sortKey === "dd"} onClick={() => toggleSort("dd")} />
          <SortBtn label="DCA depth" active={sortKey === "dca"} onClick={() => toggleSort("dca")} />
          <span className="text-[var(--rex-muted)]">({sortDir})</span>
        </div>
      </GlassCard>

      <TradeTable trades={processed} onSelect={onSelect} onOpenChart={onOpenChart} />
    </div>
  );
}

function FilterBtn({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-500/40"
          : "bg-white/[0.04] text-[var(--rex-muted)] hover:bg-white/[0.08]"
      }`}
    >
      {children}
    </button>
  );
}

function SortBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 ${active ? "text-cyan-300 underline decoration-cyan-500/50" : "text-[var(--rex-muted)] hover:text-white"}`}
    >
      {label}
    </button>
  );
}
