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
  CompositeRule,
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
  if (kind === "rsi_threshold") return "RSI (oversold/overbought)";
  if (kind === "ema_cross") return "EMA Cross (golden/death)";
  if (kind === "bollinger") return "Bollinger Bands";
  if (kind === "stochastic") return "Stochastic %K";
  return "ADX trend filter";
}

function makeSlot(kind: CompositeStrategyKind, idx: number): StrategySlot {
  return {
    id: `slot-${Date.now()}-${idx}`,
    kind,
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
        Бот стреляет, когда сигналы от слотов совпадают по правилу ниже (AND/OR/большинство).
        Для каждого слота — своя стратегия и свои параметры. В композит идут только
        сигнал-генераторы (BuyForce, SellForce, ЧайкКельт). ALTS и Pivot21 имеют собственный
        position-management — они выбираются отдельно как одиночные стратегии.
      </p>

      <div className="space-y-3">
        {config.slots.map((slot, idx) => (
          <div
            key={slot.id}
            className="rounded-lg border border-[#2e3241] bg-[#0c0e14] p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                #{idx + 1}
              </span>
              <select
                className="flex-1 rounded-md border border-[#2e3241] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc]"
                value={slot.kind}
                onChange={(e) =>
                  changeSlotKind(slot.id, e.target.value as CompositeStrategyKind)
                }
              >
                <optgroup label="Pifagor сигналы">
                  <option value="buyforce_dca">{slotLabel("buyforce_dca")}</option>
                  <option value="sellforce_dca">{slotLabel("sellforce_dca")}</option>
                  <option value="chaik_dca">{slotLabel("chaik_dca")}</option>
                </optgroup>
                <optgroup label="Классические индикаторы (LONG+SHORT)">
                  <option value="macd">{slotLabel("macd")}</option>
                  <option value="rsi_threshold">{slotLabel("rsi_threshold")}</option>
                  <option value="ema_cross">{slotLabel("ema_cross")}</option>
                  <option value="bollinger">{slotLabel("bollinger")}</option>
                  <option value="stochastic">{slotLabel("stochastic")}</option>
                </optgroup>
                <optgroup label="Фильтры (не дают direction, только усиливают)">
                  <option value="adx_filter">{slotLabel("adx_filter")}</option>
                </optgroup>
              </select>
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
                  <span className="text-[#787b86]">Cooldown (баров)</span>
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
                  <span className="text-[#787b86]">Cooldown (баров)</span>
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
                      Что считать триггером для LONG/SHORT. «Signal cross» — классика
                      (MACD↑/↓ signal-line). «Zero cross» — медленнее, надёжнее. «Above
                      zero gate» — постоянный фильтр (long пока MACD&gt;0, short пока &lt;0).
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
                      Cross signal line (long: MACD↑signal, short: ↓)
                    </option>
                    <option value="zero_cross">Zero cross (long: MACD↑0, short: ↓0)</option>
                    <option value="above_zero_gate">
                      Above/below zero (фильтр: long пока MACD&gt;0)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">Fast EMA</span>
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
                    <span className="text-[#787b86]">Slow EMA</span>
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
                    <span className="text-[#787b86]">Signal EMA</span>
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
                    <span className="text-[#787b86]">Cooldown</span>
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
                      Exit zones — классика (long: RSI↑ из oversold). Enter zones — наоборот
                      (long когда RSI заходит в oversold, ждём отскок). Midline — long при
                      RSI↑50 (моментум). Inside zone — постоянный фильтр.
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
                      Exit zones (long: RSI↑oversold, short: RSI↓overbought)
                    </option>
                    <option value="enter_zones">
                      Enter zones (long: RSI↓oversold, short: RSI↑overbought)
                    </option>
                    <option value="midline_cross">
                      Midline 50 (long: RSI↑50, short: RSI↓50)
                    </option>
                    <option value="inside_zone">
                      Inside zone (фильтр: long пока RSI&lt;oversold)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[#787b86]">RSI длина</span>
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
                    <span className="text-[#787b86]">Oversold &lt;</span>
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
                    <span className="text-[#787b86]">Overbought &gt;</span>
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
                    <span className="text-[#787b86]">Cooldown</span>
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
                      Cross event — edge: long на golden cross, short на death. Above/below —
                      continuous фильтр: long пока fast EMA &gt; slow EMA.
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
                    <option value="cross_event">Cross event (golden/death)</option>
                    <option value="above_below">
                      Above/below (фильтр: long пока fast&gt;slow)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Fast EMA</span>
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
                  <span className="text-[#787b86]">Slow EMA</span>
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
                  <span className="text-[#787b86]">Cooldown</span>
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
                      Touch band — mean reversion: long при пробое нижней полосы (жди отскок),
                      short при пробое верхней. Breakout — наоборот, моментум: long при пробое
                      верхней (импульс), short при пробое нижней.
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
                      Touch band (mean reversion: long нижняя, short верхняя)
                    </option>
                    <option value="breakout">
                      Breakout (моментум: long верхняя, short нижняя)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">Длина SMA</span>
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
                  <span className="text-[#787b86]">Cooldown</span>
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
                      Exit zones — классика (long: %K↑oversold, short: %K↓overbought).
                      Enter zones — наоборот (вход в зону, ждём разворот).
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
                      Exit zones (long: %K↑oversold, short: %K↓overbought)
                    </option>
                    <option value="enter_zones">
                      Enter zones (long: %K↓oversold, short: %K↑overbought)
                    </option>
                  </select>
                </label>
                <div className="grid grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[#787b86]">%K длина</span>
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
                  <span className="text-[#787b86]">Oversold &lt;</span>
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
                  <span className="text-[#787b86]">Overbought &gt;</span>
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
                  <span className="text-[#787b86]">ADX длина</span>
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
                  <span className="text-[#787b86]">ADX &gt; (трендовая сила)</span>
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
                  ADX — фильтр силы тренда. Сигнал постоянный: «true» если ADX выше порога
                  на этом баре. В AND-композите пропускает direction-сигналы других слотов
                  только в трендовом рынке.
                </p>
              </div>
            ) : null}
          </div>
        ))}
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
            ADX filter
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-xs text-[#787b86]">
            Правило объединения
            <Tip>
              AND: все слоты должны дать сигнал. ANY: любой один. Большинство: минимум N
              из M (по умолчанию N = ceil(M/2)).
            </Tip>
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["and", "any", "majority"] as CompositeRule[]).map((r) => (
              <label
                key={r}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs ${
                  config.rule === r
                    ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-100"
                    : "border-[#2e3241] bg-[#0c0e14] text-[#787b86] hover:bg-[#131722]"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={config.rule === r}
                  onChange={() => patchComposite({ rule: r })}
                />
                {r === "and" ? "AND (все)" : r === "any" ? "ANY (любой)" : "Большинство (N из M)"}
              </label>
            ))}
          </div>
          {config.rule === "majority" ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-[#787b86]">
              <span>N из {config.slots.length}:</span>
              <input
                type="number"
                min="1"
                max={config.slots.length}
                className="w-20 rounded border border-[#2e3241] bg-[#0c0e14] px-2 py-1 font-mono text-[#d1d4dc]"
                value={config.minSignalCount ?? Math.ceil(config.slots.length / 2)}
                onChange={(e) => {
                  const v = Math.max(
                    1,
                    Math.min(config.slots.length, Math.floor(Number(e.target.value) || 1)),
                  );
                  patchComposite({ minSignalCount: v });
                }}
              />
              <span className="text-[10px] text-[#6b7280]">
                по умолчанию: {Math.ceil(config.slots.length / 2)}
              </span>
            </label>
          ) : null}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#787b86]">
            Окно подтверждения (баров)
            <Tip>
              На каждом баре считаем слот «активным» если его сигнал был в последние N
              баров. 1 = строго один и тот же бар (почти никогда не сработает на AND).
              5-10 — мягкое подтверждение. 20+ — очень мягкое.
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
        <span className="text-[#787b86]">Что бот будет торговать:</span>
        <div className="flex flex-wrap items-center gap-2 font-mono">
          {needsLongInfo ? (
            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              LONG: при{" "}
              {config.rule === "and" ? "AND" : config.rule === "any" ? "ANY" : "большинство"} от
              слотов LONG-типа
            </span>
          ) : null}
          {needsShortInfo ? (
            <span className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              SHORT: при{" "}
              {config.rule === "and" ? "AND" : config.rule === "any" ? "ANY" : "большинство"} от
              слотов SHORT-типа
            </span>
          ) : null}
          {needsDepth ? (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              Нужны depth-данные (BuyForce/SellForce). ТФ графика ∈ &#123;1m,5m,15m,1h&#125;.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
