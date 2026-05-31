import type { BacktestSettings, ChaikKeltSettings, DcaBotSettings } from "./types";
import type { PifagorAltsSettings } from "./pifagorAltsTypes";
import type { Pivot21Settings } from "./pivot21Types";
import {
  DEFAULT_BUYFORCE_SETTINGS,
  DEFAULT_SELLFORCE_SETTINGS,
  type BuyForceSettings,
  type SellForceSettings,
} from "./buyForceSellForceSignals";

/**
 * Стандартные input Pine `V2_ЧайкКельт` (значения по умолчанию в скрипте).
 * Чайкин в Pine считается на отдельном ТФ (`request.security`, по умолчанию `"15"`); в бэктесте
 * осциллятор строится по тому же ряду свечей, что загружен как OHLCV (совпадение с TV — при том же ТФ или если в Pine Чайкин = ТФ графика).
 */
export const DEFAULT_CHAIK: ChaikKeltSettings = {
  directionFilter: "long_only",
  chaikinTf: "15",
  chaikinFast: 3,
  chaikinSlow: 10,
  rangeBars: 150,
  rangeMaxPctLong: 55,
  rangeMinPctShort: 45,
  adxLength: 14,
  adxThreshold: 20,
  emaPullbackLen: 9,
  pullbackPct: 1.0,
  divLookback: 3,
  rsiEnabled: true,
  rsiLen: 14,
  rsiRangeThresholdLong: 72,
  rsiTrendThresholdLong: 75,
  rsiRangeThresholdShort: 28,
  rsiTrendThresholdShort: 25,
  keltnerEmaLen: 20,
  keltnerAtrLen: 10,
  keltnerMult: 2.0,
  cooldownBars: 1,
  crossMode: false,
  useLimitRange: true,
  limitRangeAtr: 0.3,
  useLimitTrend: false,
  limitTrendAtr: 0.15,
};

/** Pine `Pifagor 21 str` — default inputs (idemп. с pine-кодом). */
export const DEFAULT_PIVOT21: Pivot21Settings = {
  pivotTf: "1d",
  keepP: 490,
  projBars: 10,
  minMagnetAge: 10,
  tpPct: 1.0,
  slPct: 1.0,
  baseRiskPct: 10,
  maxRiskPct: 100,
  stepRiskPct: 10,
  allowLong: true,
  allowShort: true,
  initialCapitalUsdt: 10_000,
  feePctPerSide: 0,
};

/** Как в Pine input.time для окна DCA. */
export const DEFAULT_PIFAGOR_ALTS: PifagorAltsSettings = {
  lineRisk: "less",
  entryNotionalUsdt: 5000,
  dcaStartMs: Date.UTC(2017, 11, 31, 0, 0, 0, 0),
  dcaEndMs: Date.UTC(2035, 0, 1, 0, 0, 0, 0),
  usePineExitRules: true,
  closewhen100: false,
  maxPyramidingEntries: 200,
};

export const DEFAULT_DCA: DcaBotSettings = {
  startDepositUsdt: 10_000,
  /**
   * Полный баланс счёта = депозит + доп. свободный баланс под другие стратегии.
   * По умолчанию = startDepositUsdt (доп. баланс 0) — UI «Доп. свободный баланс» нулевой.
   */
  walletBalanceUsdt: 10_000,
  marginMode: "cross",
  /** 7% от торгового депозита — первый ордер сетки. */
  firstOrderDepositPct: 7,
  leverage: 4,
  ordersCount: 7,
  priceOverlapPct: 25,
  priceFactor: 1.6,
  volumeFactor: 1.2,
  /** % от текущей средней позиции (после каждого DCA), не от первого входа. */
  takeProfitPct: 0.6,
  stopLossPct: null,
  feePctPerSide: 0.055,
  fundingPctPer8h: 0,
  allowLong: true,
  allowShort: false,
  mode: "long",
  takeProfitOnClose: true,
};

/** DCA-поля бэктеста, совпадающие с `strategy(...)` Pine Pifagor ALTS 3.7. */
export const DEFAULT_PIFAGOR_DCA: DcaBotSettings = {
  ...DEFAULT_DCA,
  startDepositUsdt: 1_000_000,
  walletBalanceUsdt: 1_000_000,
  leverage: 1,
  feePctPerSide: 0,
  fundingPctPer8h: 0,
  takeProfitPct: 100,
  stopLossPct: null,
  takeProfitOnClose: true,
  marginMode: "isolated",
  allowLong: true,
  allowShort: false,
  mode: "long",
};

/** Единственные настраиваемые поля в UI — остальное как в Pine TV. */
export function applyPifagorTvDefaults(
  settings: BacktestSettings,
  overrides?: { startDepositUsdt?: number; entryNotionalUsdt?: number },
): BacktestSettings {
  const deposit =
    overrides?.startDepositUsdt ??
    settings.dca.startDepositUsdt ??
    DEFAULT_PIFAGOR_DCA.startDepositUsdt;
  const entry =
    overrides?.entryNotionalUsdt ??
    settings.pifagorAlts.entryNotionalUsdt ??
    DEFAULT_PIFAGOR_ALTS.entryNotionalUsdt;

  return {
    ...settings,
    strategyKind: "pifagor_alts",
    pifagorAlts: {
      ...DEFAULT_PIFAGOR_ALTS,
      ...settings.pifagorAlts,
      entryNotionalUsdt: Math.max(1, entry),
    },
    dca: {
      ...settings.dca,
      ...DEFAULT_PIFAGOR_DCA,
      startDepositUsdt: Math.max(1, deposit),
      walletBalanceUsdt: Math.max(1, deposit),
    },
  };
}

/** Совместимость со старыми JSON/снимками с полем `firstOrderUsdt`. */
export function migrateDcaSettings(
  raw: Partial<DcaBotSettings> & { firstOrderUsdt?: number },
): DcaBotSettings {
  const merged: DcaBotSettings = { ...DEFAULT_DCA, ...raw };
  const dep = merged.startDepositUsdt;
  const legacyUsdt = (raw as { firstOrderUsdt?: number }).firstOrderUsdt;

  const pctProvided =
    typeof raw.firstOrderDepositPct === "number" && Number.isFinite(raw.firstOrderDepositPct);

  if (!pctProvided && typeof legacyUsdt === "number" && legacyUsdt > 0 && dep > 0) {
    merged.firstOrderDepositPct = (legacyUsdt / dep) * 100;
  }
  if (!Number.isFinite(merged.firstOrderDepositPct) || merged.firstOrderDepositPct <= 0) {
    merged.firstOrderDepositPct = DEFAULT_DCA.firstOrderDepositPct;
  }
  if (merged.marginMode !== "isolated" && merged.marginMode !== "cross") {
    merged.marginMode = DEFAULT_DCA.marginMode;
  }
  if (!Number.isFinite(merged.walletBalanceUsdt) || merged.walletBalanceUsdt <= 0) {
    merged.walletBalanceUsdt = merged.startDepositUsdt;
  }
  if (typeof merged.takeProfitOnClose !== "boolean") {
    merged.takeProfitOnClose = true;
  }
  return merged;
}

export const DEFAULT_BACKTEST: BacktestSettings = {
  strategyKind: "buyforce_dca",
  portfolioAltsMode: false,
  entryTiming: "next_open",
  executionOrder: "conservative",
  indicator: DEFAULT_CHAIK,
  dca: DEFAULT_DCA,
  pifagorAlts: DEFAULT_PIFAGOR_ALTS,
  pivot21: DEFAULT_PIVOT21,
  buyForce: DEFAULT_BUYFORCE_SETTINGS,
  sellForce: DEFAULT_SELLFORCE_SETTINGS,
  depthInterval: "1h",
};

/** Допустимые значения BacktestStrategyKind для нормализации raw input. */
function normalizeStrategyKind(raw: unknown): BacktestSettings["strategyKind"] {
  if (
    raw === "pifagor_alts" ||
    raw === "pivot21" ||
    raw === "chaik_dca" ||
    raw === "buyforce_dca" ||
    raw === "sellforce_dca"
  ) {
    return raw;
  }
  return "buyforce_dca";
}

/** Допустимые depth-таймфреймы. Pifagor VPS отдаёт только эти 4 уровня. */
function normalizeDepthInterval(
  raw: unknown,
): BacktestSettings["depthInterval"] {
  if (raw === "1m" || raw === "5m" || raw === "15m" || raw === "1h") return raw;
  return "1h";
}

/** Слияние снимка / частичного JSON с актуальными дефолтами (новые поля стратегии Pifagor). */
export function migrateBacktestSettings(raw: Partial<BacktestSettings>): BacktestSettings {
  const sk = normalizeStrategyKind(raw.strategyKind);
  const buyForce: BuyForceSettings = { ...DEFAULT_BUYFORCE_SETTINGS, ...raw.buyForce };
  const sellForce: SellForceSettings = { ...DEFAULT_SELLFORCE_SETTINGS, ...raw.sellForce };
  const base: BacktestSettings = {
    ...DEFAULT_BACKTEST,
    ...raw,
    strategyKind: sk,
    portfolioAltsMode: raw.portfolioAltsMode === true,
    entryTiming: raw.entryTiming === "signal_close" ? "signal_close" : "next_open",
    executionOrder:
      raw.executionOrder === "optimistic" ? "optimistic" : "conservative",
    indicator: { ...DEFAULT_CHAIK, ...raw.indicator },
    dca: migrateDcaSettings({ ...DEFAULT_DCA, ...raw.dca }),
    pifagorAlts: { ...DEFAULT_PIFAGOR_ALTS, ...raw.pifagorAlts },
    pivot21: { ...DEFAULT_PIVOT21, ...raw.pivot21 },
    buyForce,
    sellForce,
    depthInterval: normalizeDepthInterval(raw.depthInterval),
  };
  if (sk === "pifagor_alts") {
    return applyPifagorTvDefaults(base, {
      startDepositUsdt: base.dca.startDepositUsdt,
      entryNotionalUsdt: base.pifagorAlts.entryNotionalUsdt,
    });
  }
  return base;
}
