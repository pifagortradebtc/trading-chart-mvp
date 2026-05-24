"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, BarChart3 } from "lucide-react";
import { TopBar } from "@/components/panels/TopBar";
import { LeftToolbar } from "@/components/panels/LeftToolbar";
import { RightSidebar } from "@/components/panels/RightSidebar";
import { ChartWorkspace } from "@/components/chart/ChartWorkspace";
import { BacktestChartHandoffBootstrap } from "@/components/chart/BacktestChartHandoffBootstrap";
import { ChartOverlaySync } from "@/components/chart/ChartOverlaySync";
import { IndicatorSettingsModal } from "@/components/modals/IndicatorSettingsModal";
import { useIndicatorStore } from "@/store/useIndicatorStore";
import { useBacktestOverlayStore } from "@/store/useBacktestOverlayStore";

/**
 * Empty-state для /chart, когда нет активной handoff-сессии бэктеста.
 * Раньше тут показывался дефолтный мок (BTC-USD 100→110), вводя оператора
 * в заблуждение — теперь явное сообщение, что страница — только для
 * просмотра графика конкретного бэктеста.
 */
function ChartRouteEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-tv-bg px-6 py-12">
      <div className="max-w-xl rounded-2xl border border-tv-border bg-tv-panel/60 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10">
          <BarChart3 size={22} className="text-amber-300" />
        </div>
        <h2 className="mt-5 font-display text-xl font-semibold text-tv-text">
          График сделок не выбран
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-tv-text/70">
          Эта страница рендерит свечи и разметку конкретного бэктеста. Чтобы её
          использовать — открой страницу бэктеста, запусти прогон, и нажми
          кнопку{" "}
          <span className="font-mono text-emerald-300">«График со сделками»</span>{" "}
          в шапке результатов (или иконку графика в строке отдельной сделки).
        </p>
        <p className="mt-2 text-xs text-tv-text/50">
          Здесь только свечи и разметка — никакого режима standalone-чарта нет.
        </p>
        <Link
          href="/backtest"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/15"
        >
          Перейти на бэктест
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

export function TradingShell() {
  const pathname = usePathname();
  /** Страница только для графика бэктеста — без терминала (watchlist, RSI-панель и т.д.). */
  const chartRouteOnly = pathname === "/chart";
  const openSettings = useIndicatorStore((s) => s.openSettings);
  const metaTitle = useBacktestOverlayStore((s) => s.metaTitle);
  const cleanChartUi = useBacktestOverlayStore((s) => s.cleanChartUi);
  const clearOverlay = useBacktestOverlayStore((s) => s.clear);
  const minimalChrome = cleanChartUi || chartRouteOnly;

  return (
    <div className="flex h-screen min-h-[480px] flex-col bg-tv-bg text-tv-text">
      <BacktestChartHandoffBootstrap />
      <ChartOverlaySync />
      <TopBar />
      {metaTitle ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sky-900/50 bg-sky-950/35 px-3 py-1.5 text-xs text-sky-100">
          <span className="truncate font-medium">{metaTitle}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sky-300/90 sm:inline">
              {minimalChrome
                ? "Жёлто-зелёный канал — ALTS (aaa1); стрелки — вход/выход; оранжевые отрезки — уровни DCA."
                : "Зелёный — вход, оранжевый — DCA, зелёный TP, красный — ликвидация"}
            </span>
            <button
              type="button"
              onClick={() => clearOverlay()}
              className="rounded bg-sky-900/80 px-2 py-0.5 hover:bg-sky-800"
            >
              Сбросить разметку
            </button>
            <Link href="/backtest" className="text-sky-300 underline-offset-2 hover:text-white hover:underline">
              Бэктест
            </Link>
          </span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {!minimalChrome ? <LeftToolbar /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {!minimalChrome ? (
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-3">
              <button
                type="button"
                onClick={() => openSettings(null)}
                className="rounded bg-tv-toolbar px-3 py-1.5 text-xs font-medium text-tv-text hover:bg-tv-toolbar/80"
              >
                Indicators
              </button>
            </div>
          ) : null}
          {chartRouteOnly && !metaTitle ? (
            <ChartRouteEmptyState />
          ) : (
            <ChartWorkspace />
          )}
        </div>
        {!minimalChrome ? <RightSidebar /> : null}
      </div>
      <IndicatorSettingsModal />
    </div>
  );
}
