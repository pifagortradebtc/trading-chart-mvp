"use client";

import {
  applyPifagorTvDefaults,
  DEFAULT_PIFAGOR_ALTS,
  DEFAULT_PIFAGOR_DCA,
  DEFAULT_PIVOT21,
} from "@/lib/backtest/backtestDefaults";
import { PORTFOLIO_ALTS_SYMBOL_COUNT } from "@/lib/backtest/portfolioAltsSymbols";
import type { BacktestSettings } from "@/lib/backtest/types";

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 cursor-help text-sky-400/90" title={String(children)}>
      ⓘ
    </span>
  );
}

export function BacktestSettingsForm({
  settings,
  onChange,
}: {
  settings: BacktestSettings;
  onChange: (s: BacktestSettings) => void;
}) {
  const patch = (partial: Partial<BacktestSettings>) =>
    onChange({ ...settings, ...partial });
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
          <label className="flex flex-col gap-1">
            <span>
              Таймфрейм depth-данных
              <Tip>
                Должен совпадать с интервалом OHLCV в загрузке выше. Pifagor VPS отдаёт depth
                с разной плотностью: на 1m только последние ~9 дней полные, на 1h — год.
              </Tip>
            </span>
            <select
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
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
              <option value="1h">1h (стабильное за весь год) — рекомендуем</option>
            </select>
          </label>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
            ⚠️ Depth-данные тянутся с Pifagor VPS (`pifagor.153.80.192.107.nip.io`).
            Live-collector пишет ~600k snapshots/мес для текущего месяца; за прошлое — tardis
            archive ~20k/мес (1 snap каждые ~2 мин). На 1m прошлое будет с пропусками,
            на 1h всё стабильно.
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
          {settings.strategyKind === "buyforce_dca" ||
          settings.strategyKind === "sellforce_dca" ? (
            <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Торговый депозит USDT
                <Tip>
                  Сумма на торговом счёте, которая участвует в расчёте сетки бота (ордера, номинал). Не весь
                  кошелёк — только выделенный под эту стратегию торговый капитал.
                </Tip>
              </span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.startDepositUsdt}
                onChange={(e) =>
                  patchDca({ startDepositUsdt: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>
                Первый ордер, % от торгового депозита
                <Tip>
                  Первый ордер = торговый депозит × % / 100. Процент считается именно от торгового депозита, не от
                  полного баланса кошелька.
                </Tip>
              </span>
              <input
                type="number"
                step={0.01}
                min={0.01}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.firstOrderDepositPct}
                onChange={(e) =>
                  patchDca({ firstOrderDepositPct: Number(e.target.value) })
                }
              />
              <span className="text-[10px] text-[#6b7280]">
                ≈{" "}
                {(
                  (settings.dca.startDepositUsdt * settings.dca.firstOrderDepositPct) /
                  100
                ).toLocaleString("ru-RU", {
                  maximumFractionDigits: 2,
                })}{" "}
                USDT при текущем торговом депозите
              </span>
              <span className="text-[10px] text-[#6b7280]">
                Для LONG по сетке Pine сумма ордеров = «Сумма сетки» ниже (или депозит, если пусто); % первого ордера
                в этом режиме не задаёт распределение лонг-сетки.
              </span>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>
              Сумма номиналов сетки USDT (Pine marginPerTrade)
              <Tip>
                Опционально: если задано, сумма USDT по всем ордерам лонг-сетки равна этому значению (как в Pine).
                Пустое поле — используется торговый депозит.
              </Tip>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={settings.dca.gridTotalNotionalUsdt ?? ""}
              placeholder={`по умолчанию ${settings.dca.startDepositUsdt}`}
              onChange={(e) =>
                patchDca({
                  gridTotalNotionalUsdt:
                    e.target.value === "" || Number(e.target.value) <= 0
                      ? undefined
                      : Number(e.target.value),
                })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Тип маржи
                <Tip>
                  Кросс: в расчётах бэктеста учитывается соотношение полного баланса к торговому депозиту
                  (упрощённая модель ликвидации). Изолированная: только equity стратегии от торгового депозита.
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
            <label className="flex flex-col gap-1">
              <span>
                Баланс кошелька USDT (всего на счёте)
                <Tip>
                  Полный баланс аккаунта: торговый депозит + средства под поддерживающую маржу и общий залог при
                  кроссе. В сетку и первый ордер % заходит только торговый депозит; остальное — запас ликвидности
                  на счёте (в модели кросса от этого зависит масштаб оценки ликвидации относительно торгового депозита).
                  При изолированной марже поле для расчёта ликвидации не используется.
                </Tip>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.walletBalanceUsdt}
                onChange={(e) => patchDca({ walletBalanceUsdt: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Плечо</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.leverage}
                onChange={(e) => patchDca({ leverage: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Ордеров в сетке</span>
              <input
                type="number"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.ordersCount}
                onChange={(e) => patchDca({ ordersCount: Number(e.target.value) })}
              />
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

      {settings.strategyKind === "buyforce_dca" ||
      settings.strategyKind === "sellforce_dca" ||
      settings.strategyKind === "pivot21" ? (
      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Исполнение
        </h3>
        <div className="flex flex-wrap gap-6 text-sm">
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
