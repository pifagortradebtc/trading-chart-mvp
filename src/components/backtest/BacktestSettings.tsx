"use client";

import { DEFAULT_CHAIK, DEFAULT_PIFAGOR_ALTS } from "@/lib/backtest/backtestDefaults";
import type { BacktestSettings } from "@/lib/backtest/types";

function msToDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalToMs(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

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
  const patchPif = (partial: Partial<BacktestSettings["pifagorAlts"]>) =>
    onChange({ ...settings, pifagorAlts: { ...settings.pifagorAlts, ...partial } });

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
                  onChange({
                    ...settings,
                    strategyKind,
                    dca: {
                      ...settings.dca,
                      allowLong: true,
                      allowShort: false,
                      mode: "long",
                      takeProfitPct:
                        settings.dca.takeProfitPct < 50 ? 100 : settings.dca.takeProfitPct,
                    },
                  });
                } else {
                  onChange({ ...settings, strategyKind });
                }
              }}
            >
              <option value="chaik_dca">V2_ЧайкКельт + DCA-сетка</option>
              <option value="pifagor_alts">Pifagor ALTS 3.7 (лонг, без сетки)</option>
            </select>
          </label>
          {settings.strategyKind === "pifagor_alts" ? (
            <p className="max-w-2xl text-xs leading-relaxed text-[#787b86]">
              Вход: close &lt; ALTS-линия, окно по времени, whale-pump &gt; 2, daily mult &lt; 0.7. Каждый бар, где
              условие истинно на close, — ещё один вход на фиксированную сумму USDT на open следующей свечи (на 1D это
              даёт плотные столбы «buy», как в TradingView). Доливы ограничены маржей и полем «Макс. входов в позиции»
              (аналог Pine pyramiding, по умолчанию 200). TP % — от текущей средней. Опционально — выход по правилам
              Pine (mult / diff).
            </p>
          ) : null}
        </div>
      </section>

      {settings.strategyKind === "pifagor_alts" ? (
        <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
              Pifagor ALTS
            </h3>
            <button
              type="button"
              className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/20"
              onClick={() => patchPif({ ...DEFAULT_PIFAGOR_ALTS })}
            >
              Дефолты как в Pine
            </button>
          </div>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Степень риска (ветка ALTS)</span>
              <select
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
                value={settings.pifagorAlts.lineRisk}
                onChange={(e) =>
                  patchPif({
                    lineRisk: e.target.value as "less" | "more",
                  })
                }
              >
                <option value="less">меньше (VWMA×0.5 для альтов)</option>
                <option value="more">больше (дневной перцентиль для альтов)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 md:pt-8">
              <input
                type="checkbox"
                className="rounded border-[#2e3241]"
                checked={settings.pifagorAlts.usePineExitRules}
                onChange={(e) => patchPif({ usePineExitRules: e.target.checked })}
              />
              <span className="text-[#787b86]">Выход по правилам Pine (daily mult / diff)</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">
                Макс. входов в позиции (pyramiding)
                <Tip>
                  Как в Pine `pyramiding`: пока сигнал входа true на каждой свече, на 1D это десятки подряд — без
                  лимита кластер «buy» неограничен. По умолчанию 200.
                </Tip>
              </span>
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-2 font-mono"
                value={settings.pifagorAlts.maxPyramidingEntries}
                onChange={(e) =>
                  patchPif({
                    maxPyramidingEntries: Math.max(
                      1,
                      Math.min(500, Math.floor(Number(e.target.value) || 200)),
                    ),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Начало окна DCA (локальное время браузера)</span>
              <input
                type="datetime-local"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-2 font-mono"
                value={msToDatetimeLocalValue(settings.pifagorAlts.dcaStartMs)}
                onChange={(e) => patchPif({ dcaStartMs: parseDatetimeLocalToMs(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#787b86]">Конец окна DCA</span>
              <input
                type="datetime-local"
                className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-2 font-mono"
                value={msToDatetimeLocalValue(settings.pifagorAlts.dcaEndMs)}
                onChange={(e) => patchPif({ dcaEndMs: parseDatetimeLocalToMs(e.target.value) })}
              />
            </label>
          </div>
        </section>
      ) : null}

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

      <section
        className={`rounded-xl border border-[#2e3241] bg-[#131722] p-5 ${
          settings.strategyKind === "pifagor_alts" ? "lg:col-span-2" : ""
        }`}
      >
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          {settings.strategyKind === "pifagor_alts" ? "Капитал и размер входа" : "DCA-бот"}
        </h3>
        <div className="grid gap-3 text-sm">
          {settings.strategyKind === "chaik_dca" ? (
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
                Каждый сигнал индикатора — покупка на одну и ту же сумму USDT. Доливы повторяются на каждом баре с
                условием входа, пока хватает маржи и не достигнут лимит «Макс. входов в позиции» (как pyramiding в
                Pine).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span>
                    Торговый депозит USDT
                    <Tip>Начальный капитал стратегии в бэктесте (equity).</Tip>
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
                    Размер одного входа USDT
                    <Tip>Одинаковая сумма на каждый сигнал покупки.</Tip>
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                    value={settings.pifagorAlts.entryNotionalUsdt}
                    onChange={(e) =>
                      patchPif({
                        entryNotionalUsdt: Math.max(1, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span>
                    Тип маржи
                    <Tip>
                      Кросс — лимит маржи по полному балансу кошелька; изолированная — по equity стратегии.
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
                    <Tip>При кросс-марже — верхняя граница для проверки доливов.</Tip>
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
              <label className="flex flex-col gap-1 max-w-xs">
                <span>Плечо</span>
                <input
                  type="number"
                  className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
                  value={settings.dca.leverage}
                  onChange={(e) => patchDca({ leverage: Number(e.target.value) })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span>
                    Take profit %
                    <Tip>От текущей средней после всех доливов.</Tip>
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
                    Включено: выход по TP, если close достиг цели. Выключено: достаточно касания high intrabar.
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
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Исполнение
        </h3>
        {settings.strategyKind === "chaik_dca" ? (
        <div className="flex flex-wrap gap-6 text-sm">
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
        ) : (
          <p className="text-sm text-[#787b86]">
            Вход Pifagor: сигнал на close бара → покупка по <strong className="text-[#d1d4dc]">open</strong> следующей
            свечи. Порядок TP / сигнал выхода Pine — как в движке (сначала SL при заданном стопе, затем TP, затем
            сигнал).
          </p>
        )}
      </section>
    </div>
  );
}
