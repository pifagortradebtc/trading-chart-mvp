"use client";

import { useMemo } from "react";
import {
  applyPifagorTvDefaults,
  DEFAULT_CHAIK,
  DEFAULT_PIFAGOR_ALTS,
  DEFAULT_PIFAGOR_DCA,
  DEFAULT_PIVOT21,
} from "@/lib/backtest/backtestDefaults";
import { buildDcaGrid } from "@/lib/backtest/dcaGrid";
import { PORTFOLIO_ALTS_SYMBOL_COUNT } from "@/lib/backtest/portfolioAltsSymbols";
import type { BacktestSettings } from "@/lib/backtest/types";

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 cursor-help text-sky-400/90" title={String(children)}>
      ⓘ
    </span>
  );
}

/**
 * Превью DCA-сетки по текущим settings: компактная таблица всех ордеров +
 * предупреждения. Использует тот же builder, что и движок бэктеста.
 *
 * Зачем: оператор видит сразу, какие реально цены и суммы ордеров получатся.
 * «Первый ордер 20%» × 6 ордеров в режиме LONG = НЕ 120% депозита, а
 * marginPerTrade распределяется по 6 ордерам через volumeFactor.
 */
function DcaGridPreview({ settings }: { settings: BacktestSettings }) {
  const ANCHOR = 100;
  // Если allowLong → long, иначе short.
  const useShort = !settings.dca.allowLong && settings.dca.allowShort;

  const grid = useMemo(() => {
    try {
      return buildDcaGrid(useShort ? "short" : "long", ANCHOR, settings.dca);
    } catch {
      return { side: "long" as const, firstEntryPrice: ANCHOR, rows: [] };
    }
  }, [settings.dca, useShort]);

  const totalNotional = grid.rows.reduce((s, r) => s + r.qtyCoin * r.price, 0);
  const lastRow = grid.rows[grid.rows.length - 1];
  const margin = settings.dca.gridTotalNotionalUsdt ?? settings.dca.startDepositUsdt;
  const ratio = margin > 0 ? totalNotional / margin : 0;
  const overshoot = ratio > 1.001 ? (ratio - 1) * 100 : 0;
  const drawdownAtFullFillPct = lastRow
    ? useShort
      ? ((lastRow.price - ANCHOR) / ANCHOR) * 100
      : ((ANCHOR - lastRow.price) / ANCHOR) * 100
    : 0;

  if (grid.rows.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
        ⚠ Сетка не строится — проверь «Перекрытие цены %» (&gt; 0),
        «Сумма ордеров» (&gt; 0) и «Кол-во ордеров» (≥ 1).
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#2e3241] bg-[#0c0e14] p-3 text-[11px]">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono uppercase tracking-wide text-[#787b86]">
          Превью сетки ({useShort ? "SHORT" : "LONG"} · {grid.rows.length} ордеров)
        </span>
        <span className="font-mono text-[10px] text-[#6b7280]">
          anchor = 100, цены в %
        </span>
      </div>
      <table className="w-full font-mono text-[10.5px]">
        <thead className="text-[#787b86]">
          <tr className="border-b border-[#1f2230]">
            <th className="py-1 text-left">#</th>
            <th className="py-1 text-right">Цена</th>
            <th className="py-1 text-right">Δ entry</th>
            <th className="py-1 text-right">USDT</th>
            <th className="py-1 text-right">% депо</th>
            <th className="py-1 text-right">Cum USDT</th>
            <th className="py-1 text-right">Avg</th>
            <th className="py-1 text-right">TP</th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => {
            const orderUsdt = r.qtyCoin * r.price;
            const dPct = ((r.price - ANCHOR) / ANCHOR) * 100;
            const pctDepo = margin > 0 ? (orderUsdt / margin) * 100 : 0;
            return (
              <tr key={r.orderIndex} className="border-b border-[#1f2230]/60">
                <td className="py-0.5 text-[#d1d4dc]">{r.orderIndex}</td>
                <td className="py-0.5 text-right text-[#d1d4dc]">{r.price.toFixed(2)}</td>
                <td
                  className={`py-0.5 text-right ${
                    dPct < 0 ? "text-rose-300" : dPct > 0 ? "text-emerald-300" : "text-[#787b86]"
                  }`}
                >
                  {dPct >= 0 ? "+" : ""}
                  {dPct.toFixed(2)}%
                </td>
                <td className="py-0.5 text-right text-[#d1d4dc]">{orderUsdt.toFixed(2)}</td>
                <td className="py-0.5 text-right text-[#787b86]">{pctDepo.toFixed(1)}%</td>
                <td className="py-0.5 text-right text-[#a8b3cf]">{r.cumNotionalUsdt.toFixed(2)}</td>
                <td className="py-0.5 text-right text-violet-300">{r.avgPrice.toFixed(2)}</td>
                <td className="py-0.5 text-right text-emerald-300">{r.takeProfitPrice.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px]">
        <span className="text-[#787b86]">Сумма ордеров (USDT):</span>
        <span className="text-right font-mono text-[#d1d4dc]">
          {totalNotional.toFixed(2)} / {margin.toFixed(2)}
        </span>
        <span className="text-[#787b86]">Просадка при полной сетке:</span>
        <span className="text-right font-mono text-rose-300">{drawdownAtFullFillPct.toFixed(2)}%</span>
      </div>

      {overshoot > 0 && (
        <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10.5px] text-rose-200">
          ⚠ Сумма ордеров превышает депозит на {overshoot.toFixed(1)}%. Уменьши
          «Сумма номиналов сетки» или включи плечо.
        </div>
      )}
      {settings.dca.priceOverlapPct < 5 && (
        <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-100">
          ⚠ Перекрытие {settings.dca.priceOverlapPct}% — сетка очень узкая,
          сделки часто будут полностью заполняться и идти в SL/ликвидацию.
        </div>
      )}
      {settings.dca.priceOverlapPct > 50 && (
        <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-100">
          ⚠ Перекрытие {settings.dca.priceOverlapPct}% — глубокая сетка,
          крайние ордера могут никогда не заполниться.
        </div>
      )}
      {!useShort &&
        Math.abs(settings.dca.volumeFactor - 1) < 0.01 &&
        grid.rows.length > 1 && (
          <div className="mt-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10.5px] text-sky-100">
            ℹ Volume factor = 1: все ордера одного размера (
            {(100 / grid.rows.length).toFixed(1)}% депозита каждый). Параметр
            «Первый ордер %» в LONG-режиме игнорируется — реальный размер
            диктуется суммой сетки.
          </div>
        )}
      {settings.dca.takeProfitPct < 0.5 && (
        <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-100">
          ⚠ TP {settings.dca.takeProfitPct}% очень маленький — комиссия (
          {(settings.dca.feePctPerSide * 2).toFixed(3)}%) может съесть значительную
          часть прибыли.
        </div>
      )}
    </div>
  );
}

export function BacktestSettingsForm({
  settings,
  onChange,
}: {
  settings: BacktestSettings;
  onChange: (s: BacktestSettings) => void;
}) {
  /**
   * Логика «будут ли реально такие сделки» совпадает с движком (backtestEngine.ts:92-94):
   *   short = allowShort && (mode === "short" || mode === "auto")
   * Используем для дизейбла «Первый ордер %» (это SHORT-only поле).
   */
  const willTradeShort =
    settings.dca.allowShort &&
    (settings.dca.mode === "short" || settings.dca.mode === "auto");
  const isCrossMargin = settings.dca.marginMode === "cross";

  /**
   * Класс «поле не применяется в текущем режиме» — полупрозрачное + крестик при ховере + readonly.
   * Не используем pointer-events-none, чтобы тултип «почему серое» оставался ховерабельным.
   */
  const inactiveClass = "opacity-40";

  const patch = (partial: Partial<BacktestSettings>) =>
    onChange({ ...settings, ...partial });
  const patchInd = (partial: Partial<BacktestSettings["indicator"]>) =>
    onChange({ ...settings, indicator: { ...settings.indicator, ...partial } });
  const patchDca = (partial: Partial<BacktestSettings["dca"]>) =>
    onChange({ ...settings, dca: { ...settings.dca, ...partial } });
  const patchPif = (partial: Partial<BacktestSettings["pifagorAlts"]>) =>
    onChange({
      ...settings,
      pifagorAlts: { ...settings.pifagorAlts, ...partial },
    });
  const patchPv = (partial: Partial<BacktestSettings["pivot21"]>) =>
    onChange({
      ...settings,
      pivot21: { ...settings.pivot21, ...partial },
    });
  const patchBuy = (partial: Partial<BacktestSettings["buyForce"]>) =>
    onChange({
      ...settings,
      buyForce: { ...settings.buyForce, ...partial },
    });
  const patchSell = (partial: Partial<BacktestSettings["sellForce"]>) =>
    onChange({
      ...settings,
      sellForce: { ...settings.sellForce, ...partial },
    });

  /**
   * Упрощённая модель «как думает трейдер» поверх Pine-полей под капотом:
   *   Депозит       = startDepositUsdt (счёт под стратегию, база метрик)
   *   Плечо         = leverage
   *   Маржа/сделку  = gridTotalNotionalUsdt / leverage (реальный залог при full grid)
   *   Доп. баланс   = max(0, walletBalanceUsdt − startDepositUsdt) (страхует в Cross)
   *
   * Под капотом всё остаётся в старых полях типа DcaBotSettings — старые снимки
   * без миграций раскладываются обратно (extra просто будет 0..N).
   */
  const dca = settings.dca;
  const gridNotionalEffective =
    dca.gridTotalNotionalUsdt && dca.gridTotalNotionalUsdt > 0
      ? dca.gridTotalNotionalUsdt
      : dca.startDepositUsdt;
  const marginPerTradeUsdt = dca.leverage > 0 ? gridNotionalEffective / dca.leverage : 0;
  const marginPctOfDepo =
    dca.startDepositUsdt > 0 ? (marginPerTradeUsdt / dca.startDepositUsdt) * 100 : 0;
  const extraFreeBalance = Math.max(0, dca.walletBalanceUsdt - dca.startDepositUsdt);
  const walletTotalUsdt = dca.startDepositUsdt + extraFreeBalance;
  const freeBufferAfterTrade = Math.max(0, walletTotalUsdt - marginPerTradeUsdt);

  /** Изменения «как трейдер» → правильно раскладываем в Pine-поля. */
  const setDeposit = (newDepo: number) => {
    const depo = Number.isFinite(newDepo) && newDepo > 0 ? newDepo : 0;
    patchDca({
      startDepositUsdt: depo,
      walletBalanceUsdt: depo + extraFreeBalance,
      /** Сохраняем долю маржи: gridNotional = margin% × depo × leverage. */
      gridTotalNotionalUsdt:
        marginPctOfDepo > 0 && depo > 0
          ? (depo * marginPctOfDepo * dca.leverage) / 100
          : depo,
    });
  };
  const setLeverage = (newLev: number) => {
    const lev = Number.isFinite(newLev) && newLev > 0 ? newLev : 1;
    /** Маржу держим постоянной → номинал масштабируется с плечом. */
    patchDca({
      leverage: lev,
      gridTotalNotionalUsdt: marginPerTradeUsdt * lev,
    });
  };
  const setMarginUsdt = (newMargin: number) => {
    const m = Number.isFinite(newMargin) && newMargin > 0 ? newMargin : 0;
    /** Cap: маржа не может быть больше депозита (иначе бот залезет в чужие деньги). */
    const capped = Math.min(m, dca.startDepositUsdt);
    patchDca({ gridTotalNotionalUsdt: capped * dca.leverage });
  };
  const setExtraFreeBalance = (newExtra: number) => {
    const extra = Number.isFinite(newExtra) && newExtra > 0 ? newExtra : 0;
    patchDca({ walletBalanceUsdt: dca.startDepositUsdt + extra });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Модель бэктеста
        </h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[#787b86]">Стратегия</span>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
              value={settings.strategyKind}
              onChange={(e) => {
                const strategyKind = e.target.value as BacktestSettings["strategyKind"];
                if (strategyKind === "pifagor_alts") {
                  onChange(
                    applyPifagorTvDefaults(
                      { ...settings, strategyKind },
                      {
                        startDepositUsdt: DEFAULT_PIFAGOR_DCA.startDepositUsdt,
                        entryNotionalUsdt: DEFAULT_PIFAGOR_ALTS.entryNotionalUsdt,
                      },
                    ),
                  );
                } else if (strategyKind === "pivot21") {
                  onChange({
                    ...settings,
                    strategyKind,
                    pivot21: { ...DEFAULT_PIVOT21, ...settings.pivot21 },
                  });
                } else {
                  onChange({ ...settings, strategyKind });
                }
              }}
            >
              <option value="chaik_dca">V2_ЧайкКельт + DCA-сетка</option>
              <option value="buyforce_dca">Pifagor BuyForce + DCA (LONG)</option>
              <option value="sellforce_dca">Pifagor SellForce + DCA (SHORT)</option>
              <option value="pifagor_alts">Pifagor ALTS 3.7 (лонг, без сетки)</option>
              <option value="pivot21">Pifagor 21 (Pivot Magnet)</option>
            </select>
          </label>
          {settings.strategyKind === "pifagor_alts" ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                <input
                  type="checkbox"
                  className="rounded border-violet-400/40"
                  checked={settings.portfolioAltsMode}
                  onChange={(e) => patch({ portfolioAltsMode: e.target.checked })}
                />
                <span>
                  Портфельный режим ({PORTFOLIO_ALTS_SYMBOL_COUNT} монет CMC top)
                  <Tip>
                    Одновременный бэктест по списку альтов: PnL по каждой монете, max DD на суммарный капитал,
                    открытые позиции. Депозит и размер входа — на каждый актив отдельно (как отдельный график в TV).
                    OHLCV грузится с Binance автоматически.
                  </Tip>
                </span>
              </label>
              <p className="max-w-2xl text-xs leading-relaxed text-[#787b86]">
                Логика как в Pine Pifagor_ALTS 3.7 (pyramiding 200, fee 0, выход mult/diff). В UI — депозит, размер
                входа и опции ниже; остальное — автоматически для совпадения с TradingView.
              </p>
            </>
          ) : null}
        </div>
      </section>

      {settings.strategyKind === "chaik_dca" ? (
      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
            Индикатор V2_ЧайкКельт
          </h3>
          <button
            type="button"
            className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/20"
            title="Все поля блока — значения из Pine по умолчанию (вход в сделку)"
            onClick={() => patchInd({ ...DEFAULT_CHAIK })}
          >
            Как в Pine (дефолты входа)
          </button>
        </div>
        <div className="grid gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[#787b86]">
              Фильтр направления Pine
              <Tip>auto / только long / только short на уровне индикатора</Tip>
            </span>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
              value={settings.indicator.directionFilter}
              onChange={(e) =>
                patchInd({
                  directionFilter: e.target.value as BacktestSettings["indicator"]["directionFilter"],
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="long_only">Long only</option>
              <option value="short_only">Short only</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Chaikin fast</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.chaikinFast}
                onChange={(e) => patchInd({ chaikinFast: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Chaikin slow</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.chaikinSlow}
                onChange={(e) => patchInd({ chaikinSlow: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>
              ADX порог (боковик ≤)
              <Tip>Выше — тренд, ниже или равно — боковик в логике сигнала</Tip>
            </span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.indicator.adxThreshold}
              onChange={(e) => patchInd({ adxThreshold: Number(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                RSI range long &lt;
                <Tip>Порог RSI для LONG в боковике</Tip>
              </span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.rsiRangeThresholdLong}
                onChange={(e) =>
                  patchInd({ rsiRangeThresholdLong: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                RSI trend long &lt;
                <Tip>Порог RSI для LONG в тренде</Tip>
              </span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.rsiTrendThresholdLong}
                onChange={(e) =>
                  patchInd({ rsiTrendThresholdLong: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>Длина EMA отката</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.indicator.emaPullbackLen}
              onChange={(e) => patchInd({ emaPullbackLen: Number(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span>Keltner EMA</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.keltnerEmaLen}
                onChange={(e) => patchInd({ keltnerEmaLen: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Keltner ATR</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.keltnerAtrLen}
                onChange={(e) => patchInd({ keltnerAtrLen: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Keltner mult</span>
              <input
                type="number"
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.indicator.keltnerMult}
                onChange={(e) => patchInd({ keltnerMult: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>Cooldown (баров)</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.indicator.cooldownBars}
              onChange={(e) => patchInd({ cooldownBars: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>
              ТФ Чайкина (метка Pine)
              <Tip>
                В Pine осциллятор на `request.security`; в веб-бэктесте ряд совпадает с загруженным ТФ графика.
                Для сравнения с TV задайте тот же интервал на графике или совпадающий расчёт.
              </Tip>
            </span>
            <input
              type="text"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.indicator.chaikinTf}
              onChange={(e) => patchInd({ chaikinTf: e.target.value })}
            />
          </label>
          <div className="rounded-lg border border-[#2e3241] bg-[#0c0e14]/60 px-3 py-2">
            <p className="mb-2 text-xs text-[#787b86]">
              Якорь лонга (ОТКАТОМ БЭК V2): при лимите якорь = close − ATR×k, иначе close; ATR по длине Keltner ATR.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.indicator.useLimitRange}
                  onChange={(e) => patchInd({ useLimitRange: e.target.checked })}
                />
                <span>Лимит в боковике</span>
              </label>
              <label className="flex flex-col gap-1">
                <span>k ATR (боковик)</span>
                <input
                  type="number"
                  step={0.01}
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.limitRangeAtr}
                  onChange={(e) => patchInd({ limitRangeAtr: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.indicator.useLimitTrend}
                  onChange={(e) => patchInd({ useLimitTrend: e.target.checked })}
                />
                <span>Лимит в тренде</span>
              </label>
              <label className="flex flex-col gap-1">
                <span>k ATR (тренд)</span>
                <input
                  type="number"
                  step={0.01}
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.limitTrendAtr}
                  onChange={(e) => patchInd({ limitTrendAtr: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-[#2e3241]"
              checked={settings.indicator.crossMode}
              onChange={(e) => patchInd({ crossMode: e.target.checked })}
            />
            <span className="text-[#787b86]">
              Только пересечение нуля Чайкина
              <Tip>Pine cross_mode: сигнал на баре пересечения, а не пока осциллятор с нужной стороны нуля</Tip>
            </span>
          </label>
          <details className="rounded-lg border border-[#2e3241] bg-[#0c0e14]/80 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-[#787b86]">
              Остальные параметры входа (как в Pine)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span>Период ADX</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.adxLength}
                  onChange={(e) => patchInd({ adxLength: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Окно диапазона (баров)</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rangeBars}
                  onChange={(e) => patchInd({ rangeBars: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Макс. позиция лонг %</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rangeMaxPctLong}
                  onChange={(e) => patchInd({ rangeMaxPctLong: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Мин. позиция шорт %</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rangeMinPctShort}
                  onChange={(e) => patchInd({ rangeMinPctShort: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Допуск отката к EMA %</span>
                <input
                  type="number"
                  step={0.1}
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.pullbackPct}
                  onChange={(e) => patchInd({ pullbackPct: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Баров для импульса (lookback)</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.divLookback}
                  onChange={(e) => patchInd({ divLookback: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Период RSI</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rsiLen}
                  onChange={(e) => patchInd({ rsiLen: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  checked={settings.indicator.rsiEnabled}
                  onChange={(e) => patchInd({ rsiEnabled: e.target.checked })}
                />
                <span>RSI включён</span>
              </label>
              <label className="flex flex-col gap-1">
                <span>RSI шорт боковик &gt;</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rsiRangeThresholdShort}
                  onChange={(e) =>
                    patchInd({ rsiRangeThresholdShort: Number(e.target.value) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>RSI шорт тренд &gt;</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.indicator.rsiTrendThresholdShort}
                  onChange={(e) =>
                    patchInd({ rsiTrendThresholdShort: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </details>
        </div>
      </section>
      ) : null}

      {settings.strategyKind === "buyforce_dca" ||
      settings.strategyKind === "sellforce_dca" ? (
      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
            {settings.strategyKind === "buyforce_dca"
              ? "Индикатор BuyForce (LONG)"
              : "Индикатор SellForce (SHORT)"}
          </h3>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
            {settings.strategyKind === "buyforce_dca"
              ? "RO = (bid_3 − ask_8) / ask_1.5"
              : "RO = (ask_3 − bid_8) / bid_1.5"}
          </span>
        </div>
        <div className="grid gap-3 text-sm">
          <p className="text-xs leading-relaxed text-[#787b86]">
            {settings.strategyKind === "buyforce_dca"
              ? "Триггер LONG: RO пересекает уровень нуля снизу вверх. Один сигнал на одно пересечение (edge trigger)."
              : "Триггер SHORT: RO пересекает уровень нуля снизу вверх. Один сигнал на одно пересечение (edge trigger)."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Уровень нуля
                <Tip>
                  Порог пересечения RO. По умолчанию 0. Можно повысить чтобы фильтровать слабые сигналы
                  (например +0.05 — войти только при сильном положительном RO).
                </Tip>
              </span>
              <input
                type="number"
                step="0.01"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
                value={
                  settings.strategyKind === "buyforce_dca"
                    ? settings.buyForce.zeroLevel
                    : settings.sellForce.zeroLevel
                }
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  if (settings.strategyKind === "buyforce_dca")
                    patchBuy({ zeroLevel: v });
                  else patchSell({ zeroLevel: v });
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Cooldown (баров)
                <Tip>
                  Минимум баров между сигналами. 1 = можно сразу на следующем баре.
                  Выше — реже сигналы, меньше шумных входов.
                </Tip>
              </span>
              <input
                type="number"
                min="0"
                step="1"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
                value={
                  settings.strategyKind === "buyforce_dca"
                    ? settings.buyForce.cooldownBars
                    : settings.sellForce.cooldownBars
                }
                onChange={(e) => {
                  const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  if (settings.strategyKind === "buyforce_dca")
                    patchBuy({ cooldownBars: v });
                  else patchSell({ cooldownBars: v });
                }}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 opacity-60">
            <span>
              Таймфрейм depth-данных (авто = ТФ графика)
              <Tip>
                Depth-данные ВСЕГДА подгружаются на том же ТФ, что выбран в загрузке OHLCV — это
                поле теперь не редактируется, только показывает текущий выбор. Поддерживаются
                интервалы 1m/5m/15m/1h. Pifagor VPS отдаёт depth с разной плотностью: на 1m
                только последние ~9 дней полные, на 1h — год.
              </Tip>
            </span>
            <select
              disabled
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc] disabled:cursor-not-allowed"
              value={settings.depthInterval}
              onChange={(e) =>
                patch({
                  depthInterval: e.target.value as BacktestSettings["depthInterval"],
                })
              }
            >
              <option value="1m">1m (полное покрытие ~9 дней)</option>
              <option value="5m">5m (умеренное за год)</option>
              <option value="15m">15m (хорошее за год)</option>
              <option value="1h">1h (стабильное за весь год)</option>
            </select>
            <span className="text-[10px] text-[#6b7280]">
              При запуске бэктеста depth-данные грузятся на интервале графика. Чтобы изменить —
              переключи ТФ в загрузке OHLCV.
            </span>
          </label>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
            ⚠️ Depth-данные тянутся с Pifagor VPS. Live-collector пишет ~600k snapshots/мес
            для текущего месяца; за прошлое — tardis archive ~20k/мес (1 snap каждые ~2 мин).
            На 1m прошлое будет с пропусками, на 1h всё стабильно. Допустимые ТФ для BuyForce/SellForce:
            <strong className="text-amber-200"> 1m, 5m, 15m, 1h</strong> (4h/1d/1w не поддерживаются).
          </p>
        </div>
      </section>
      ) : null}

      {settings.strategyKind !== "pivot21" ? (
      <section
        className={`rounded-xl border border-[#2e3241] bg-[#131722] p-5 ${
          settings.strategyKind === "pifagor_alts" ? "lg:col-span-2" : ""
        }`}
      >
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          {settings.strategyKind === "pifagor_alts" ? "Капитал и размер входа" : "DCA-бот"}
        </h3>
        <div className="grid gap-3 text-sm">
          {settings.strategyKind === "chaik_dca" ||
          settings.strategyKind === "buyforce_dca" ||
          settings.strategyKind === "sellforce_dca" ? (
            <>
          {/* Капитал и плечо — три простых поля как думает трейдер */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Депозит USDT (на счёте под стратегию)
                <Tip>
                  Сумма USDT, выделенная под этого DCA-бота. От неё считаются все %-метрики
                  (Return%, MaxDD%). Если у тебя на бирже есть ещё деньги под другие стратегии,
                  укажи их ниже в «Доп. свободный баланс».
                </Tip>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.startDepositUsdt}
                onChange={(e) => setDeposit(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Плечо
                <Tip>
                  При изменении плеча «Маржа на сделку» фиксируется, а номинал позиции масштабируется.
                  Пример: маржа 2500 USDT × плечо 4 = номинал 10 000 USDT.
                </Tip>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
              />
            </label>
          </div>

          {/* Маржа на сделку — главное поле «сколько реально торгуется» */}
          <label className="flex flex-col gap-1">
            <span>
              Маржа на сделку USDT
              <Tip>
                Реальный залог, который замораживается на счёте при полном заполнении DCA-сетки.
                Должна быть ≤ депозиту. Номинал позиции (face value) = маржа × плечо — именно эта сумма
                распределяется по ордерам сетки. Эквивалентно Pine `marginPerTrade / leverage`.
              </Tip>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                max={settings.dca.startDepositUsdt}
                className="flex-1 rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={Math.round(marginPerTradeUsdt * 100) / 100}
                onChange={(e) => setMarginUsdt(Number(e.target.value))}
              />
              <span className="whitespace-nowrap font-mono text-[11px] text-[#787b86]">
                ≈ {marginPctOfDepo.toFixed(1)}% депо
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] px-2 py-1.5 text-[10.5px]">
              <span className="text-[#787b86]">Номинал позиции (full grid):</span>
              <span className="text-right font-mono text-cyan-200">
                {(marginPerTradeUsdt * settings.dca.leverage).toLocaleString("ru-RU", {
                  maximumFractionDigits: 0,
                })}{" "}
                USDT
              </span>
              <span className="text-[#787b86]">Свободно на счёте после full grid:</span>
              <span className="text-right font-mono text-emerald-200">
                {freeBufferAfterTrade.toLocaleString("ru-RU", {
                  maximumFractionDigits: 0,
                })}{" "}
                USDT
              </span>
              {isCrossMargin && (
                <span className="col-span-2 text-[10px] text-[#787b86]">
                  В Cross этот буфер страхует позицию от ликвидации (биржа считает по всему счёту).
                </span>
              )}
            </div>
          </label>

          {/* Тип маржи + опц. доп. баланс на счёте сверх депо */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Тип маржи
                <Tip>
                  Cross: ликвидация считается от всего счёта (депозит + доп. баланс). Isolated: только от
                  маржи, посланной на позицию — ликвидация значительно ближе.
                </Tip>
              </span>
              <select
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
                value={settings.dca.marginMode}
                onChange={(e) =>
                  patchDca({
                    marginMode: e.target.value as BacktestSettings["dca"]["marginMode"],
                  })
                }
              >
                <option value="isolated">Изолированная</option>
                <option value="cross">Кросс</option>
              </select>
            </label>
            <label
              className={`flex flex-col gap-1 ${isCrossMargin ? "" : inactiveClass}`}
              title={
                isCrossMargin
                  ? undefined
                  : "В Isolated-режиме ликвидация считается только от маржи позиции; доп. баланс не страхует."
              }
            >
              <span>
                Доп. свободный баланс на счёте USDT (опц.)
                {!isCrossMargin && (
                  <span className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                    только CROSS
                  </span>
                )}
                <Tip>
                  Если на бирже под другие стратегии лежат ещё деньги — укажи их здесь. В Cross-режиме они
                  страхуют эту позицию от ликвидации (эффективное плечо для ликвидации ↓). На размеры
                  ордеров и метрики НЕ влияет — только на оценку ликвидации.
                </Tip>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                disabled={!isCrossMargin}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono disabled:cursor-not-allowed"
                value={extraFreeBalance}
                onChange={(e) => setExtraFreeBalance(Number(e.target.value))}
              />
              {isCrossMargin ? (
                <span className="text-[10px] text-[#6b7280]">
                  Полный кошелёк для ликвидации: {walletTotalUsdt.toLocaleString("ru-RU")} USDT
                </span>
              ) : (
                <span className="text-[10px] text-[#6b7280]">
                  Поле активно только в Cross. В Isolated ликвидация = от маржи позиции.
                </span>
              )}
            </label>
          </div>

          {/* Параметры сетки */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Ордеров в сетке</span>
              <input
                type="number"
                min={1}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.ordersCount}
                onChange={(e) => patchDca({ ordersCount: Number(e.target.value) })}
              />
            </label>
            <label
              className={`flex flex-col gap-1 ${willTradeShort ? "" : inactiveClass}`}
              title={
                willTradeShort
                  ? undefined
                  : "В режиме «Только LONG» это поле не используется. LONG-сетка строится из «Маржа на сделку» × плечо через volumeFactor."
              }
            >
              <span>
                Первый ордер, % от депозита
                {!willTradeShort && (
                  <span className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                    только SHORT
                  </span>
                )}
                <Tip>
                  Используется ТОЛЬКО для SHORT: первый ордер = депозит × % / 100, остальные =
                  первый × volumeFactor^i. Сумма SHORT-сетки набегает свободно.
                  В LONG это поле игнорируется — там сумма сетки = маржа × плечо.
                </Tip>
              </span>
              <input
                type="number"
                step={0.01}
                min={0.01}
                disabled={!willTradeShort}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono disabled:cursor-not-allowed"
                value={settings.dca.firstOrderDepositPct}
                onChange={(e) =>
                  patchDca({ firstOrderDepositPct: Number(e.target.value) })
                }
              />
              {willTradeShort ? (
                <span className="text-[10px] text-[#6b7280]">
                  ≈{" "}
                  {(
                    (settings.dca.startDepositUsdt * settings.dca.firstOrderDepositPct) /
                    100
                  ).toLocaleString("ru-RU", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  USDT — первый SHORT-ордер
                </span>
              ) : (
                <span className="text-[10px] text-[#6b7280]">
                  Не применяется в LONG: размер LONG-сетки = «Маржа на сделку» × плечо.
                </span>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>
              Перекрытие цены %
              <Tip>Общий диапазон усреднения от первой цены входа</Tip>
            </span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.dca.priceOverlapPct}
              onChange={(e) => patchDca({ priceOverlapPct: Number(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Price factor
                <Tip>Рост расстояния между уровнями сетки</Tip>
              </span>
              <input
                type="number"
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.priceFactor}
                onChange={(e) => patchDca({ priceFactor: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Volume factor
                <Tip>Рост объёма каждого следующего ордера</Tip>
              </span>
              <input
                type="number"
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.volumeFactor}
                onChange={(e) => patchDca({ volumeFactor: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Take profit %
                <Tip>
                  От текущей средней позиции после каждого DCA, не от первого входа; при нескольких входах цель — средняя плюс этот процент.
                </Tip>
              </span>
              <input
                type="number"
                step={0.01}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.takeProfitPct}
                onChange={(e) => patchDca({ takeProfitPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Stop loss % (optional)
                <Tip>Также от текущей средней позиции, если задан.</Tip>
              </span>
              <input
                type="number"
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.stopLossPct ?? ""}
                placeholder="—"
                onChange={(e) =>
                  patchDca({
                    stopLossPct:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-[#2e3241]"
              checked={settings.dca.takeProfitOnClose}
              onChange={(e) => patchDca({ takeProfitOnClose: e.target.checked })}
            />
            <span className="text-[#787b86]">
              TP по close бара (как Pine)
              <Tip>
                Включено: выход по TP, если close достиг цели. Выключено: достаточно касания high/low intrabar
                (агрессивнее).
              </Tip>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Комиссия % за сторону</span>
              <input
                type="number"
                step={0.001}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.feePctPerSide}
                onChange={(e) => patchDca({ feePctPerSide: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Funding % / 8ч</span>
              <input
                type="number"
                step={0.001}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.fundingPctPer8h}
                onChange={(e) =>
                  patchDca({ fundingPctPer8h: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.dca.allowLong}
                onChange={(e) => patchDca({ allowLong: e.target.checked })}
              />
              LONG
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.dca.allowShort}
                onChange={(e) => patchDca({ allowShort: e.target.checked })}
              />
              SHORT
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Режим бота</span>
              <select
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2"
                value={settings.dca.mode}
                onChange={(e) =>
                  patchDca({ mode: e.target.value as BacktestSettings["dca"]["mode"] })
                }
              >
                <option value="long">Только LONG</option>
                <option value="short">Только SHORT</option>
                <option value="auto">AUTO</option>
              </select>
            </label>
          </div>
          <DcaGridPreview settings={settings} />
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-[#787b86] lg:col-span-2">
                Остальные параметры (pyramiding 200, fee 0, риск «меньше», выход mult/diff, окно DCA 2017–2035)
                применяются автоматически — как в Pine TradingView.
              </p>
              <div className="grid max-w-lg grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span>
                    Торговый депозит USDT
                    <Tip>
                      {settings.portfolioAltsMode
                        ? "На каждую монету в портфеле — отдельный счёт с этим депозитом (как initial_capital в Pine на каждом графике)."
                        : "Как `initial_capital` в Pine."}
                    </Tip>
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-2 font-mono"
                    value={settings.dca.startDepositUsdt}
                    onChange={(e) =>
                      onChange(
                        applyPifagorTvDefaults(settings, {
                          startDepositUsdt: Number(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>
                    Размер одного входа USDT
                    <Tip>
                      {settings.portfolioAltsMode
                        ? "На каждый сигнал enter — фикс. USDT (strategy.cash), доливки без DCA-сетки."
                        : "Как `default_qty_value` в Pine (strategy.cash)."}
                    </Tip>
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-2 font-mono"
                    value={settings.pifagorAlts.entryNotionalUsdt}
                    onChange={(e) =>
                      onChange(
                        applyPifagorTvDefaults(settings, {
                          entryNotionalUsdt: Math.max(1, Number(e.target.value) || 0),
                        }),
                      )
                    }
                  />
                </label>
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-[#2e3241]"
                  checked={settings.pifagorAlts.closewhen100}
                  onChange={(e) => patchPif({ closewhen100: e.target.checked })}
                />
                <span className="text-[#d1d4dc]">
                  Закрывать при +100% прибыли
                  <Tip>
                    Как `closewhen100` в Pine: лимитный выход на 2× средней цены. Если выключено — только сигналы
                    стратегии (daily mult / diff).
                  </Tip>
                </span>
              </label>
            </>
          )}
        </div>
      </section>
      ) : null}

      {settings.strategyKind === "pivot21" ? (
        <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
              Pifagor 21 (Pivot Magnet)
            </h3>
            <button
              type="button"
              className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/20"
              title="Все поля блока — значения из Pine по умолчанию"
              onClick={() => patchPv({ ...DEFAULT_PIVOT21 })}
            >
              Как в Pine (дефолты)
            </button>
          </div>
          <p className="mb-4 max-w-2xl text-xs leading-relaxed text-[#787b86]">
            Каждый период `pivotTf` создаёт магнит = (H+L+C)/3 предыдущего периода. При flat — лимит-ордер на каждом
            валидном зрелом магните (LONG ниже close, SHORT выше). TP/SL — % от entry. Reversal: при касании магнита
            противоположной стороны переоткрываемся. Мартингейл размера: после стопа +step, после прибыли — сброс.
          </p>
          <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span>
                Pivot TF
                <Tip>Таймфрейм для расчёта pivot (H+L+C)/3 предыдущего периода</Tip>
              </span>
              <select
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
                value={settings.pivot21.pivotTf}
                onChange={(e) => patchPv({ pivotTf: e.target.value })}
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1D</option>
                <option value="1w">1W</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>
                keepP
                <Tip>Сколько последних магнитов держать (старые удаляются)</Tip>
              </span>
              <input
                type="number"
                min={1}
                max={490}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.keepP}
                onChange={(e) => patchPv({ keepP: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                projBars
                <Tip>Визуальная проекция магнита (только для UI, на торговлю не влияет)</Tip>
              </span>
              <input
                type="number"
                min={1}
                max={100}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.projBars}
                onChange={(e) => patchPv({ projBars: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                minMagnetAge
                <Tip>Минимум баров до того, как магнит можно торговать. Касание раньше = pre-invalid (gray).</Tip>
              </span>
              <input
                type="number"
                min={0}
                max={100}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.minMagnetAge}
                onChange={(e) => patchPv({ minMagnetAge: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Take Profit %
                <Tip>% от цены входа</Tip>
              </span>
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.tpPct}
                onChange={(e) => patchPv({ tpPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Stop Loss %
                <Tip>% от цены входа</Tip>
              </span>
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.slPct}
                onChange={(e) => patchPv({ slPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Стартовый размер позиции %
                <Tip>baseRiskPct — стартовая доля equity на сделку</Tip>
              </span>
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.baseRiskPct}
                onChange={(e) => patchPv({ baseRiskPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Макс. размер позиции %
                <Tip>maxRiskPct — потолок при мартингейле</Tip>
              </span>
              <input
                type="number"
                min={0.1}
                max={500}
                step={0.5}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.maxRiskPct}
                onChange={(e) => patchPv({ maxRiskPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Шаг увеличения после стопа %
                <Tip>stepRiskPct — на сколько растёт размер позиции после каждого STOP</Tip>
              </span>
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.stepRiskPct}
                onChange={(e) => patchPv({ stepRiskPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Начальный капитал USDT
                <Tip>initial_capital в Pine</Tip>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.initialCapitalUsdt}
                onChange={(e) => patchPv({ initialCapitalUsdt: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Комиссия % за сторону
                <Tip>В Pine выключена (0). Тут — для what-if проверки fee impact.</Tip>
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.pivot21.feePctPerSide}
                onChange={(e) => patchPv({ feePctPerSide: Number(e.target.value) })}
              />
            </label>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.pivot21.allowLong}
                  onChange={(e) => patchPv({ allowLong: e.target.checked })}
                />
                LONG
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.pivot21.allowShort}
                  onChange={(e) => patchPv({ allowShort: e.target.checked })}
                />
                SHORT
              </label>
            </div>
          </div>
        </section>
      ) : null}

      {settings.strategyKind === "chaik_dca" ||
      settings.strategyKind === "buyforce_dca" ||
      settings.strategyKind === "sellforce_dca" ||
      settings.strategyKind === "pivot21" ? (
      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Исполнение
        </h3>
        <div className="flex flex-wrap gap-6 text-sm">
          {settings.strategyKind === "chaik_dca" ? (
            <label className="flex flex-col gap-1">
              <span>
                Вход
                <Tip>
                  LONG ОТКАТОМ: якорь и лимит/маркет первого ордера задаются как в Pine (не этим селектором). Ниже —
                  только для SHORT: open следующей свечи или close сигнальной.
                </Tip>
              </span>
              <select
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2"
                value={settings.entryTiming}
                onChange={(e) =>
                  patch({
                    entryTiming: e.target.value as BacktestSettings["entryTiming"],
                  })
                }
              >
                <option value="next_open">Open следующей свечи</option>
                <option value="signal_close">Close сигнальной свечи</option>
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span>
              {settings.strategyKind === "pivot21"
                ? "Порядок при конфликте TP/SL на одной свече"
                : "Порядок при конфликте DCA/TP на одной свече"}
              <Tip>Консервативно — сначала худший для стратегии сценарий</Tip>
            </span>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2"
              value={settings.executionOrder}
              onChange={(e) =>
                patch({
                  executionOrder: e.target.value as BacktestSettings["executionOrder"],
                })
              }
            >
              <option value="conservative">Conservative</option>
              <option value="optimistic">Optimistic</option>
            </select>
          </label>
        </div>
      </section>
      ) : null}
    </div>
  );
}
