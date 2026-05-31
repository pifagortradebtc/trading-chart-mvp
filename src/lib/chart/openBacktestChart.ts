import { intervalToChartTimeframe } from "@/lib/chart/intervalToChartTimeframe";
import type { TradeRecord } from "@/lib/backtest/types";
import type { Candle, Timeframe } from "@/types/candle";
import type { ChartFetchParams } from "@/store/useBacktestOverlayStore";

const HANDOFF_KEY = "backtest-chart-handoff-v1";
const PAD_DEFAULT_MS = 14 * 24 * 3600 * 1000;

export interface BacktestChartHandoff {
  sessionTrades: TradeRecord[];
  fetchParams: ChartFetchParams;
  metaTitle: string;
  cleanChartUi: boolean;
  symbol: string;
  timeframe: Timeframe;
  /** Для мгновенного отображения до подгрузки `/api/ohlcv`. */
  candles?: Candle[];
}

/**
 * Лимит safety: если payload > 4MB, localStorage в Chrome/Safari обычно
 * кидает QuotaExceededError. На /chart всё равно fallback к /api/ohlcv,
 * так что candles в handoff не передаём — только метаданные и trades.
 */
const HANDOFF_MAX_BYTES = 4 * 1024 * 1024;

function stashHandoff(payload: BacktestChartHandoff): void {
  if (typeof window === "undefined") return;
  // Защитная стратегия: candles тяжёлые (1000+ баров × ~150 байт/каждая),
  // вместе с большой trade-таблицей легко превышаем 5MB-квоту. На /chart
  // BacktestChartHandoffBootstrap всё равно делает fallback fetch
  // на /api/ohlcv по `fetchParams`, поэтому свечи здесь не нужны.
  const slim: BacktestChartHandoff = { ...payload, candles: undefined };
  let serialized = JSON.stringify(slim);
  if (serialized.length > HANDOFF_MAX_BYTES) {
    // Большой объём trades (>10k) — берём только первые 5k для разметки графика
    const trimmedTrades = slim.sessionTrades.slice(0, 5000);
    serialized = JSON.stringify({ ...slim, sessionTrades: trimmedTrades });
    console.warn(
      `openBacktestChart: trades trimmed ${slim.sessionTrades.length} → ${trimmedTrades.length} для соблюдения localStorage quota`,
    );
  }
  try {
    localStorage.setItem(HANDOFF_KEY, serialized);
  } catch (e) {
    console.error("openBacktestChart: stash failed", e);
  }
}

export function consumeBacktestChartHandoff(): BacktestChartHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    /**
     * Не удаляем ключ после первого чтения — оставляем как «последний снапшот»
     * чтобы кнопка «Обновить» на /chart могла перечитать его после window.location.reload().
     * Перезаписывается при следующем запуске бэктеста (см. stashHandoff).
     */
    return JSON.parse(raw) as BacktestChartHandoff;
  } catch {
    localStorage.removeItem(HANDOFF_KEY);
    return null;
  }
}

export function openBacktestChartInNewTab(payload: BacktestChartHandoff): void {
  stashHandoff(payload);
  window.open("/chart", "_blank", "noopener,noreferrer");
}

export function buildTradeChartHandoff(
  trade: TradeRecord,
  symbolBinance: string,
  interval: string,
  candles: Candle[] = [],
  padMs = PAD_DEFAULT_MS,
): BacktestChartHandoff {
  const sym = symbolBinance.replace("/", "").toUpperCase();
  const tf = intervalToChartTimeframe(interval);
  const startMs = Math.max(0, trade.entrySignalTime - padMs);
  const endMs = trade.exitTime + padMs;
  return {
    sessionTrades: [trade],
    fetchParams: { symbolBinance: sym, interval, startMs, endMs },
    metaTitle: `Сделка #${trade.id} · ${sym} · ${interval} · ${trade.side.toUpperCase()} · ${trade.regime}`,
    cleanChartUi: true,
    symbol: sym,
    timeframe: tf,
    candles: candles.length ? candles : undefined,
  };
}

export function buildSessionChartHandoff(
  trades: TradeRecord[],
  symbolBinance: string,
  interval: string,
  fromMs: number,
  toMs: number,
  candles: Candle[] = [],
  padMs = PAD_DEFAULT_MS,
): BacktestChartHandoff {
  const sym = symbolBinance.replace("/", "").toUpperCase();
  const tf = intervalToChartTimeframe(interval);
  const startMs = Math.max(0, fromMs - padMs);
  const endMs = toMs + padMs;
  return {
    sessionTrades: trades,
    fetchParams: { symbolBinance: sym, interval, startMs, endMs },
    metaTitle: `Бэктест · ${sym} · ${interval} · ${trades.length} сделок`,
    cleanChartUi: true,
    symbol: sym,
    timeframe: tf,
    candles: candles.length ? candles : undefined,
  };
}
