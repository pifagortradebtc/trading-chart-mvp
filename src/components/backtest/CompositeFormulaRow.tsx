"use client";

/**
 * Компактная горизонтальная формула композита: [Стратегия 1 ▾] [И/ИЛИ ▾] [Стратегия 2 ▾] [+].
 * Живёт в шапке секции «Модель бэктеста» — чтобы юзер сразу видел общую структуру.
 * Детальные настройки слотов остаются ниже в CompositeStrategySection.
 *
 * Изменения в этой компактной строке (тип слота / оператор / +/×) синхронизируются
 * с тем же config.slots — обе UI всегда видят одно и то же.
 */

import {
  DEFAULT_BIDASK_SPREAD,
  DEFAULT_BUYFORCE_SETTINGS,
  DEFAULT_SELLFORCE_SETTINGS,
} from "@/lib/backtest/buyForceSellForceSignals";
import { DEFAULT_CHAIK } from "@/lib/backtest/backtestDefaults";
import {
  DEFAULT_ADX_FILTER,
  DEFAULT_BOLLINGER,
  DEFAULT_EMA_CROSS,
  DEFAULT_MACD,
  DEFAULT_RSI_THRESHOLD,
  DEFAULT_STOCHASTIC,
} from "@/lib/backtest/classicIndicatorSignals";
import type {
  BacktestSettings,
  CompositeStrategyConfig,
  CompositeStrategyKind,
  JoinRule,
  StrategySlot,
} from "@/lib/backtest/types";

function shortLabel(kind: CompositeStrategyKind): string {
  if (kind === "buyforce_dca") return "BuyForce";
  if (kind === "sellforce_dca") return "SellForce";
  if (kind === "chaik_dca") return "ЧайкКельт";
  if (kind === "bidask_spread") return "BidAsk Spread";
  if (kind === "macd") return "MACD";
  if (kind === "rsi_threshold") return "RSI";
  if (kind === "ema_cross") return "EMA Cross";
  if (kind === "bollinger") return "Боллинджер";
  if (kind === "stochastic") return "Stochastic";
  return "ADX (фильтр)";
}

function makeSlot(kind: CompositeStrategyKind, idx: number): StrategySlot {
  return {
    id: `slot-${Date.now()}-${idx}`,
    kind,
    joinRule: "and",
    chaikKelt: kind === "chaik_dca" ? { ...DEFAULT_CHAIK } : undefined,
    buyForce: kind === "buyforce_dca" ? { ...DEFAULT_BUYFORCE_SETTINGS } : undefined,
    sellForce: kind === "sellforce_dca" ? { ...DEFAULT_SELLFORCE_SETTINGS } : undefined,
    bidAskSpread: kind === "bidask_spread" ? { ...DEFAULT_BIDASK_SPREAD } : undefined,
    macd: kind === "macd" ? { ...DEFAULT_MACD } : undefined,
    rsiThreshold: kind === "rsi_threshold" ? { ...DEFAULT_RSI_THRESHOLD } : undefined,
    emaCross: kind === "ema_cross" ? { ...DEFAULT_EMA_CROSS } : undefined,
    bollinger: kind === "bollinger" ? { ...DEFAULT_BOLLINGER } : undefined,
    stochastic: kind === "stochastic" ? { ...DEFAULT_STOCHASTIC } : undefined,
    adxFilter: kind === "adx_filter" ? { ...DEFAULT_ADX_FILTER } : undefined,
  };
}

export function CompositeFormulaRow({
  settings,
  onChange,
}: {
  settings: BacktestSettings;
  onChange: (s: BacktestSettings) => void;
}) {
  const config = settings.composite;

  const patchComposite = (partial: Partial<CompositeStrategyConfig>) => {
    onChange({ ...settings, composite: { ...config, ...partial } });
  };

  const patchSlot = (id: string, partial: Partial<StrategySlot>) => {
    patchComposite({
      slots: config.slots.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    });
  };

  const changeSlotKind = (id: string, kind: CompositeStrategyKind) => {
    patchComposite({
      slots: config.slots.map((s) => {
        if (s.id !== id) return s;
        return {
          id: s.id,
          kind,
          joinRule: s.joinRule ?? "and",
          chaikKelt: kind === "chaik_dca" ? s.chaikKelt ?? { ...DEFAULT_CHAIK } : undefined,
          buyForce:
            kind === "buyforce_dca" ? s.buyForce ?? { ...DEFAULT_BUYFORCE_SETTINGS } : undefined,
          sellForce:
            kind === "sellforce_dca"
              ? s.sellForce ?? { ...DEFAULT_SELLFORCE_SETTINGS }
              : undefined,
          bidAskSpread:
            kind === "bidask_spread"
              ? s.bidAskSpread ?? { ...DEFAULT_BIDASK_SPREAD }
              : undefined,
          macd: kind === "macd" ? s.macd ?? { ...DEFAULT_MACD } : undefined,
          rsiThreshold:
            kind === "rsi_threshold" ? s.rsiThreshold ?? { ...DEFAULT_RSI_THRESHOLD } : undefined,
          emaCross: kind === "ema_cross" ? s.emaCross ?? { ...DEFAULT_EMA_CROSS } : undefined,
          bollinger: kind === "bollinger" ? s.bollinger ?? { ...DEFAULT_BOLLINGER } : undefined,
          stochastic:
            kind === "stochastic" ? s.stochastic ?? { ...DEFAULT_STOCHASTIC } : undefined,
          adxFilter:
            kind === "adx_filter" ? s.adxFilter ?? { ...DEFAULT_ADX_FILTER } : undefined,
        };
      }),
    });
  };

  const removeSlot = (id: string) => {
    if (config.slots.length <= 1) return;
    patchComposite({ slots: config.slots.filter((s) => s.id !== id) });
  };

  const addSlot = () => {
    patchComposite({
      slots: [...config.slots, makeSlot("buyforce_dca", config.slots.length)],
    });
  };

  return (
    <div className="basis-full">
      <span className="block text-xs uppercase tracking-wide text-[#787b86]">
        Формула композита
      </span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {config.slots.map((slot, idx) => (
          <div key={slot.id} className="flex items-center gap-1.5">
            {idx > 0 ? (
              <select
                className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-100 outline-none focus:border-cyan-500/70"
                value={slot.joinRule ?? "and"}
                onChange={(e) =>
                  patchSlot(slot.id, { joinRule: e.target.value as JoinRule })
                }
                title="Оператор объединения с предыдущим"
              >
                <option value="and">И</option>
                <option value="or">ИЛИ</option>
              </select>
            ) : null}
            <div className="group relative flex items-center rounded-lg border border-[#2e3241] bg-[#0c0e14]">
              <span className="rounded-l-lg border-r border-[#2e3241] bg-cyan-500/10 px-2 py-1.5 text-[10px] font-semibold text-cyan-200">
                #{idx + 1}
              </span>
              <select
                className="bg-transparent px-2 py-1.5 pr-7 text-sm text-[#d1d4dc] outline-none"
                value={slot.kind}
                onChange={(e) =>
                  changeSlotKind(slot.id, e.target.value as CompositeStrategyKind)
                }
              >
                <optgroup label="Сигналы Pifagor">
                  <option value="buyforce_dca">{shortLabel("buyforce_dca")}</option>
                  <option value="sellforce_dca">{shortLabel("sellforce_dca")}</option>
                  <option value="bidask_spread">{shortLabel("bidask_spread")}</option>
                  <option value="chaik_dca">{shortLabel("chaik_dca")}</option>
                </optgroup>
                <optgroup label="Классические">
                  <option value="macd">{shortLabel("macd")}</option>
                  <option value="rsi_threshold">{shortLabel("rsi_threshold")}</option>
                  <option value="ema_cross">{shortLabel("ema_cross")}</option>
                  <option value="bollinger">{shortLabel("bollinger")}</option>
                  <option value="stochastic">{shortLabel("stochastic")}</option>
                </optgroup>
                <optgroup label="Фильтры">
                  <option value="adx_filter">{shortLabel("adx_filter")}</option>
                </optgroup>
              </select>
              {config.slots.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  title="Удалить слот"
                  className="rounded-r-lg border-l border-[#2e3241] bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addSlot}
          className="rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15"
          title="Добавить новый слот (по умолчанию BuyForce, можно сменить тип сразу)"
        >
          + слот
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#6b7280]">
        Тип стратегии и оператор меняй здесь компактно. Детальные настройки каждого
        слота — в блоке «Композит» ниже.
      </p>
    </div>
  );
}
