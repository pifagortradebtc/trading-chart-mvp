/**
 * Настройки порта Pine «Pifagor_ALTS» для веб-бэктеста (без UI-дашборда Pine).
 */

export type PifagorLineRisk = "less" | "more";

export interface PifagorAltsSettings {
  /** «меньше» / «больше» степень риска (ветка aaa1). */
  lineRisk: PifagorLineRisk;
  /** Начало окна DCA (Unix ms), как input.time в Pine. */
  dcaStartMs: number;
  /** Конец окна DCA (Unix ms). */
  dcaEndMs: number;
  /** Выход по правилам Pine: daily_multiple > 3.5 или diff > 90. */
  usePineExitRules: boolean;
}
