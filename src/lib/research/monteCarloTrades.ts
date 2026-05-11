/**
 * Monte Carlo по сделкам: случайные перестановки порядка сделок (без изменения множества PnL).
 * Оценка распределения финальной эквити и хвостовых рисков без блокировки UI при умеренном числе симуляций.
 */

import type { MonteCarloSummary } from "./engines/types";

function shuffleInPlace(pnls: number[]): void {
  for (let i = pnls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pnls[i]!;
    pnls[i] = pnls[j]!;
    pnls[j] = t;
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * Симуляции: на каждом шаге порядок сделок перемешивается, пересчитывается путь эквити и max DD по пути.
 */
export function runMonteCarloTradeOrderShuffle(
  tradePnls: number[],
  startDeposit: number,
  simulations: number,
): MonteCarloSummary {
  if (!tradePnls.length) {
    return {
      simulations: 0,
      medianEquity: startDeposit,
      p5Equity: startDeposit,
      p95Equity: startDeposit,
      probLoss: 0,
      status: "no_trades",
      note: "Нет сделок — сначала выполните бэктест.",
    };
  }

  const n = Math.min(5000, Math.max(100, simulations));
  const finals: number[] = [];
  const maxDds: number[] = [];
  let lossCount = 0;
  let dd50Count = 0;

  const work = tradePnls.slice();

  for (let s = 0; s < n; s++) {
    shuffleInPlace(work);
    let eq = startDeposit;
    let peak = eq;
    let maxDd = 0;
    for (const pnl of work) {
      eq += pnl;
      if (eq > peak) peak = eq;
      if (peak > 0) {
        const dd = ((peak - eq) / peak) * 100;
        if (dd > maxDd) maxDd = dd;
      }
    }
    finals.push(eq);
    maxDds.push(maxDd);
    if (eq < startDeposit) lossCount++;
    if (maxDd > 50) dd50Count++;
  }

  finals.sort((a, b) => a - b);
  maxDds.sort((a, b) => a - b);

  return {
    simulations: n,
    medianEquity: percentile(finals, 50),
    p5Equity: percentile(finals, 5),
    p95Equity: percentile(finals, 95),
    probLoss: lossCount / n,
    probDdOver50Pct: dd50Count / n,
    status: "ok",
    note: "Перестановки порядка сделок; состав и сумма PnL не меняются, меняется только последовательность (влияет на просадку пути).",
  };
}
