"use client";

import type { BacktestResult, BacktestSettings } from "@/lib/backtest/types";
import { barsPerDayFromInterval } from "@/lib/backtest/intervalBarsPerDay";

function fmtDays(ms: number): string {
  const d = ms / (24 * 3600 * 1000);
  if (d >= 100) return `${d.toFixed(0)}d`;
  if (d >= 1) return `${d.toFixed(2)}d`;
  return `${(ms / 3600000).toFixed(2)}ч`;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : ((a[mid - 1]! + a[mid]!) / 2);
}

function stdSample(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
  const v = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-xl border border-[#2e3241] bg-[#131722] p-3 text-sm shadow-inner">
      <div className="mb-2 border-b border-[#2e3241] pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#787b86]">
        {title}
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 text-[13px] leading-snug text-[#d1d4dc]">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  vClass,
}: {
  k: string;
  v: React.ReactNode;
  vClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-[#787b86]">{k}</span>
      <span className={`text-right font-mono text-xs ${vClass ?? "text-[#d1d4dc]"}`}>{v}</span>
    </div>
  );
}

const LAST_N = 12;

export function BacktestStrategyDashboard({
  result,
  settings,
  interval,
}: {
  result: BacktestResult;
  settings: BacktestSettings;
  interval: string;
}) {
  const ind = settings.indicator;
  const dca = settings.dca;
  const pif = settings.pifagorAlts;
  const isPifagor = settings.strategyKind === "pifagor_alts";
  const gridNotional = dca.gridTotalNotionalUsdt ?? dca.startDepositUsdt;
  const atrLast = result.lastBarAtrKelt;
  const pos = result.openPositionAtDataEnd;
  const trades = result.trades;
  const closed = trades.filter((t) => t.exitReason !== "end_of_test");
  const eot = trades.filter((t) => t.exitReason === "end_of_test");
  const barsPerDay = barsPerDayFromInterval(interval);

  const wins = closed.filter((t) => t.pnlUsdt > 0);
  const losses = closed.filter((t) => t.pnlUsdt < 0);
  const sumPnlPct = closed.reduce((s, t) => s + t.pnlPctOnMargin, 0);
  const avgPnlPct = closed.length ? sumPnlPct / closed.length : 0;
  const maxPnlPct = closed.length ? Math.max(...closed.map((t) => t.pnlPctOnMargin)) : 0;
  const worstDdClosed = closed.length ? Math.min(...closed.map((t) => t.maxDrawdownPct)) : 0;

  const dcaFilled = closed.map((t) => t.maxDcaIndex);
  const avgDca = dcaFilled.length ? dcaFilled.reduce((a, b) => a + b, 0) / dcaFilled.length : 0;
  const maxDca = dcaFilled.length ? Math.max(...dcaFilled) : 0;
  const totalOrders = closed[0]?.totalGridOrders ?? dca.ordersCount;

  const durationsDays = closed.map((t) => t.durationMs / (24 * 3600 * 1000));
  const totalDaysInTrades = durationsDays.reduce((a, b) => a + b, 0);
  const durBars = closed
    .map((t) =>
      t.entryBarIndex != null && t.exitBarIndex != null
        ? t.exitBarIndex - t.entryBarIndex + 1
        : null,
    )
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avgBars = durBars.length ? durBars.reduce((a, b) => a + b, 0) / durBars.length : 0;
  const minBars = durBars.length ? Math.min(...durBars) : 0;
  const maxBars = durBars.length ? Math.max(...durBars) : 0;

  const chron = [...closed].sort((a, b) => a.exitTime - b.exitTime);
  const lastClosed = chron.length ? chron[chron.length - 1]! : null;
  const prevClosed = chron.length >= 2 ? chron[chron.length - 2]! : null;

  const avgDurMs = closed.length
    ? closed.reduce((s, t) => s + t.durationMs, 0) / closed.length
    : 0;
  const lim = trades.filter((t) => t.firstEntryKind === "limit").length;
  const mkt = trades.filter((t) => t.firstEntryKind !== "limit").length;

  const lastTrades = [...trades].sort((a, b) => b.exitTime - a.exitTime).slice(0, LAST_N);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--rex-muted)]">
        Дашборд стратегии (как в Pine)
      </h3>
      <div className="grid gap-3 xl:grid-cols-5">
        <Panel title="Настройки">
          {isPifagor ? (
            <>
              <Row k="Модель" v="Pifagor ALTS 3.7" />
              <Row
                k="Риск ALTS"
                v={pif.lineRisk === "less" ? "меньше" : "больше"}
              />
              <Row k="Вход USDT" v={pif.entryNotionalUsdt.toFixed(0)} />
              <Row k="Pyramiding" v={pif.maxPyramidingEntries} />
              <Row
                k="Выход +100%"
                v={pif.closewhen100 ? "2× средней" : "выкл"}
              />
              <Row k="Плечо" v={dca.leverage} />
              <Row k="Депозит" v={`${dca.startDepositUsdt.toFixed(0)} USDT`} />
              <Row
                k="Выход Pine"
                v={pif.usePineExitRules ? "mult/diff" : "выкл"}
              />
              {result.warning ? (
                <p className="mt-2 text-[10px] leading-snug text-amber-200/90">{result.warning}</p>
              ) : null}
            </>
          ) : (
            <>
              <Row k="Ордеров" v={dca.ordersCount} />
              <Row k="Перекрытие" v={`${dca.priceOverlapPct.toFixed(1)}%`} />
              <Row k="Коэф. цены" v={dca.priceFactor.toFixed(2)} />
              <Row k="Мартингейл" v={dca.volumeFactor.toFixed(2)} />
              <Row k="TP" v={`${dca.takeProfitPct.toFixed(2)}%`} />
              <Row
                k="Вход боковик"
                v={
                  ind.useLimitRange
                    ? `${ind.limitRangeAtr.toFixed(2)} ATR`
                    : "market"
                }
              />
              <Row
                k="Вход тренд"
                v={
                  ind.useLimitTrend
                    ? `${ind.limitTrendAtr.toFixed(2)} ATR`
                    : "market"
                }
              />
              <Row
                k="ATR (посл. бар)"
                v={atrLast != null && Number.isFinite(atrLast) ? atrLast.toFixed(1) : "—"}
              />
              <Row k="Покрытие сетки" v={`${dca.priceOverlapPct.toFixed(2)}%`} vClass="text-emerald-400" />
              <Row k="Σ USDT сетки" v={gridNotional.toFixed(1)} vClass="text-emerald-400" />
            </>
          )}
        </Panel>

        <Panel title="Последние сделки">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[280px] text-left text-[11px]">
              <thead className="text-[#787b86]">
                <tr>
                  <th className="pr-1 py-0.5">#</th>
                  <th className="px-1 py-0.5">Вход</th>
                  <th className="px-1 py-0.5">Выход</th>
                  <th className="px-1 py-0.5">PnL%</th>
                  <th className="px-1 py-0.5">{isPifagor ? "Входов" : "Сетка"}</th>
                  <th className="pl-1 py-0.5">Дни</th>
                  <th className="pl-1 py-0.5">DD%</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[#d1d4dc]">
                {lastTrades.map((t) => (
                  <tr key={t.id} className="border-t border-[#2e3241]/80">
                    <td className="pr-1 py-0.5 text-sky-400">{t.id}</td>
                    <td className="px-1 py-0.5">{t.avgEntryPrice.toFixed(1)}</td>
                    <td className="px-1 py-0.5">{t.exitPrice.toFixed(1)}</td>
                    <td
                      className={`px-1 py-0.5 ${t.pnlPctOnMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {t.pnlPctOnMargin.toFixed(2)}%
                    </td>
                    <td className="px-1 py-0.5">
                      {t.maxDcaIndex}/{t.totalGridOrders}
                    </td>
                    <td className="pl-1 py-0.5">{fmtDays(t.durationMs)}</td>
                    <td className={`pl-1 py-0.5 ${t.maxDrawdownPct < 0 ? "text-red-400" : ""}`}>
                      {t.maxDrawdownPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lastTrades.length === 0 ? (
            <p className="text-center text-xs text-[#787b86]">Нет сделок</p>
          ) : null}
        </Panel>

        <Panel title="Позиция (на конец данных)">
          {pos ? (
            <>
              <Row k="Средняя" v={pos.avgEntryPrice.toFixed(1)} />
              <Row k="TP" v={pos.takeProfitPrice.toFixed(1)} />
              <Row k="Mark (close)" v={pos.markPrice.toFixed(1)} />
              <Row k="Ордеров" v={`${pos.filledLevels}/${pos.totalGridOrders}`} />
              <Row
                k="PnL % маржи"
                v={`${pos.unrealizedPnlPctOnMargin.toFixed(2)}%`}
                vClass={pos.unrealizedPnlPctOnMargin >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <Row k="До TP" v={`${pos.distanceToTpPct.toFixed(2)}%`} />
              <Row k="Дней" v={fmtDays(pos.durationMs)} />
              <Row
                k="Max DD"
                v={`${pos.maxDrawdownPct.toFixed(2)}%`}
                vClass={pos.maxDrawdownPct < 0 ? "text-red-400" : ""}
              />
              <Row
                k="Вход"
                v={pos.firstEntryKind === "limit" ? "LIMIT" : "MARKET"}
                vClass="text-sky-400"
              />
              <p className="pt-1 text-[10px] leading-tight text-[#6b7280]">
                Снимок по последнему бару OHLCV до записи сделки как «конец теста». Реализованный PnL см. в
                таблице сделок.
              </p>
            </>
          ) : (
            <p className="text-xs text-[#787b86]">
              На последнем баре открытой позиции не было (или данные восстановлены из снимка без поля
              openPositionAtDataEnd).
            </p>
          )}
          {eot.length > 0 ? (
            <p className="mt-2 text-[10px] text-amber-200/80">
              Закрыто на конце выборки: {eot.length} сделок (end_of_test).
            </p>
          ) : null}
        </Panel>

        <Panel title="Статистика">
          <Row k="Сделок" v={closed.length} />
          <Row
            k="Win / %"
            v={`${wins.length} — ${closed.length ? ((100 * wins.length) / closed.length).toFixed(1) : "0"}%`}
            vClass="text-emerald-400"
          />
          <Row k="Loss" v={losses.length} />
          <Row k="Avg PnL%" v={`${avgPnlPct.toFixed(2)}%`} vClass="text-emerald-400" />
          <Row k="Σ PnL%" v={`${sumPnlPct.toFixed(1)}%`} vClass="text-emerald-400" />
          <Row k="Max PnL%" v={`${maxPnlPct.toFixed(2)}%`} />
          <Row k="Avg сетка" v={`${avgDca.toFixed(1)}/${totalOrders}`} />
          <Row k="Max сетка" v={`${maxDca}/${totalOrders}`} />
          <Row k="Avg дней" v={closed.length ? fmtDays(avgDurMs) : "—"} />
          <Row
            k="Max дней"
            v={closed.length ? fmtDays(Math.max(...closed.map((t) => t.durationMs))) : "—"}
          />
          <Row k="Worst DD" v={`${worstDdClosed.toFixed(2)}%`} vClass="text-red-400" />
          <Row k="Lim / Mkt" v={`${lim} / ${mkt}`} />
        </Panel>

        <Panel title="Время сделок">
          {pos ? (
            <>
              <Row k="Открыта (тек.)" v={fmtDays(pos.durationMs)} />
              <Row k="Баров (тек.)" v={String(pos.durationBars)} />
            </>
          ) : null}
          <Row k="Закрыто" v={String(closed.length)} />
          <Row k="Avg дн" v={closed.length ? (totalDaysInTrades / closed.length).toFixed(2) : "—"} />
          <Row k="Med дн" v={closed.length ? median(durationsDays).toFixed(2) : "—"} />
          <Row
            k="Min/Max дн"
            v={
              closed.length
                ? `${Math.min(...durationsDays).toFixed(2)} / ${Math.max(...durationsDays).toFixed(2)}`
                : "—"
            }
          />
          <Row k="σ дн" v={closed.length ? stdSample(durationsDays).toFixed(2) : "—"} />
          <Row k="Σ дней" v={totalDaysInTrades.toFixed(2)} />
          <Row k="Avg бар" v={avgBars ? avgBars.toFixed(1) : "—"} />
          <Row k="Min/Max б" v={durBars.length ? `${minBars} / ${maxBars}` : "—"} />
          <Row
            k="Последняя"
            v={lastClosed ? fmtDays(lastClosed.durationMs) : "—"}
            vClass="text-sky-400"
          />
          <Row k="Пред." v={prevClosed ? fmtDays(prevClosed.durationMs) : "—"} />
          <Row k="бар/день" v={barsPerDay.toFixed(0)} />
        </Panel>
      </div>
    </div>
  );
}
