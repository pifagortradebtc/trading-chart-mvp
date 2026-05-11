"use client";

import type { MetricsSummary } from "@/lib/backtest/metrics";
import type { AdvancedResearchMetrics } from "@/lib/research/advancedMetrics";
import { GlassCard, MetricTile, TooltipHint } from "../ui";

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function ExtendedKpiGrid({
  m,
  adv,
}: {
  m: MetricsSummary;
  adv: AdvancedResearchMetrics | null;
}) {
  return (
    <GlassCard glow="cyan" className="p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--rex-text)]">
        Расширенные метрики
        <TooltipHint text="Sharpe/Sortino/Calmar — оценочные, по дневной агрегации эквити; для публикаций лучше верифицировать на ордерном логе." />
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <MetricTile
          label="Final equity"
          value={adv ? fmtNum(adv.finalEquity, 2) : "—"}
          sub={adv ? `Peak ${fmtNum(adv.equityPeak, 2)} · Low ${fmtNum(adv.lowestEquity, 2)}` : undefined}
          tooltip="Последняя точка кривой эквити и экстремумы."
        />
        <MetricTile
          label="CAGR %"
          value={fmtPct(adv?.cagrPct ?? null)}
          trend={
            adv?.cagrPct != null && adv.cagrPct >= 0 ? "up" : adv?.cagrPct != null ? "down" : "neutral"
          }
          tooltip="Среднегодовая доходность по первому и последнему бару выборки."
        />
        <MetricTile label="Sharpe (est.)" value={fmtNum(adv?.sharpeRatio ?? null, 3)} />
        <MetricTile label="Sortino (est.)" value={fmtNum(adv?.sortinoRatio ?? null, 3)} />
        <MetricTile label="Calmar" value={fmtNum(adv?.calmarRatio ?? null, 3)} />
        <MetricTile
          label="Recovery factor"
          value={fmtNum(adv?.recoveryFactor ?? null, 2)}
          tooltip="Отношение суммарного PnL к максимальной просадке в деньгах (оценочно)."
        />
        <MetricTile label="Expectancy / trade" value={fmtNum(adv?.expectancyPerTrade ?? null, 4)} />
        <MetricTile label="Payoff ratio" value={fmtNum(adv?.payoffRatio ?? null, 2)} />
        <MetricTile label="Loss rate %" value={`${fmtNum(adv?.lossRatePct ?? null, 1)}%`} />
        <MetricTile label="Ulcer index" value={fmtNum(adv?.ulcerIndex ?? null, 2)} />
        <MetricTile label="Risk/reward (approx)" value={fmtNum(adv?.riskRewardApprox ?? null, 2)} />
        <MetricTile label="Total fees" value={adv ? `${adv.totalFeesUsdt.toFixed(2)} USDT` : "—"} />
        <MetricTile
          label="Years in sample"
          value={adv ? fmtNum(adv.yearsInSample, 2) : "—"}
          sub={`Базовых метрик: ${m.trades} сделок`}
        />
      </div>
    </GlassCard>
  );
}
