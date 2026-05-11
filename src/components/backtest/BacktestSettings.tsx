"use client";

import { DEFAULT_CHAIK } from "@/lib/backtest/backtestDefaults";
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
  const patchInd = (partial: Partial<BacktestSettings["indicator"]>) =>
    onChange({ ...settings, indicator: { ...settings.indicator, ...partial } });
  const patchDca = (partial: Partial<BacktestSettings["dca"]>) =>
    onChange({ ...settings, dca: { ...settings.dca, ...partial } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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

      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          DCA-бот
        </h3>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>Депозит USDT</span>
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
                Первый ордер, % от депозита
                <Tip>Пересчитывается при смене депозита: первый ордер = депозит × % / 100</Tip>
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
                USDT при текущем депозите
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span>
                Тип маржи
                <Tip>
                  Кросс: цена ликвидации и проверка маржи первого ордера используют полный баланс кошелька
                  относительно депозита стратегии (упрощённая модель). Изолированная: как раньше — только
                  equity стратегии.
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
                Баланс кошелька USDT
                <Tip>
                  Полный счёт для кросс-маржи (например в 4 раза больше учётного депозита при том же плече).
                  При изолированной марже на расчёт ликвидации не используется.
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
              <span>Take profit %</span>
              <input
                type="number"
                step={0.01}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                value={settings.dca.takeProfitPct}
                onChange={(e) => patchDca({ takeProfitPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Stop loss % (optional)</span>
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
        </div>
      </section>

      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Исполнение
        </h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex flex-col gap-1">
            <span>Вход</span>
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
          <label className="flex flex-col gap-1">
            <span>
              Порядок при конфликте DCA/TP на одной свече
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
    </div>
  );
}
