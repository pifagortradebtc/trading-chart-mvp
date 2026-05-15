/**
 * Настройки порта Pine «Pifagor_ALTS» для веб-бэктеста (без UI-дашборда Pine).
 */

export type PifagorLineRisk = "less" | "more";

export interface PifagorAltsSettings {
  /** «меньше» / «больше» степень риска (ветка aaa1). */
  lineRisk: PifagorLineRisk;
  /** Размер каждого входа в USDT (одинаковый на каждый сигнал; доливы до лимита маржи/баланса). */
  entryNotionalUsdt: number;
  /** Начало окна DCA (Unix ms), как input.time в Pine. */
  dcaStartMs: number;
  /** Конец окна DCA (Unix ms). */
  dcaEndMs: number;
  /** Выход по правилам Pine: daily_multiple > 3.5 или diff > 90. */
  usePineExitRules: boolean;
  /** Закрывать при +100% от средней (limit 2× avg), как `closewhen100` в Pine. */
  closewhen100: boolean;
  /** Не используется: вход на каждый бар enter без лимита, ограничение — только cash. */
  maxPyramidingEntries: number;
}
