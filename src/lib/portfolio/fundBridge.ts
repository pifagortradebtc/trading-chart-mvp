/**
 * Read-only bridge к Pifagor Fund (Криптофонд).
 *
 * Зачем: research-tool (мы) и фонд работают **независимо** — оператор
 * сам публикует NAV через Copy NAV. Но research может *смотреть*, что
 * сейчас активно в фонде, и считать delta vs target. Это даёт два
 * сценария:
 *   1. «Δ vs Live Fund» — таблица target vs live + rebalance hint
 *   2. «Import current → Rebalance Plan» — автозаполнение текущих весов
 *
 * Никакого writer-доступа здесь нет. Любая интеграция write осуществляется
 * человеком через админку фонда.
 *
 * Архитектура: client → /api/fund/composition (наш сервер) → /api/portfolio/public
 * (публичный endpoint фонда, без auth). Server-side proxy обходит CORS
 * и даёт единое место для маппинга bare-ticker (BTC) → exchange-symbol
 * (BTCUSDT) — формат, в котором живёт остальной research-код.
 */

import { useEffect, useState } from "react";

export interface FundLiveItem {
  /** Exchange-format symbol (BTCUSDT, ETHUSDT) — уже преобразован из bare. */
  symbol: string;
  /** Bare ticker from fund (BTC, ETH) — на случай если UI хочет показать. */
  bareSymbol: string;
  /** 0..1 (преобразовано из percent 0..100, как отдаёт фонд). */
  weight: number;
  /** Asset display name from fund payload. */
  name: string;
  /** Fund-side category. */
  category: "SPOT" | "CASH" | "BOT_TRADING" | "MANUAL_TRADING";
}

export interface FundLiveComposition {
  items: FundLiveItem[];
  lastChangedAt: string | null;
  /** Raw URL фонда — для UI-показа «откуда тащим». */
  fundUrl: string;
}

/**
 * Reverse-map bare ticker → exchange-format symbol. Совпадает с
 * SYMBOL_MAP в navExport.ts, но в обратную сторону. Если фонд отдаёт
 * символ вне whitelist'а — отображаем как `${bare}USDT` (best-effort).
 */
const BARE_TO_EXCHANGE: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  OKB: "OKBUSDT",
  MNT: "MNTUSDT",
  HYPE: "HYPEUSDT",
  TON: "TONUSDT",
};

export function exchangeSymbolFromBare(bare: string): string {
  const upper = bare.toUpperCase();
  return BARE_TO_EXCHANGE[upper] ?? `${upper}USDT`;
}

/**
 * Forms the client-side fetch. Возвращает null если:
 *   - PIFAGOR_FUND_API_URL не задан на сервере (его proxy отдаст 503)
 *   - Network/parse error
 *   - Сервер фонда вернул empty/невалидный response
 *
 * Никогда не throw — research должен gracefully скрыть блок при недоступности.
 */
export async function fetchLiveFundComposition(): Promise<FundLiveComposition | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/fund/composition", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{
        symbol?: string;
        name?: string;
        weight?: number;
        category?: string;
      }>;
      lastChangedAt?: string | null;
      fundUrl?: string;
    };
    if (!json?.items || !Array.isArray(json.items)) return null;

    const items: FundLiveItem[] = [];
    for (const it of json.items) {
      if (
        typeof it.symbol !== "string" ||
        typeof it.weight !== "number" ||
        !Number.isFinite(it.weight) ||
        it.weight < 0
      ) {
        continue;
      }
      const bare = it.symbol.toUpperCase();
      const category = normalizeCategory(it.category);
      items.push({
        symbol: category === "CASH" ? "USDT" : exchangeSymbolFromBare(bare),
        bareSymbol: bare,
        weight: it.weight / 100, // fund отдаёт percent
        name: typeof it.name === "string" ? it.name : bare,
        category,
      });
    }
    return {
      items,
      lastChangedAt: json.lastChangedAt ?? null,
      fundUrl: typeof json.fundUrl === "string" ? json.fundUrl : "",
    };
  } catch {
    return null;
  }
}

function normalizeCategory(c: unknown): FundLiveItem["category"] {
  if (c === "CASH" || c === "BOT_TRADING" || c === "MANUAL_TRADING") return c;
  return "SPOT";
}

// ─────────────────────────────────────────────────────────────────────────
// React hook (мягкий single-shot fetch + manual refresh)
// ─────────────────────────────────────────────────────────────────────────

export interface UseLiveFundCompositionState {
  data: FundLiveComposition | null;
  loading: boolean;
  /** Только проблемы fetch'а; null = «всё ок» или «just hasn't tried yet». */
  error: string | null;
  refresh: () => void;
}

export function useLiveFundComposition(): UseLiveFundCompositionState {
  const [data, setData] = useState<FundLiveComposition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLiveFundComposition()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (!d) setError("Fund API недоступен или не сконфигурирован");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

// ─────────────────────────────────────────────────────────────────────────
// Delta calculator — то, что показывается в «Δ vs Live Fund»
// ─────────────────────────────────────────────────────────────────────────

export interface FundDelta {
  symbol: string;
  /** Target weight 0..1 — то, что engine сейчас рекомендует. */
  target: number;
  /** Live weight 0..1 — то, что в фонде. */
  live: number;
  /** target - live, signed. */
  delta: number;
  /** «B» если нужно докупить, «S» если продать, «-» если в полосе. */
  action: "BUY" | "SELL" | "HOLD";
  bareSymbol?: string;
  name?: string;
  category?: FundLiveItem["category"];
}

export interface DeltaOptions {
  /** Band в долях (0.01 = 1pp), внутри которого считаем HOLD. По умолчанию 0.01. */
  band?: number;
}

/**
 * Сводит target weights (research) и live composition (фонд) в одну таблицу.
 * Возвращает строки, отсортированные по |delta| descending.
 */
export function deltaVsLive(
  targetWeights: Record<string, number>,
  live: FundLiveComposition | null,
  opts: DeltaOptions = {},
): FundDelta[] {
  const band = opts.band ?? 0.01;
  const liveBySymbol = new Map<string, FundLiveItem>();
  if (live) {
    for (const it of live.items) liveBySymbol.set(it.symbol, it);
  }
  const symbols = new Set<string>([
    ...Object.keys(targetWeights),
    ...(live ? live.items.map((i) => i.symbol) : []),
  ]);
  const out: FundDelta[] = [];
  for (const symbol of symbols) {
    const target = targetWeights[symbol] ?? 0;
    const liveItem = liveBySymbol.get(symbol);
    const liveWeight = liveItem?.weight ?? 0;
    const delta = target - liveWeight;
    let action: FundDelta["action"];
    if (Math.abs(delta) <= band) action = "HOLD";
    else if (delta > 0) action = "BUY";
    else action = "SELL";
    out.push({
      symbol,
      target,
      live: liveWeight,
      delta,
      action,
      bareSymbol: liveItem?.bareSymbol,
      name: liveItem?.name,
      category: liveItem?.category,
    });
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}
