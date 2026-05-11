"use client";

import { exitReasonLabelRu, type MetricsSummary } from "@/lib/backtest/metrics";

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "profit" | "loss" | "risk" | "info";
}) {
  const tones = {
    default: "text-[#d1d4dc]",
    profit: "text-emerald-400",
    loss: "text-red-400",
    risk: "text-amber-400",
    info: "text-sky-400",
  };
  return (
    <div
      className="rounded-xl border border-[#2e3241] bg-[#131722] p-4 shadow-lg"
      title={hint}
    >
      <div className="text-[11px] uppercase tracking-wide text-[#787b86]">{label}</div>
      <div className={`mt-1 text-xl font-semibold font-mono ${tones[tone ?? "default"]}`}>
        {value}
      </div>
    </div>
  );
}

export function BacktestResults({ m }: { m: MetricsSummary | null }) {
  if (!m) {
    return (
      <div className="rounded-xl border border-dashed border-[#2e3241] bg-[#131722]/50 p-8 text-center text-[#787b86]">
        Запустите бэктест, чтобы увидеть метрики.
      </div>
    );
  }

  const pf =
    m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Итоговый PnL (USDT)"
          value={m.totalPnlUsdt.toFixed(2)}
          tone={m.totalPnlUsdt >= 0 ? "profit" : "loss"}
          hint="Суммарная прибыль/убыток после комиссий"
        />
        <Card
          label="Доходность %"
          value={`${m.totalReturnPct.toFixed(2)}%`}
          tone={m.totalReturnPct >= 0 ? "profit" : "loss"}
        />
        <Card
          label="Max DD сделки %"
          value={`${m.maxDrawdownPct.toFixed(2)}%`}
          tone="risk"
          hint="Максимальная просадка внутри одной сделки (по модели)"
        />
        <Card
          label="Max DD equity %"
          value={`${m.maxEquityDrawdownPct.toFixed(2)}%`}
          tone="risk"
          hint="Просадка по кривой эквити от пика"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Сделок" value={String(m.trades)} hint="Закрытых сделок" tone="info" />
        <Card label="Win rate %" value={`${m.winRatePct.toFixed(1)}%`} />
        <Card label="Profit factor" value={pf} hint="Gross profit / gross loss" />
        <Card label="Ликвидаций" value={String(m.liquidations)} tone="risk" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Средняя прибыль" value={m.avgWinUsdt.toFixed(2)} tone="profit" />
        <Card label="Средний убыток" value={m.avgLossUsdt.toFixed(2)} tone="loss" />
        <Card label="Max серия убытков" value={String(m.maxConsecutiveLosses)} tone="risk" />
        <Card label="Max серия побед" value={String(m.maxConsecutiveWins)} tone="profit" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Худшая сделка"
          value={m.worstTradeUsdt.toFixed(2)}
          tone="loss"
          hint={
            m.worstTradeExitReason != null && m.worstTradeId != null
              ? `Сделка #${m.worstTradeId}: ${exitReasonLabelRu(m.worstTradeExitReason)}. Плюс на TP только если выход именно по тейку; убыток возможен при стопе, ликвидации или принудительном закрытии в конце диапазона данных.`
              : "Минимальный PnL по сделкам; наведите после нового прогона — покажем причину выхода худшей сделки."
          }
        />
        <Card label="Лучшая сделка" value={m.bestTradeUsdt.toFixed(2)} tone="profit" />
        <Card
          label="Средняя длительность"
          value={`${(m.avgTradeDurationMs / 3600000).toFixed(1)} ч`}
        />
        <Card
          label="Max длительность"
          value={`${(m.maxTradeDurationMs / 3600000).toFixed(1)} ч`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Среднее DCA ордеров"
          value={m.avgDcaOrdersPerTrade.toFixed(2)}
          hint="Среднее число исполненных уровней сетки"
        />
        <Card label="Max DCA в сделке" value={String(m.maxDcaOrdersInTrade)} />
        <Card
          label="Полная сетка (раз)"
          value={String(m.fullGridHits)}
          hint="Сделки, где исполнены все уровни сетки"
          tone="risk"
        />
        <Card
          label="Средняя загрузка депозита %"
          value={`${m.avgDepositLoadPct.toFixed(1)}%`}
          tone="info"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Max загрузка депозита %"
          value={`${m.maxDepositLoadPct.toFixed(1)}%`}
          tone="risk"
        />
      </div>
    </div>
  );
}
