"use client";

import {
  exitReasonLabelRu,
  worstTradeDetailRu,
  type MetricsSummary,
} from "@/lib/backtest/metrics";
import type { OpenPositionSnapshot } from "@/lib/backtest/types";

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

export function BacktestResults({
  m,
  openPosition,
}: {
  m: MetricsSummary | null;
  /** Если на последнем баре висит позиция — отдельной строкой показываем её просадку. */
  openPosition?: OpenPositionSnapshot | null;
}) {
  if (!m) {
    return (
      <div className="rounded-xl border border-dashed border-[#2e3241] bg-[#131722]/50 p-8 text-center text-[#787b86]">
        Запустите бэктест, чтобы увидеть метрики.
      </div>
    );
  }

  const pf =
    m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);
  const endClose = m.endOfTestCloses ?? 0;
  /** «Худший момент за весь прогон» — max из equity DD, трейд DD и текущей открытой позиции. */
  const worstOverallDd = Math.max(
    m.maxEquityDrawdownPct,
    m.maxDrawdownPct,
    openPosition?.maxDrawdownPct ?? 0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Итоговый PnL (USDT)"
          value={m.totalPnlUsdt.toFixed(2)}
          tone={m.totalPnlUsdt >= 0 ? "profit" : "loss"}
          hint="Суммарная прибыль/убыток после комиссий по ЗАКРЫТЫМ сделкам"
        />
        <Card
          label="Доходность %"
          value={`${m.totalReturnPct.toFixed(2)}%`}
          tone={m.totalReturnPct >= 0 ? "profit" : "loss"}
        />
        <Card
          label="Худшая просадка %"
          value={`${worstOverallDd.toFixed(2)}%`}
          tone="risk"
          hint={
            "Максимум из:\n" +
            `• equity DD (по закрытым): ${m.maxEquityDrawdownPct.toFixed(2)}%\n` +
            `• худшая внутрисделочная DD: ${m.maxDrawdownPct.toFixed(2)}%\n` +
            (openPosition
              ? `• текущая открытая позиция: ${openPosition.maxDrawdownPct.toFixed(2)}%`
              : "• открытой позиции на конце нет")
          }
        />
        <Card
          label="Max DD equity %"
          value={`${m.maxEquityDrawdownPct.toFixed(2)}%`}
          tone="risk"
          hint="Просадка по кривой equity от пика (только реализованные сделки). =0 если все закрылись в плюс."
        />
      </div>

      {openPosition ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              Открытая позиция на конце выборки ({openPosition.side === "long" ? "LONG" : "SHORT"})
            </span>
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
              {openPosition.filledLevels}/{openPosition.totalGridOrders} ордеров заполнено
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label="Просадка СЕЙЧАС (PnL % маржи)"
              value={`${openPosition.unrealizedPnlPctOnMargin.toFixed(2)}%`}
              tone={openPosition.unrealizedPnlPctOnMargin >= 0 ? "profit" : "loss"}
              hint="Нереализованный PnL открытой позиции относительно маржи. Это «сколько в минусе прямо сейчас»."
            />
            <Card
              label="Max просадка В ЭТОЙ сделке %"
              value={`${openPosition.maxDrawdownPct.toFixed(2)}%`}
              tone="risk"
              hint="Самая глубокая просадка, которая была в этой открытой позиции с момента входа до последнего бара."
            />
            <Card
              label="Расстояние до TP"
              value={`${openPosition.distanceToTpPct.toFixed(2)}%`}
              tone="info"
              hint={`Средняя ${openPosition.avgEntryPrice.toFixed(2)} → TP ${openPosition.takeProfitPrice.toFixed(2)} (mark: ${openPosition.markPrice.toFixed(2)}).`}
            />
            <Card
              label="Открыта"
              value={`${(openPosition.durationMs / 86_400_000).toFixed(1)} дн`}
              hint={`${openPosition.durationBars} баров с момента первого входа.`}
            />
          </div>
        </div>
      ) : null}

      {endClose > 0 ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
          На последней свече осталась открытая позиция:{" "}
          <span className="font-semibold text-amber-200">{endClose}</span>. Она НЕ закрыта
          принудительно — equity, win rate и метрики её игнорируют (см. блок выше про текущую
          позицию). В trade-таблице она помечена как OPEN.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Max DD сделки %"
          value={`${m.maxDrawdownPct.toFixed(2)}%`}
          tone="risk"
          hint="Худшая внутри-сделочная просадка по ЗАКРЫТЫМ сделкам. См. trade-table — у каждой сделки своя колонка Max DD %."
        />
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
              ? `Сделка #${m.worstTradeId}: ${exitReasonLabelRu(m.worstTradeExitReason)}. ${worstTradeDetailRu(m.worstTradeExitReason)}`
              : "Минимальный PnL по сделкам; после нового прогона наведите — будет причина выхода худшей сделки."
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
          label="Средняя загрузка депозита %"
          value={`${m.avgDepositLoadPct.toFixed(1)}%`}
          tone="info"
        />
        <Card
          label="Max загрузка депозита %"
          value={`${m.maxDepositLoadPct.toFixed(1)}%`}
          tone="risk"
        />
      </div>
    </div>
  );
}
