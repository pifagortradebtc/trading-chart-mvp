"use client";

/**
 * Reusable форма параметров V2_ЧайкКельт. Используется в двух местах:
 *   • Singleton-режим strategyKind === "chaik_dca" — bound к settings.indicator
 *   • Composite-слот kind === "chaik_dca" — bound к slot.chaikKelt
 *
 * Пропс `compact` сжимает спейсинг и оборачивает «расширенные параметры» в
 * <details> по умолчанию (для composite — где места меньше).
 */

import { DEFAULT_CHAIK } from "@/lib/backtest/backtestDefaults";
import type { ChaikKeltSettings } from "@/lib/backtest/types";

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 cursor-help text-sky-400/90" title={String(children)}>
      ⓘ
    </span>
  );
}

export function ChaikKeltSettingsForm({
  value,
  onChange,
  compact = false,
}: {
  value: ChaikKeltSettings;
  onChange: (partial: Partial<ChaikKeltSettings>) => void;
  /** В composite-слоте используем compact = true (меньше gap'ов, advanced details закрыты). */
  compact?: boolean;
}) {
  const gap = compact ? "gap-2" : "gap-3";
  return (
    <div className={`grid ${gap} text-sm`}>
      <div className="flex flex-wrap items-center justify-end">
        <button
          type="button"
          className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-500/20"
          title="Все поля блока — значения из Pine по умолчанию"
          onClick={() => onChange({ ...DEFAULT_CHAIK })}
        >
          Как в Pine (дефолты)
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[#787b86]">
          Фильтр направления Pine
          <Tip>auto / только long / только short на уровне индикатора</Tip>
        </span>
        <select
          className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-3 py-2 text-[#d1d4dc]"
          value={value.directionFilter}
          onChange={(e) =>
            onChange({
              directionFilter: e.target.value as ChaikKeltSettings["directionFilter"],
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
            value={value.chaikinFast}
            onChange={(e) => onChange({ chaikinFast: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Chaikin slow</span>
          <input
            type="number"
            className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
            value={value.chaikinSlow}
            onChange={(e) => onChange({ chaikinSlow: Number(e.target.value) })}
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
          value={value.adxThreshold}
          onChange={(e) => onChange({ adxThreshold: Number(e.target.value) })}
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
            value={value.rsiRangeThresholdLong}
            onChange={(e) =>
              onChange({ rsiRangeThresholdLong: Number(e.target.value) })
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
            value={value.rsiTrendThresholdLong}
            onChange={(e) =>
              onChange({ rsiTrendThresholdLong: Number(e.target.value) })
            }
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span>Длина EMA отката</span>
        <input
          type="number"
          className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
          value={value.emaPullbackLen}
          onChange={(e) => onChange({ emaPullbackLen: Number(e.target.value) })}
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span>Keltner EMA</span>
          <input
            type="number"
            className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
            value={value.keltnerEmaLen}
            onChange={(e) => onChange({ keltnerEmaLen: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Keltner ATR</span>
          <input
            type="number"
            className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
            value={value.keltnerAtrLen}
            onChange={(e) => onChange({ keltnerAtrLen: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Keltner mult</span>
          <input
            type="number"
            step={0.1}
            className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
            value={value.keltnerMult}
            onChange={(e) => onChange({ keltnerMult: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span>Cooldown (баров)</span>
        <input
          type="number"
          className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
          value={value.cooldownBars}
          onChange={(e) => onChange({ cooldownBars: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>
          ТФ Чайкина (метка Pine)
          <Tip>
            В Pine осциллятор на `request.security`; в веб-бэктесте ряд совпадает с загруженным
            ТФ графика. Для сравнения с TV задайте тот же интервал на графике или совпадающий
            расчёт.
          </Tip>
        </span>
        <input
          type="text"
          className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
          value={value.chaikinTf}
          onChange={(e) => onChange({ chaikinTf: e.target.value })}
        />
      </label>

      <div className="rounded-lg border border-[#2e3241] bg-[#0c0e14]/60 px-3 py-2">
        <p className="mb-2 text-xs text-[#787b86]">
          Якорь лонга (ОТКАТОМ БЭК V2): при лимите якорь = close − ATR×k, иначе close; ATR по
          длине Keltner ATR.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.useLimitRange}
              onChange={(e) => onChange({ useLimitRange: e.target.checked })}
            />
            <span>Лимит в боковике</span>
          </label>
          <label className="flex flex-col gap-1">
            <span>k ATR (боковик)</span>
            <input
              type="number"
              step={0.01}
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.limitRangeAtr}
              onChange={(e) => onChange({ limitRangeAtr: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.useLimitTrend}
              onChange={(e) => onChange({ useLimitTrend: e.target.checked })}
            />
            <span>Лимит в тренде</span>
          </label>
          <label className="flex flex-col gap-1">
            <span>k ATR (тренд)</span>
            <input
              type="number"
              step={0.01}
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.limitTrendAtr}
              onChange={(e) => onChange({ limitTrendAtr: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="rounded border-[#2e3241]"
          checked={value.crossMode}
          onChange={(e) => onChange({ crossMode: e.target.checked })}
        />
        <span className="text-[#787b86]">
          Только пересечение нуля Чайкина
          <Tip>
            Pine cross_mode: сигнал на баре пересечения, а не пока осциллятор с нужной стороны
            нуля
          </Tip>
        </span>
      </label>

      <details className="rounded-lg border border-[#2e3241] bg-[#0c0e14]/80 px-3 py-2" open={!compact}>
        <summary className="cursor-pointer text-xs font-medium text-[#787b86]">
          Остальные параметры входа (как в Pine)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span>Период ADX</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.adxLength}
              onChange={(e) => onChange({ adxLength: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Окно диапазона (баров)</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rangeBars}
              onChange={(e) => onChange({ rangeBars: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Макс. позиция лонг %</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rangeMaxPctLong}
              onChange={(e) => onChange({ rangeMaxPctLong: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Мин. позиция шорт %</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rangeMinPctShort}
              onChange={(e) => onChange({ rangeMinPctShort: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Допуск отката к EMA %</span>
            <input
              type="number"
              step={0.1}
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.pullbackPct}
              onChange={(e) => onChange({ pullbackPct: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Баров для импульса (lookback)</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.divLookback}
              onChange={(e) => onChange({ divLookback: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Период RSI</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rsiLen}
              onChange={(e) => onChange({ rsiLen: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={value.rsiEnabled}
              onChange={(e) => onChange({ rsiEnabled: e.target.checked })}
            />
            <span>RSI включён</span>
          </label>
          <label className="flex flex-col gap-1">
            <span>RSI шорт боковик &gt;</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rsiRangeThresholdShort}
              onChange={(e) =>
                onChange({ rsiRangeThresholdShort: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>RSI шорт тренд &gt;</span>
            <input
              type="number"
              className="rounded-lg border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono"
              value={value.rsiTrendThresholdShort}
              onChange={(e) =>
                onChange({ rsiTrendThresholdShort: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </details>
    </div>
  );
}
