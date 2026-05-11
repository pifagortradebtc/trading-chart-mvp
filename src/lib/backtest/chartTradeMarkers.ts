/**
 * Маркеры Lightweight Charts для входов/выходов сделок бэктеста.
 */

import type { SeriesMarker, Time } from "lightweight-charts";
import type { TradeRecord } from "./types";

function exitTag(reason: TradeRecord["exitReason"]): string {
  switch (reason) {
    case "tp":
      return "TP";
    case "sl":
      return "SL";
    case "liquidation":
      return "Liq";
    case "end_of_test":
      return "EOT";
    default:
      return "";
  }
}

/** Маркеры по времени свечи (Unix с), отсортированы по возрастанию времени. */
export function buildTradeMarkers(trades: TradeRecord[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const t of trades) {
    const tEntry = Math.floor(t.entryTime / 1000) as Time;
    const tExit = Math.floor(t.exitTime / 1000) as Time;
    const pnl = t.pnlUsdt;
    const pnlStr = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)} USDT`;
    const tag = exitTag(t.exitReason);

    out.push({
      time: tEntry,
      position: t.side === "long" ? "belowBar" : "aboveBar",
      color: "#22c55e",
      shape: t.side === "long" ? "arrowUp" : "arrowDown",
      text: `#${t.id} вход`,
    });
    out.push({
      time: tExit,
      position: t.side === "long" ? "aboveBar" : "belowBar",
      color: pnl >= 0 ? "#4ade80" : "#fb7185",
      shape: "circle",
      text: `#${t.id} ${tag ? `${tag} · ` : ""}${pnlStr}`,
    });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
}
