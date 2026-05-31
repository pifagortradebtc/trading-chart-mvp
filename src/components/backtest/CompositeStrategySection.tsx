"use client";

/**
 * UI для composite-режима: стек слотов + правило объединения + окно подтверждения.
 *
 * Каждый слот: dropdown (BuyForce/SellForce/ЧайкКельт) + inline-параметры (для BF/SF —
 * zeroLevel/cooldown; для ЧайкКельт — намёк что используются глобальные настройки
 * settings.indicator, чтобы не разворачивать 20-полевую панель в каждом слоте).
 *
 * Правило: AND (все), ANY (любая), MAJORITY (N из M). Окно: на каждом баре считаем
 * слот «активным» если его сигнал был в [i-N+1..i].
 */

import { useState } from "react";
import {
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
  StrategySlot,
} from "@/lib/backtest/types";
import { ChaikKeltSettingsForm } from "./ChaikKeltSettingsForm";

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 cursor-help text-sky-400/90" title={String(children)}>
      ⓘ
    </span>
  );
}

function slotLabel(kind: CompositeStrategyKind): string {
  if (kind === "buyforce_dca") return "BuyForce (LONG)";
  if (kind === "sellforce_dca") return "SellForce (SHORT)";
  if (kind === "chaik_dca") return "V2_ЧайкКельт";
  if (kind === "macd") return "MACD";
  if (kind === "rsi_threshold") return "RSI (перепроданность/перекупленность)";
  if (kind === "ema_cross") return "EMA Cross (золотой/мёртвый крест)";
  if (kind === "bollinger") return "Полосы Боллинджера";
  if (kind === "stochastic") return "Stochastic %K";
  return "ADX (фильтр силы тренда)";
}

/**
 * Цветовая палитра для слотов — циклическая по индексу. Применяется к
 * левой накладке (border + bg badge), чтобы юзер визуально разделял слоты
 * при просмотре стека.
 */
const SLOT_COLOR_PALETTE = [
  {
    border: "border-cyan-500/40",
    accent: "bg-cyan-500/15 text-cyan-200 border-cyan-500/40",
    leftBar: "bg-cyan-500/60",
  },
  {
    border: "border-violet-500/40",
    accent: "bg-violet-500/15 text-violet-200 border-violet-500/40",
    leftBar: "bg-violet-500/60",
  },
  {
    border: "border-emerald-500/40",
    accent: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
    leftBar: "bg-emerald-500/60",
  },
  {
    border: "border-amber-500/40",
    accent: "bg-amber-500/15 text-amber-200 border-amber-500/40",
    leftBar: "bg-amber-500/60",
  },
  {
    border: "border-rose-500/40",
    accent: "bg-rose-500/15 text-rose-200 border-rose-500/40",
    leftBar: "bg-rose-500/60",
  },
  {
    border: "border-sky-500/40",
    accent: "bg-sky-500/15 text-sky-200 border-sky-500/40",
    leftBar: "bg-sky-500/60",
  },
  {
    border: "border-pink-500/40",
    accent: "bg-pink-500/15 text-pink-200 border-pink-500/40",
    leftBar: "bg-pink-500/60",
  },
  {
    border: "border-lime-500/40",
    accent: "bg-lime-500/15 text-lime-200 border-lime-500/40",
    leftBar: "bg-lime-500/60",
  },
];

function slotColors(idx: number): (typeof SLOT_COLOR_PALETTE)[number] {
  return SLOT_COLOR_PALETTE[idx % SLOT_COLOR_PALETTE.length]!;
}

function makeSlot(kind: CompositeStrategyKind, idx: number): StrategySlot {
  return {
    id: `slot-${Date.now()}-${idx}`,
    kind,
    joinRule: "and",
    chaikKelt: kind === "chaik_dca" ? { ...DEFAULT_CHAIK } : undefined,
    buyForce: kind === "buyforce_dca" ? { ...DEFAULT_BUYFORCE_SETTINGS } : undefined,
    sellForce: kind === "sellforce_dca" ? { ...DEFAULT_SELLFORCE_SETTINGS } : undefined,
    macd: kind === "macd" ? { ...DEFAULT_MACD } : undefined,
    rsiThreshold: kind === "rsi_threshold" ? { ...DEFAULT_RSI_THRESHOLD } : undefined,
    emaCross: kind === "ema_cross" ? { ...DEFAULT_EMA_CROSS } : undefined,
    bollinger: kind === "bollinger" ? { ...DEFAULT_BOLLINGER } : undefined,
    stochastic: kind === "stochastic" ? { ...DEFAULT_STOCHASTIC } : undefined,
    adxFilter: kind === "adx_filter" ? { ...DEFAULT_ADX_FILTER } : undefined,
  };
}

export function CompositeStrategySection({
  settings,
  onChange,
}: {
  settings: BacktestSettings;
  onChange: (s: BacktestSettings) => void;
}) {
  const config = settings.composite;

  /** Какие слоты раскрыты с настройками; по умолчанию все закрыты (visual clean). */
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(() => new Set());
  const isExpanded = (id: string) => expandedSlots.has(id);
  const toggleExpand = (id: string) => {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          chaikKelt: kind === "chaik_dca" ? s.chaikKelt ?? { ...DEFAULT_CHAIK } : undefined,
          buyForce:
            kind === "buyforce_dca" ? s.buyForce ?? { ...DEFAULT_BUYFORCE_SETTINGS } : undefined,
          sellForce:
            kind === "sellforce_dca"
              ? s.sellForce ?? { ...DEFAULT_SELLFORCE_SETTINGS }
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

  const addSlot = (kind: CompositeStrategyKind) => {
    patchComposite({
      slots: [...config.slots, makeSlot(kind, config.slots.length)],
    });
  };

  const moveSlot = (id: string, dir: -1 | 1) => {
    const idx = config.slots.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= config.slots.length) return;
    const arr = [...config.slots];
    const a = arr[idx]!;
    const b = arr[newIdx]!;
    arr[idx] = b;
    arr[newIdx] = a;
    patchComposite({ slots: arr });
  };

  const needsLongInfo = config.slots.some((s) => s.kind === "buyforce_dca" || s.kind === "chaik_dca");
  const needsShortInfo = config.slots.some(
    (s) => s.kind === "sellforce_dca" || s.kind === "chaik_dca",
  );
  const needsDepth = config.slots.some(
    (s) => s.kind === "buyforce_dca" || s.kind === "sellforce_dca",
  );

  return (
    <section className="rounded-xl border border-[#2e3241] bg-[#131722] p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#787b86]">
          Композит: стек сигнал-стратегий
        </h3>
        <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
          {config.slots.length} слот{config.slots.length === 1 ? "" : config.slots.length < 5 ? "а" : "ов"}
        </span>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-[#787b86]">
        Между слотами выбирай оператор <strong className="text-cyan-300">И</strong> /
        {" "}<strong className="text-cyan-300">ИЛИ</strong> — получится формула
        «S1 И S2 ИЛИ S3», которая вычисляется слева направо. Бот открывает сделку,
        когда формула возвращает true. У каждого слота своя стратегия и свои параметры.
        В композит идут только сигнал-генераторы (BuyForce, SellForce, ЧайкКельт и
        классические индикаторы). ALTS и Pivot21 имеют собственное управление позицией —
        они выбираются отдельно как одиночные стратегии.
      </p>

      <div className="space-y-3">
        {config.slots.map((slot, idx) => {
          const colors = slotColors(idx);
          const opened = isExpanded(slot.id);
          return (
          <div key={slot.id}>
            {idx > 0 ? (
              <div className="mb-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-wide text-[#6b7280]">
                <div className="h-px flex-1 bg-[#2e3241]/60" />
                <span>
                  объединяется через{" "}
                  <strong className="text-cyan-300">
                    {(slot.joinRule ?? "and") === "and" ? "И" : "ИЛИ"}
                  </strong>
                </span>
                <div className="h-px flex-1 bg-[#2e3241]/60" />
              </div>
            ) : null}
            <div
              className={`relative overflow-hidden rounded-lg border bg-[#0c0e14] p-3 ${colors.border}`}
            >
            {/* Левая цветная полоса для визуального разделения */}
            <div className={`absolute inset-y-0 left-0 w-1 ${colors.leftBar}`} />
            <div className="ml-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${colors.accent}`}>
                #{idx + 1}
              </span>
              <select
                className="flex-1 rounded-md border border-[#2e3241] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc]"
                value={slot.kind}
                onChange={(e) =>
                  changeSlotKind(slot.id, e.target.value as CompositeStrategyKind)
                }
              >
                <optgroup label="Сигналы Pifagor">
                  <option value="buyforce_dca">{slotLabel("buyforce_dca")}</option>
                  <option value="sellforce_dca">{slotLabel("sellforce_dca")}</option>
                  <option value="chaik_dca">{slotLabel("chaik_dca")}</option>
                </optgroup>
                <optgroup label="Классические индикаторы (LONG и SHORT)">
                  <option value="macd">{slotLabel("macd")}</option>
                  <option value="rsi_threshold">{slotLabel("rsi_threshold")}</option>
                  <option value="ema_cross">{slotLabel("ema_cross")}</option>
                  <option value="bollinger">{slotLabel("bollinger")}</option>
                  <option value="stochastic">{slotLabel("stochastic")}</option>
                </optgroup>
                <optgroup label="Фильтры (без направления, усиливают другие)">
                  <option value="adx_filter">{slotLabel("adx_filter")}</option>
                </optgroup>
              </select>
              <button
                type="button"
                onClick={() => toggleExpand(slot.id)}
                title={opened ? "Скрыть настройки слота" : "Показать настройки слота"}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  opened
                    ? `${colors.accent}`
                    : "border-[#2e3241] bg-[#131722] text-[#787b86] hover:bg-[#1a1e2a]"
                }`}
              >
                ⚙ {opened ? "скрыть" : "настройки"}
              </button>
              <button
                type="button"
                onClick={() => moveSlot(slot.id, -1)}
                disabled={idx === 0}
                title="Переместить выше"
                className="rounded-md border border-[#2e3241] bg-[#131722] px-2 py-1 text-xs text-[#787b86] hover:bg-[#1a1e2a] disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSlot(slot.id, 1)}
                disabled={idx === config.slots.length - 1}
                title="Переместить ниже"
                className="rounded-md border border-[#2e3241] bg-[#131722] px-2 py-1 text-xs text-[#787b86] hover:bg-[#1a1e2a] disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                disabled={config.slots.length <= 1}
                title={
                  config.slots.length <= 1
                    ? "Должен оставаться хотя бы один слот"
                    : "Удалить этот слот"
                }
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-30"
              >
                ×
              </button>
            </div>

            {opened ? (
            <div className="ml-1 mt-3 border-t border-[#2e3241]/50 pt-3">
            <div className="space-y-3">

            {slot.kind === "buyforce_dca" && slot.buyForce ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Уровень нуля</span>
                  <input
                    type="number"
                    step="0.01"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.buyForce.zeroLevel}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        buyForce: { ...slot.buyForce!, zeroLevel: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Задержка (баров)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.buyForce.cooldownBars}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        buyForce: {
                          ...slot.buyForce!,
                          cooldownBars: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {slot.kind === "sellforce_dca" && slot.sellForce ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Уровень нуля</span>
                  <input
                    type="number"
                    step="0.01"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.sellForce.zeroLevel}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        sellForce: { ...slot.sellForce!, zeroLevel: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Задержка (баров)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.sellForce.cooldownBars}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        sellForce: {
                          ...slot.sellForce!,
                          cooldownBars: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {slot.kind === "chaik_dca" && slot.chaikKelt ? (
              <ChaikKeltSettingsForm
                value={slot.chaikKelt}
                onChange={(partial) =>
                  patchSlot(slot.id, { chaikKelt: { ...slot.chaikKelt!, ...partial } })
                }
                compact
              />
            ) : null}

            {slot.kind === "macd" && slot.macd ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">
                    Сигнальный режим
                    <Tip>
                      Что считать триггером для LONG/SHORT. «Пересечение signal-линии» —
                      классика (MACD↑/↓ сигнальной EMA). «Пересечение нуля» — медленнее,
                      надёжнее. «Выше/ниже нуля» — постоянный фильтр (LONG пока MACD&gt;0,
                      SHORT пока &lt;0).
                    </Tip>
                  </span>
                  <select
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1.5 font-mono text-[#d1d4dc]"
                    value={slot.macd.signalMode}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        macd: {
                          ...slot.macd!,
                          signalMode: e.target.value as typeof slot.macd.signalMode,
                        },
                      })
                    }
                  >
                    <option value="signal_cross">
                      Пересечение signal-линии (LONG: MACD↑сигнал, SHORT: ↓)
                    </option>
                    <option value="zero_cross">
                      Пересечение нуля (LONG: MACD↑0, SHORT: ↓0)
                    </option>
                    <option value="above_zero_gate">
                      Выше/ниже нуля (фильтр: LONG пока MACD&gt;0)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Быстрая EMA</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.macd.fastLen}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          macd: {
                            ...slot.macd!,
                            fastLen: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Медленная EMA</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.macd.slowLen}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          macd: {
                            ...slot.macd!,
                            slowLen: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Сигнальная EMA</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.macd.signalLen}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          macd: {
                            ...slot.macd!,
                            signalLen: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Задержка (баров)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.macd.cooldownBars}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          macd: {
                            ...slot.macd!,
                            cooldownBars: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {slot.kind === "rsi_threshold" && slot.rsiThreshold ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">
                    Сигнальный режим
                    <Tip>
                      «Выход из зон» — классика (LONG когда RSI выходит вверх из
                      перепроданности). «Вход в зоны» — наоборот: LONG когда RSI входит в
                      перепроданность, ждём отскок. «Средняя 50» — моментум: LONG при
                      пересечении 50 вверх. «Внутри зоны» — постоянный фильтр.
                    </Tip>
                  </span>
                  <select
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1.5 font-mono text-[#d1d4dc]"
                    value={slot.rsiThreshold.signalMode}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        rsiThreshold: {
                          ...slot.rsiThreshold!,
                          signalMode: e.target.value as typeof slot.rsiThreshold.signalMode,
                        },
                      })
                    }
                  >
                    <option value="exit_zones">
                      Выход из зон (LONG: RSI↑перепроданность, SHORT: RSI↓перекупленность)
                    </option>
                    <option value="enter_zones">
                      Вход в зоны (LONG: RSI↓перепроданность, SHORT: RSI↑перекупленность)
                    </option>
                    <option value="midline_cross">
                      Средняя 50 (LONG: RSI↑50, SHORT: RSI↓50)
                    </option>
                    <option value="inside_zone">
                      Внутри зоны (фильтр: LONG пока RSI&lt;перепроданности)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Период RSI</span>
                    <input
                      type="number"
                      min="2"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.rsiThreshold.length}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          rsiThreshold: {
                            ...slot.rsiThreshold!,
                            length: Math.max(2, Number(e.target.value) || 14),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Перепроданность &lt;</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.rsiThreshold.oversoldThreshold}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          rsiThreshold: {
                            ...slot.rsiThreshold!,
                            oversoldThreshold: Number(e.target.value) || 30,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Перекупленность &gt;</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.rsiThreshold.overboughtThreshold}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          rsiThreshold: {
                            ...slot.rsiThreshold!,
                            overboughtThreshold: Number(e.target.value) || 70,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Задержка (баров)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                      value={slot.rsiThreshold.cooldownBars}
                      onChange={(e) =>
                        patchSlot(slot.id, {
                          rsiThreshold: {
                            ...slot.rsiThreshold!,
                            cooldownBars: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {slot.kind === "ema_cross" && slot.emaCross ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">
                    Сигнальный режим
                    <Tip>
                      «Пересечение» — edge: LONG при золотом кресте (быстрая ↑ медленную),
                      SHORT при мёртвом. «Выше/ниже» — постоянный фильтр: LONG пока быстрая
                      EMA &gt; медленной.
                    </Tip>
                  </span>
                  <select
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1.5 font-mono text-[#d1d4dc]"
                    value={slot.emaCross.signalMode}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        emaCross: {
                          ...slot.emaCross!,
                          signalMode: e.target.value as typeof slot.emaCross.signalMode,
                        },
                      })
                    }
                  >
                    <option value="cross_event">
                      Пересечение (золотой/мёртвый крест)
                    </option>
                    <option value="above_below">
                      Выше/ниже (фильтр: LONG пока быстрая&gt;медленной)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Быстрая EMA</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.emaCross.fastLen}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        emaCross: {
                          ...slot.emaCross!,
                          fastLen: Math.max(1, Number(e.target.value) || 50),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Медленная EMA</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.emaCross.slowLen}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        emaCross: {
                          ...slot.emaCross!,
                          slowLen: Math.max(1, Number(e.target.value) || 200),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Задержка (баров)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.emaCross.cooldownBars}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        emaCross: {
                          ...slot.emaCross!,
                          cooldownBars: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                </label>
                </div>
              </div>
            ) : null}

            {slot.kind === "bollinger" && slot.bollinger ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">
                    Сигнальный режим
                    <Tip>
                      «Касание полос» — контртренд: LONG при пробое нижней полосы (жди
                      отскок), SHORT при пробое верхней. «Пробой» — наоборот, моментум:
                      LONG при пробое верхней (импульс вверх), SHORT при пробое нижней.
                    </Tip>
                  </span>
                  <select
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1.5 font-mono text-[#d1d4dc]"
                    value={slot.bollinger.signalMode}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        bollinger: {
                          ...slot.bollinger!,
                          signalMode: e.target.value as typeof slot.bollinger.signalMode,
                        },
                      })
                    }
                  >
                    <option value="touch_band">
                      Касание полос (контртренд: LONG нижняя, SHORT верхняя)
                    </option>
                    <option value="breakout">
                      Пробой (моментум: LONG верхняя, SHORT нижняя)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Период SMA</span>
                  <input
                    type="number"
                    min="2"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.bollinger.length}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        bollinger: {
                          ...slot.bollinger!,
                          length: Math.max(2, Number(e.target.value) || 20),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Множитель σ</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.bollinger.stdDevMult}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        bollinger: {
                          ...slot.bollinger!,
                          stdDevMult: Number(e.target.value) || 2,
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Задержка (баров)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.bollinger.cooldownBars}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        bollinger: {
                          ...slot.bollinger!,
                          cooldownBars: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                </label>
                </div>
              </div>
            ) : null}

            {slot.kind === "stochastic" && slot.stochastic ? (
              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">
                    Сигнальный режим
                    <Tip>
                      «Выход из зон» — классика (LONG: %K выходит вверх из перепроданности).
                      «Вход в зоны» — наоборот: вход в зону, ждём разворот.
                    </Tip>
                  </span>
                  <select
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1.5 font-mono text-[#d1d4dc]"
                    value={slot.stochastic.signalMode}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        stochastic: {
                          ...slot.stochastic!,
                          signalMode: e.target.value as typeof slot.stochastic.signalMode,
                        },
                      })
                    }
                  >
                    <option value="exit_zones">
                      Выход из зон (LONG: %K↑перепроданность, SHORT: %K↓перекупленность)
                    </option>
                    <option value="enter_zones">
                      Вход в зоны (LONG: %K↓перепроданность, SHORT: %K↑перекупленность)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Период %K</span>
                  <input
                    type="number"
                    min="2"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.stochastic.kLength}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        stochastic: {
                          ...slot.stochastic!,
                          kLength: Math.max(2, Number(e.target.value) || 14),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Сглаживание %K</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.stochastic.kSmooth}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        stochastic: {
                          ...slot.stochastic!,
                          kSmooth: Math.max(1, Number(e.target.value) || 3),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Перепроданность &lt;</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.stochastic.oversoldThreshold}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        stochastic: {
                          ...slot.stochastic!,
                          oversoldThreshold: Number(e.target.value) || 20,
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Перекупленность &gt;</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.stochastic.overboughtThreshold}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        stochastic: {
                          ...slot.stochastic!,
                          overboughtThreshold: Number(e.target.value) || 80,
                        },
                      })
                    }
                  />
                </label>
                </div>
              </div>
            ) : null}

            {slot.kind === "adx_filter" && slot.adxFilter ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Период ADX</span>
                  <input
                    type="number"
                    min="2"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.adxFilter.length}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        adxFilter: {
                          ...slot.adxFilter!,
                          length: Math.max(2, Number(e.target.value) || 14),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Порог силы тренда (ADX &gt;)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="rounded border border-[#2e3241] bg-[#131722] px-2 py-1 font-mono text-[#d1d4dc]"
                    value={slot.adxFilter.threshold}
                    onChange={(e) =>
                      patchSlot(slot.id, {
                        adxFilter: {
                          ...slot.adxFilter!,
                          threshold: Number(e.target.value) || 25,
                        },
                      })
                    }
                  />
                </label>
                <p className="col-span-2 text-[10px] text-[#6b7280]">
                  ADX — фильтр силы тренда. Сигнал постоянный: активен, когда ADX выше
                  порога на этом баре. Объединяя в композите оператором И, пропускает
                  направленные сигналы других слотов только в трендовом рынке (отсекает
                  боковик).
                </p>
              </div>
            ) : null}
            </div>
            </div>
            ) : null}
            </div>
          </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#787b86]">+ Pifagor:</span>
          <button
            type="button"
            onClick={() => addSlot("buyforce_dca")}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            BuyForce
          </button>
          <button
            type="button"
            onClick={() => addSlot("sellforce_dca")}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
          >
            SellForce
          </button>
          <button
            type="button"
            onClick={() => addSlot("chaik_dca")}
            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            ЧайкКельт
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#787b86]">+ Классические:</span>
          <button
            type="button"
            onClick={() => addSlot("macd")}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            MACD
          </button>
          <button
            type="button"
            onClick={() => addSlot("rsi_threshold")}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            RSI
          </button>
          <button
            type="button"
            onClick={() => addSlot("ema_cross")}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            EMA Cross
          </button>
          <button
            type="button"
            onClick={() => addSlot("bollinger")}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            Bollinger
          </button>
          <button
            type="button"
            onClick={() => addSlot("stochastic")}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20"
          >
            Stochastic
          </button>
          <button
            type="button"
            onClick={() => addSlot("adx_filter")}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
          >
            ADX (фильтр)
          </button>
        </div>
      </div>

      <div className="mt-5">
        <label className="flex max-w-md flex-col gap-1">
          <span className="text-xs text-[#787b86]">
            Окно подтверждения (баров)
            <Tip>
              На каждом баре слот считается «активным», если его сигнал сработал в
              последние N баров. 1 — строго один и тот же бар (почти никогда не сработает
              с оператором И). 5–10 — мягкое подтверждение. 20+ — очень мягкое.
            </Tip>
          </span>
          <input
            type="number"
            min="1"
            max="200"
            className="w-32 rounded border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono text-sm text-[#d1d4dc]"
            value={config.confirmWindowBars}
            onChange={(e) =>
              patchComposite({
                confirmWindowBars: Math.max(
                  1,
                  Math.min(200, Math.floor(Number(e.target.value) || 1)),
                ),
              })
            }
          />
        </label>
      </div>

      <div className="mt-4 grid gap-2 rounded-md border border-[#2e3241] bg-[#0c0e14] p-3 text-[11px]">
        <span className="text-[#787b86]">Итоговая формула композита (вычисляется слева направо):</span>
        <div className="font-mono text-[12px] text-cyan-100">
          {config.slots.map((slot, idx) => (
            <span key={slot.id}>
              {idx > 0 ? (
                <span className="mx-2 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                  {(slot.joinRule ?? "and") === "and" ? "И" : "ИЛИ"}
                </span>
              ) : null}
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5">
                #{idx + 1} {slotLabel(slot.kind)}
              </span>
            </span>
          ))}
        </div>
        {needsDepth ? (
          <span className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
            ⚠ Нужны depth-данные (BuyForce/SellForce). ТФ графика ∈ &#123;1m, 5m, 15m, 1h&#125;.
          </span>
        ) : null}
        <span className="text-[10px] text-[#6b7280]">
          Бот откроет {needsLongInfo ? "LONG" : ""}
          {needsLongInfo && needsShortInfo ? " / " : ""}
          {needsShortInfo ? "SHORT" : ""} когда формула вернёт true (внутри окна
          подтверждения {config.confirmWindowBars} баров).
        </span>
      </div>
    </section>
  );
}
