/**
 * Настройки порта Pine «Pifagor 21 str» (P-magnets с мартингейлом) для веб-бэктеста.
 *
 * Идея: на каждом новом периоде `pivotTf` появляется магнит = (H+L+C)/3 предыдущего периода.
 * Когда позиция flat — для каждого валидного магнита ставится лимит-ордер (LONG ниже close, SHORT выше).
 * После каждого STOP размер позиции увеличивается на step (мартингейл), max — `maxRiskPct`.
 * После первой прибыли — сброс на base.
 */

export interface Pivot21Settings {
  /** Pine `pivotTf`: 'D' / 'W' / '4h' / '1h' / '15m' / '5m' — таймфрейм для расчёта pivots. */
  pivotTf: string;
  /** Pine `keepP`: 1..490 — сколько последних магнитов держать (старые удаляются). */
  keepP: number;
  /** Pine `projBars`: 1..100 — визуальная проекция (не влияет на торговлю, оставлено для совместимости UI). */
  projBars: number;
  /** Pine `minMagnetAge`: 0..100 — минимум баров до того, как магнит можно торговать. */
  minMagnetAge: number;
  /** Pine `tpPct`: 0.1..20, % от цены входа. */
  tpPct: number;
  /** Pine `slPct`: 0.1..20, % от цены входа. */
  slPct: number;
  /** Pine `baseRiskPct`: 0.1..100 — стартовый размер позиции (% equity). */
  baseRiskPct: number;
  /** Pine `maxRiskPct`: 0.1..500 — максимум размера позиции (% equity). */
  maxRiskPct: number;
  /** Pine `stepRiskPct`: 0.1..100 — шаг увеличения после стопа. */
  stepRiskPct: number;
  /** Разрешить лимит-ордера LONG (магнит ниже close). */
  allowLong: boolean;
  /** Разрешить лимит-ордера SHORT (магнит выше close). */
  allowShort: boolean;
  /** Pine `initial_capital`. */
  initialCapitalUsdt: number;
  /** В Pine отключена (0). Оставлено для тестов «как если бы fee включить». */
  feePctPerSide: number;
}
