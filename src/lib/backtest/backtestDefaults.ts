import type { BacktestSettings, ChaikKeltSettings, DcaBotSettings } from "./types";

export const DEFAULT_CHAIK: ChaikKeltSettings = {
  directionFilter: "auto",
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
};

export const DEFAULT_DCA: DcaBotSettings = {
  startDepositUsdt: 10_000,
  firstOrderUsdt: 100,
  leverage: 4,
  ordersCount: 7,
  priceOverlapPct: 25,
  priceFactor: 1.6,
  volumeFactor: 1.2,
  takeProfitPct: 0.6,
  stopLossPct: null,
  feePctPerSide: 0.055,
  fundingPctPer8h: 0,
  allowLong: true,
  allowShort: false,
  mode: "long",
};

export const DEFAULT_BACKTEST: BacktestSettings = {
  entryTiming: "next_open",
  executionOrder: "conservative",
  indicator: DEFAULT_CHAIK,
  dca: DEFAULT_DCA,
};
