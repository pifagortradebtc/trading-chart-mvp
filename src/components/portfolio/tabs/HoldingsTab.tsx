"use client";

/**
 * "Мои активы" (My Holdings) — top-level tab for the user's real-world
 * positions. Locally persisted (the parent owns persistence via the
 * `onPayloadChange` prop); this component is otherwise self-contained.
 *
 * UX layers (top → bottom):
 *   1. Header — eyebrow + title + small action chips.
 *   2. HoldingsTotalsCard — NAV, asset count, last-updated chip, baseline
 *      camera button.
 *   3. HoldingsAddRow — quick-pick symbol chips + free-form add input.
 *   4. HoldingsTable — one row per holding with live USD price + weight +
 *      optional Δ% / ΔUSD when a baseline is active.
 *   5. BaselinePanel — list of saved snapshots; the active one drives the
 *      drift card.
 *   6. DriftReportCard — visible only when an active baseline + holdings
 *      exist. Includes a "pipe weights into Rebalance Plan" CTA.
 *   7. TransactionLog — collapsed by default. Form + paginated list with
 *      soft-delete (void) per transaction.
 *
 * Everything that mutates persistent state flows through `onPayloadChange`
 * — no direct localStorage / I/O here.
 */

import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Plus,
  RefreshCw,
  Repeat2,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { NumberInput } from "@/components/backtest/NumberInput";
import { prettySymbol } from "@/lib/portfolio/format";
import { exchangeSymbolFromBare } from "@/lib/portfolio/fundBridge";
import {
  addBaseline,
  addTransaction,
  computeDrift,
  computeTotals,
  computeWeights,
  createBaselineSnapshot,
  normalizeForRebalance,
  removeHolding,
  upsertHolding,
  voidTransaction,
  type BaselineSnapshot,
  type DriftReport,
  type Holding,
  type HoldingsPayload,
  type Transaction,
  type TxKind,
} from "@/lib/portfolio/holdings";
import { useLivePrices } from "@/lib/portfolio/useLivePrices";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HoldingsTabProps {
  payload: HoldingsPayload;
  onPayloadChange: (next: HoldingsPayload) => void;
  basketSymbols: string[];
  onPipeToRebalance: (weights: Record<string, number>) => void;
}

// ---------------------------------------------------------------------------
// Local utilities (formatters etc.)
// ---------------------------------------------------------------------------

const QUICK_PICK_BARE = ["BTC", "ETH", "SOL", "BNB", "HYPE", "TON", "OKB", "MNT"];
const TX_PAGE_SIZE = 50;

function formatUsd(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(fractionDigits);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}${decPart ? "." + decPart : ""}`;
}

/** Smart price formatter — more decimals for cheap tokens. */
function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  if (price >= 1000) return formatUsd(price, 2);
  if (price >= 1) return formatUsd(price, 2);
  if (price >= 0.01) return formatUsd(price, 4);
  return formatUsd(price, 6);
}

function formatPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

function formatSignedUsd(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value), digits).replace("$", "$")}`;
}

function formatRelativeTime(at: number | null): string {
  if (!at || !Number.isFinite(at)) return "никогда";
  const diffMs = Date.now() - at;
  if (diffMs < 30_000) return "только что";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "менее минуты назад";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

function formatBaselineDate(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoDateInput(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateInput(value: string): number {
  if (!value) return Date.now();
  const [y, m, d] = value.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return Date.now();
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Bare→exchange wrapper that respects free-form input (already-suffixed). */
function resolveExchangeSymbol(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return "";
  if (trimmed.endsWith("USDT") || trimmed.endsWith("USDC") || trimmed.endsWith("BUSD")) {
    return trimmed;
  }
  return exchangeSymbolFromBare(trimmed);
}

const NUMBER_INPUT_CLS =
  "w-full rounded-md border border-surface-border bg-surface-strong/50 px-2.5 py-1.5 text-right font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40";

const CARD_CLS =
  "rounded-2xl border border-surface-border bg-surface p-5 backdrop-blur-xl shadow-card";

const EYEBROW_CLS = "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint";

// ---------------------------------------------------------------------------
// HoldingsTab — top-level orchestrator
// ---------------------------------------------------------------------------

export function HoldingsTab({
  payload,
  onPayloadChange,
  basketSymbols,
  onPipeToRebalance,
}: HoldingsTabProps) {
  // Wrap in useMemo so dependent useMemo/useCallback hooks don't re-fire every
  // render when payload.holdings is undefined (otherwise the `?? []` returns a
  // brand-new array reference on each render).
  const holdings = useMemo(() => payload.holdings ?? [], [payload.holdings]);

  // Live prices keyed on the union of holding symbols + every quick-pick
  // chip — that way the chips display proper prices once added.
  const priceSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) set.add(h.symbol);
    for (const bare of QUICK_PICK_BARE) set.add(exchangeSymbolFromBare(bare));
    return Array.from(set);
  }, [holdings]);

  const livePrices = useLivePrices(priceSymbols);

  /** Plain {symbol: priceUsd} map used by pure compute helpers. */
  const priceMap = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [sym, info] of Object.entries(livePrices.prices)) {
      out[sym] = info.priceUsd;
    }
    return out;
  }, [livePrices.prices]);

  const { totalUsd, perAsset } = useMemo(
    () => computeTotals(holdings, priceMap),
    [holdings, priceMap],
  );

  const weightsNow = useMemo(
    () => computeWeights(holdings, priceMap),
    [holdings, priceMap],
  );

  /** Track which baseline drives the drift card. Init to latest snapshot if any. */
  const [activeBaselineId, setActiveBaselineId] = useState<string | null>(() => {
    return payload.baselines && payload.baselines.length > 0
      ? payload.baselines[0].id
      : null;
  });

  // Keep activeBaselineId valid if the parent payload mutates externally
  // (e.g. import or factory-reset). Auto-select newest baseline if the
  // current id is no longer present.
  useEffect(() => {
    const baselines = payload.baselines ?? [];
    if (baselines.length === 0) {
      if (activeBaselineId !== null) setActiveBaselineId(null);
      return;
    }
    if (!activeBaselineId || !baselines.find((b) => b.id === activeBaselineId)) {
      setActiveBaselineId(baselines[0].id);
    }
  }, [payload.baselines, activeBaselineId]);

  const activeBaseline = useMemo<BaselineSnapshot | null>(() => {
    if (!activeBaselineId) return null;
    return (payload.baselines ?? []).find((b) => b.id === activeBaselineId) ?? null;
  }, [payload.baselines, activeBaselineId]);

  const driftReport = useMemo<DriftReport | null>(() => {
    if (!activeBaseline || holdings.length === 0) return null;
    return computeDrift(holdings, activeBaseline, priceMap);
  }, [activeBaseline, holdings, priceMap]);

  // ----- handlers ----------------------------------------------------------

  const [focusSymbol, setFocusSymbol] = useState<string | null>(null);

  const handleAddSymbol = useCallback(
    (rawSymbol: string) => {
      const exchangeSym = resolveExchangeSymbol(rawSymbol);
      if (!exchangeSym) return;
      // If already present — just focus its qty input.
      if (holdings.some((h) => h.symbol === exchangeSym)) {
        setFocusSymbol(exchangeSym);
        return;
      }
      const nextHoldings = upsertHolding(holdings, exchangeSym, 0);
      onPayloadChange({ ...payload, holdings: nextHoldings });
      setFocusSymbol(exchangeSym);
    },
    [holdings, onPayloadChange, payload],
  );

  const handleQtyChange = useCallback(
    (symbol: string, qty: number) => {
      const next = upsertHolding(holdings, symbol, qty);
      onPayloadChange({ ...payload, holdings: next });
    },
    [holdings, onPayloadChange, payload],
  );

  const handleRemoveHolding = useCallback(
    (symbol: string) => {
      const next = removeHolding(holdings, symbol);
      onPayloadChange({ ...payload, holdings: next });
    },
    [holdings, onPayloadChange, payload],
  );

  const handleCaptureBaseline = useCallback(() => {
    const snap = createBaselineSnapshot(holdings, priceMap);
    const next = addBaseline(payload, snap);
    onPayloadChange(next);
    setActiveBaselineId(snap.id);
  }, [holdings, priceMap, onPayloadChange, payload]);

  const handleSelectBaseline = useCallback((id: string) => {
    setActiveBaselineId(id);
  }, []);

  const handleDeleteBaseline = useCallback(
    (id: string) => {
      const baselines = (payload.baselines ?? []).filter((b) => b.id !== id);
      onPayloadChange({ ...payload, baselines });
      if (activeBaselineId === id) {
        setActiveBaselineId(baselines.length > 0 ? baselines[0].id : null);
      }
    },
    [activeBaselineId, onPayloadChange, payload],
  );

  const handleAddTx = useCallback(
    (tx: Omit<Transaction, "id" | "loggedAt">) => {
      const next = addTransaction(payload, tx);
      onPayloadChange(next);
    },
    [onPayloadChange, payload],
  );

  const handleVoidTx = useCallback(
    (id: string) => {
      const next = voidTransaction(payload, id);
      onPayloadChange(next);
    },
    [onPayloadChange, payload],
  );

  // Pipe-to-Rebalance handler with a transient toast.
  const [pipeToast, setPipeToast] = useState<string | null>(null);
  useEffect(() => {
    if (!pipeToast) return;
    const t = window.setTimeout(() => setPipeToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [pipeToast]);

  const handlePipeToRebalance = useCallback(() => {
    const normalized = normalizeForRebalance(weightsNow, basketSymbols);
    onPipeToRebalance(normalized);
    const n = Object.keys(normalized).length;
    setPipeToast(`Веса записаны в Rebalance Plan (${n} ${n === 1 ? "актив" : "активов"})`);
  }, [basketSymbols, onPipeToRebalance, weightsNow]);

  const stale = Object.values(livePrices.prices).some((p) => p.stale);

  // ----- render ------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      <HoldingsHeader holdingsCount={holdings.length} />

      <HoldingsTotalsCard
        totalUsd={totalUsd}
        assetCount={holdings.length}
        lastUpdatedAt={livePrices.lastUpdatedAt}
        stale={stale}
        loading={livePrices.loading}
        onRefresh={() => void livePrices.refresh()}
        onCaptureBaseline={handleCaptureBaseline}
        canCapture={holdings.length > 0 && totalUsd > 0}
        error={livePrices.error}
      />

      <HoldingsAddRow
        existingSymbols={holdings.map((h) => h.symbol)}
        onAdd={handleAddSymbol}
        isEmpty={holdings.length === 0}
      />

      {holdings.length > 0 && (
        <HoldingsTable
          holdings={holdings}
          prices={livePrices.prices}
          perAsset={perAsset}
          weights={weightsNow}
          showDriftCols={Boolean(activeBaseline)}
          driftReport={driftReport}
          focusSymbol={focusSymbol}
          onQtyChange={handleQtyChange}
          onRemove={handleRemoveHolding}
        />
      )}

      {(payload.baselines ?? []).length > 0 && (
        <BaselinePanel
          baselines={payload.baselines ?? []}
          activeId={activeBaselineId}
          onSelect={handleSelectBaseline}
          onDelete={handleDeleteBaseline}
        />
      )}

      {activeBaseline && driftReport && (
        <DriftReportCard
          baseline={activeBaseline}
          report={driftReport}
          onPipe={handlePipeToRebalance}
          toast={pipeToast}
        />
      )}

      <TransactionLog
        transactions={payload.transactions ?? []}
        holdingsSymbols={holdings.map((h) => h.symbol)}
        onAdd={handleAddTx}
        onVoid={handleVoidTx}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HoldingsHeader
// ---------------------------------------------------------------------------

interface HoldingsHeaderProps {
  holdingsCount: number;
}

function HoldingsHeader({ holdingsCount }: HoldingsHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow">holdings</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-display-tight text-ink sm:text-[2.25rem]">
          Мои <span className="accent-serif text-brand-light">активы</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {holdingsCount === 0
            ? "Введите ваши реальные позиции — увидите вес, drift и пайп в Rebalance Plan."
            : "Реальные позиции, веса, drift и журнал операций. Всё хранится только в вашем браузере."}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-faint">
        <Wallet size={14} className="text-brand-light" />
        <span className="font-mono uppercase tracking-[0.18em]">локально · браузер</span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HoldingsTotalsCard
// ---------------------------------------------------------------------------

interface HoldingsTotalsCardProps {
  totalUsd: number;
  assetCount: number;
  lastUpdatedAt: number | null;
  stale: boolean;
  loading: boolean;
  onRefresh: () => void;
  onCaptureBaseline: () => void;
  canCapture: boolean;
  error: string | null;
}

function HoldingsTotalsCard({
  totalUsd,
  assetCount,
  lastUpdatedAt,
  stale,
  loading,
  onRefresh,
  onCaptureBaseline,
  canCapture,
  error,
}: HoldingsTotalsCardProps) {
  const [confirming, setConfirming] = useState(false);

  // Reset confirm-state if the parent disables the button.
  useEffect(() => {
    if (!canCapture && confirming) setConfirming(false);
  }, [canCapture, confirming]);

  return (
    <section className={CARD_CLS}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <p className={EYEBROW_CLS}>nav</p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
              {formatUsd(totalUsd, 2)}
            </p>
          </div>
          <div className="hidden h-10 w-px bg-surface-border sm:block" />
          <div>
            <p className={EYEBROW_CLS}>активов</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{assetCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-strong/40 px-3 py-1.5 text-xs text-ink-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-50"
            title="Обновить цены"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span className="font-mono uppercase tracking-[0.18em]">
              обновлено {formatRelativeTime(lastUpdatedAt)}
            </span>
          </button>

          {stale && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
              <AlertTriangle size={12} />
              <span className="font-mono uppercase tracking-[0.18em]">цены устарели</span>
            </span>
          )}

          {confirming ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs text-brand-light">
              <button
                type="button"
                onClick={() => {
                  onCaptureBaseline();
                  setConfirming(false);
                }}
                className="inline-flex items-center gap-1 font-medium hover:text-brand"
              >
                <Check size={12} /> Подтвердить
              </button>
              <span className="text-ink-faint">·</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex items-center gap-1 hover:text-ink"
              >
                <X size={12} /> отмена
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canCapture}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs text-brand-light transition hover:border-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
              title={canCapture ? "Зафиксировать текущие qty и цены как snapshot" : "Сначала добавьте активы с количеством"}
            >
              <Camera size={12} />
              <span className="font-mono uppercase tracking-[0.18em]">Зафиксировать baseline</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HoldingsAddRow — quick-pick chips + free-form input
// ---------------------------------------------------------------------------

interface HoldingsAddRowProps {
  existingSymbols: string[];
  onAdd: (raw: string) => void;
  isEmpty: boolean;
}

function HoldingsAddRow({ existingSymbols, onAdd, isEmpty }: HoldingsAddRowProps) {
  const [freeform, setFreeform] = useState("");
  const existingSet = new Set(existingSymbols);

  const handleSubmit = () => {
    const v = freeform.trim();
    if (!v) return;
    onAdd(v);
    setFreeform("");
  };

  return (
    <section className={CARD_CLS}>
      <div className="flex items-center gap-2">
        <Coins size={14} className="text-brand-light" />
        <p className={EYEBROW_CLS}>добавить актив</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PICK_BARE.map((bare) => {
          const exchangeSym = exchangeSymbolFromBare(bare);
          const owned = existingSet.has(exchangeSym);
          return (
            <button
              key={bare}
              type="button"
              onClick={() => onAdd(bare)}
              className={
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition " +
                (owned
                  ? "border-brand/40 bg-brand/10 text-brand-light"
                  : "border-surface-border bg-surface-strong/40 text-ink-muted hover:border-brand/40 hover:text-ink")
              }
              title={owned ? "Уже в портфеле — клик сфокусирует строку" : `Добавить ${bare}`}
            >
              {owned ? <Check size={11} /> : <Plus size={11} />}
              <span className="font-mono">{bare}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={freeform}
          onChange={(e) => setFreeform(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Свой тикер (например, ARB или ARBUSDT)"
          className="flex-1 min-w-[200px] rounded-md border border-surface-border bg-surface-strong/50 px-3 py-2 font-mono text-sm uppercase text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!freeform.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand-light transition hover:border-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={12} />
          <span className="font-mono uppercase tracking-[0.18em]">Добавить</span>
        </button>
      </div>

      {isEmpty && (
        <p className="mt-3 text-xs text-ink-faint">
          Это локальная запись, хранится только в браузере.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HoldingsTable
// ---------------------------------------------------------------------------

interface HoldingsTableProps {
  holdings: Holding[];
  prices: Record<string, { priceUsd: number; source: "coingecko" | "snapshot"; stale: boolean; fetchedAt: number }>;
  perAsset: Record<string, number>;
  weights: Record<string, number>;
  showDriftCols: boolean;
  driftReport: DriftReport | null;
  focusSymbol: string | null;
  onQtyChange: (symbol: string, qty: number) => void;
  onRemove: (symbol: string) => void;
}

function HoldingsTable({
  holdings,
  prices,
  perAsset,
  weights,
  showDriftCols,
  driftReport,
  focusSymbol,
  onQtyChange,
  onRemove,
}: HoldingsTableProps) {
  const driftBySymbol = useMemo(() => {
    const map = new Map<string, DriftReport["rows"][number]>();
    if (driftReport) {
      for (const row of driftReport.rows) map.set(row.symbol, row);
    }
    return map;
  }, [driftReport]);

  // Sort by USD value descending — biggest positions first. Zero-value rows
  // (no qty yet or missing price) sink to the bottom by symbol alphabetical.
  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const va = perAsset[a.symbol] ?? 0;
      const vb = perAsset[b.symbol] ?? 0;
      if (vb !== va) return vb - va;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [holdings, perAsset]);

  return (
    <section className={CARD_CLS}>
      <div className="flex items-center gap-2">
        <p className={EYEBROW_CLS}>портфель</p>
        <span className="text-xs text-ink-faint">
          {holdings.length} {holdings.length === 1 ? "актив" : "активов"}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className={"py-2 pr-3 " + EYEBROW_CLS}>symbol</th>
              <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>qty</th>
              <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>price</th>
              <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>usd</th>
              <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>weight</th>
              {showDriftCols && (
                <>
                  <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>Δ pp</th>
                  <th className={"py-2 pr-3 text-right " + EYEBROW_CLS}>Δ usd</th>
                </>
              )}
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <HoldingsRow
                key={h.symbol}
                holding={h}
                priceInfo={prices[h.symbol] ?? null}
                usdValue={perAsset[h.symbol] ?? 0}
                weight={weights[h.symbol] ?? 0}
                showDriftCols={showDriftCols}
                drift={driftBySymbol.get(h.symbol) ?? null}
                autoFocus={focusSymbol === h.symbol}
                onQtyChange={onQtyChange}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HoldingsRow
// ---------------------------------------------------------------------------

interface HoldingsRowProps {
  holding: Holding;
  priceInfo: { priceUsd: number; source: "coingecko" | "snapshot"; stale: boolean; fetchedAt: number } | null;
  usdValue: number;
  weight: number;
  showDriftCols: boolean;
  drift: DriftReport["rows"][number] | null;
  autoFocus: boolean;
  onQtyChange: (symbol: string, qty: number) => void;
  onRemove: (symbol: string) => void;
}

function HoldingsRow({
  holding,
  priceInfo,
  usdValue,
  weight,
  showDriftCols,
  drift,
  autoFocus,
  onQtyChange,
  onRemove,
}: HoldingsRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const weightPct = weight * 100;
  let weightCls = "text-ink";
  if (weightPct > 70) weightCls = "text-rose-300";
  else if (weightPct > 50) weightCls = "text-amber-200";

  const priceMissing = !priceInfo || !Number.isFinite(priceInfo.priceUsd) || priceInfo.priceUsd <= 0;
  const priceCls = !priceInfo
    ? "text-ink-faint"
    : priceInfo.stale
      ? "italic text-amber-200"
      : "text-ink";

  return (
    <tr className="border-t border-surface-border/60 transition hover:bg-surface-strong/30">
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-ink">
            {prettySymbol(holding.symbol)}
          </span>
          {priceInfo?.source === "snapshot" && !priceMissing && (
            <span
              className="rounded-sm border border-surface-border bg-surface-strong/50 px-1 py-px font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint"
              title="Цена из локального snapshot, live API не ответил"
            >
              snap
            </span>
          )}
        </div>
      </td>

      <td className="py-2 pr-3 text-right">
        <NumberInput
          value={holding.qty}
          onValueChange={(n) => onQtyChange(holding.symbol, n)}
          min={0}
          step={0.0001}
          className={NUMBER_INPUT_CLS}
          name={`qty-${holding.symbol}`}
          id={autoFocus ? `qty-input-${holding.symbol}` : undefined}
        />
      </td>

      <td className={"py-2 pr-3 text-right font-mono " + priceCls}>
        {priceMissing ? (
          <span title="Нет данных для этого тикера — оставлено как watch-only">
            —
            <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              watch only
            </span>
          </span>
        ) : (
          formatPrice(priceInfo!.priceUsd)
        )}
      </td>

      <td className="py-2 pr-3 text-right font-mono text-ink">
        {usdValue > 0 ? formatUsd(usdValue, 2) : <span className="text-ink-faint">—</span>}
      </td>

      <td className={"py-2 pr-3 text-right font-mono " + weightCls}>
        {usdValue > 0 ? `${weightPct.toFixed(1)}%` : <span className="text-ink-faint">—</span>}
      </td>

      {showDriftCols && (
        <>
          <td className="py-2 pr-3 text-right font-mono">
            {drift ? (
              <span
                className={
                  drift.deltaWeightPp > 0.05
                    ? "text-emerald-300"
                    : drift.deltaWeightPp < -0.05
                      ? "text-rose-300"
                      : "text-ink-faint"
                }
              >
                {drift.deltaWeightPp > 0 ? "+" : ""}
                {drift.deltaWeightPp.toFixed(1)} pp
              </span>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </td>
          <td className="py-2 pr-3 text-right font-mono">
            {drift ? (
              <span
                className={
                  drift.deltaValueUsd > 1
                    ? "text-emerald-300"
                    : drift.deltaValueUsd < -1
                      ? "text-rose-300"
                      : "text-ink-faint"
                }
              >
                {formatSignedUsd(drift.deltaValueUsd, 0)}
              </span>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </td>
        </>
      )}

      <td className="py-2 pl-2 text-right">
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
            <button
              type="button"
              onClick={() => {
                onRemove(holding.symbol);
                setConfirmingDelete(false);
              }}
              className="font-mono uppercase tracking-[0.18em] hover:text-rose-100"
            >
              уверены?
            </button>
            <span className="text-ink-faint">·</span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="font-mono uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
            >
              отмена
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md p-1.5 text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-300"
            title="Удалить позицию"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// BaselinePanel
// ---------------------------------------------------------------------------

interface BaselinePanelProps {
  baselines: BaselineSnapshot[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function BaselinePanel({ baselines, activeId, onSelect, onDelete }: BaselinePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? baselines : baselines.slice(0, 5);
  const remaining = baselines.length - visible.length;

  return (
    <section className={CARD_CLS}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera size={14} className="text-brand-light" />
          <p className={EYEBROW_CLS}>baselines</p>
          <span className="text-xs text-ink-faint">{baselines.length}</span>
        </div>
        {activeId && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
            активный snapshot подсвечен
          </span>
        )}
      </div>

      <ul className="mt-3 divide-y divide-surface-border/60">
        {visible.map((b) => (
          <BaselineRow
            key={b.id}
            baseline={b}
            isActive={b.id === activeId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </ul>

      {remaining > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs text-brand-light hover:text-brand"
        >
          ещё {remaining} →
        </button>
      )}
      {expanded && baselines.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-3 text-xs text-ink-muted hover:text-ink"
        >
          свернуть
        </button>
      )}
    </section>
  );
}

interface BaselineRowProps {
  baseline: BaselineSnapshot;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function BaselineRow({ baseline, isActive, onSelect, onDelete }: BaselineRowProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={
        "flex flex-wrap items-center justify-between gap-3 py-2 " +
        (isActive ? "text-ink" : "text-ink-muted")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "inline-block h-2 w-2 rounded-full " +
            (isActive ? "bg-brand shadow-[0_0_8px_rgba(201,169,98,0.7)]" : "bg-surface-border")
          }
        />
        <div className="flex flex-col">
          <span className="text-sm">{baseline.label}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {formatBaselineDate(baseline.takenAt)} · {formatUsd(baseline.totalUsd, 0)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isActive ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
            активный
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(baseline.id)}
            className="rounded-md border border-surface-border bg-surface-strong/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:border-brand/40 hover:text-ink"
          >
            restore
          </button>
        )}
        {confirming ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200">
            <button
              type="button"
              onClick={() => {
                onDelete(baseline.id);
                setConfirming(false);
              }}
              className="font-mono uppercase tracking-[0.18em] hover:text-rose-100"
            >
              удалить?
            </button>
            <span className="text-ink-faint">·</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="font-mono uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
            >
              отмена
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md p-1 text-ink-faint hover:bg-rose-500/10 hover:text-rose-300"
            title="Удалить snapshot"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// DriftReportCard
// ---------------------------------------------------------------------------

interface DriftReportCardProps {
  baseline: BaselineSnapshot;
  report: DriftReport;
  onPipe: () => void;
  toast: string | null;
}

function DriftReportCard({ baseline, report, onPipe, toast }: DriftReportCardProps) {
  const totalDeltaPositive = report.totalDeltaUsd >= 0;
  const totalDeltaPct = report.totalDeltaPct * 100;
  const topRow = report.topDrifter
    ? report.rows.find((r) => r.symbol === report.topDrifter)
    : null;
  const topDriftPp = topRow ? topRow.deltaWeightPp : 0;

  return (
    <section className={CARD_CLS}>
      <div className="flex items-center gap-2">
        <Repeat2 size={14} className="text-brand-light" />
        <p className={EYEBROW_CLS}>drift</p>
        <span className="text-xs text-ink-faint">
          с baseline от {formatBaselineDate(baseline.takenAt)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-ink-muted">Сейчас</span>
        <span className="font-mono text-base font-medium text-ink">
          {formatUsd(report.totalNow, 2)}
        </span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink-muted">Baseline</span>
        <span className="font-mono text-base text-ink">
          {formatUsd(report.totalAtBaseline, 2)}
        </span>
        <span className="text-ink-faint">·</span>
        <span
          className={
            "font-mono text-base font-medium " +
            (totalDeltaPositive ? "text-emerald-300" : "text-rose-300")
          }
        >
          {formatPct(totalDeltaPct, 2)} ({formatSignedUsd(report.totalDeltaUsd, 0)})
        </span>
      </div>

      {topRow && (
        <div className="mt-4 rounded-md border border-surface-border bg-surface-strong/40 p-3">
          <p className="text-sm text-ink">
            <span className="font-mono font-medium text-brand-light">
              {prettySymbol(topRow.symbol)}
            </span>{" "}
            ушёл на{" "}
            <span
              className={
                "font-mono " +
                (topDriftPp >= 0 ? "text-emerald-300" : "text-rose-300")
              }
            >
              {topDriftPp > 0 ? "+" : ""}
              {topDriftPp.toFixed(1)} pp
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            если &gt; 5pp — пора ребалансировать
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPipe}
          className="inline-flex items-center gap-2 rounded-md border border-brand/50 bg-brand/15 px-4 py-2 text-sm text-brand-light transition hover:border-brand hover:bg-brand/25"
        >
          <Repeat2 size={14} />
          <span className="font-mono uppercase tracking-[0.18em]">
            Использовать как Current % в Rebalance Plan
          </span>
        </button>
        {toast && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
            <Check size={12} />
            {toast}
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TransactionLog — collapsed by default
// ---------------------------------------------------------------------------

interface TransactionLogProps {
  transactions: Transaction[];
  holdingsSymbols: string[];
  onAdd: (tx: Omit<Transaction, "id" | "loggedAt">) => void;
  onVoid: (id: string) => void;
}

function TransactionLog({
  transactions,
  holdingsSymbols,
  onAdd,
  onVoid,
}: TransactionLogProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className={CARD_CLS}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-brand-light" />
          ) : (
            <ChevronRight size={14} className="text-ink-muted" />
          )}
          <p className={EYEBROW_CLS}>журнал операций (опционально)</p>
          {transactions.length > 0 && (
            <span className="text-xs text-ink-faint">{transactions.length}</span>
          )}
        </div>
        <span className="text-xs text-ink-faint">
          {open ? "свернуть" : "развернуть"}
        </span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <TxForm
            holdingsSymbols={holdingsSymbols}
            onSubmit={onAdd}
          />
          <TxList transactions={transactions} onVoid={onVoid} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// TxForm
// ---------------------------------------------------------------------------

interface TxFormProps {
  holdingsSymbols: string[];
  onSubmit: (tx: Omit<Transaction, "id" | "loggedAt">) => void;
}

function TxForm({ holdingsSymbols, onSubmit }: TxFormProps) {
  const [kind, setKind] = useState<TxKind>("BUY");
  const [qty, setQty] = useState<number>(0);
  const [symbol, setSymbol] = useState<string>(holdingsSymbols[0] ?? "");
  const [customSymbol, setCustomSymbol] = useState<string>("");
  const [priceUsd, setPriceUsd] = useState<number>(0);
  const [dateStr, setDateStr] = useState<string>(() => isoDateInput(Date.now()));

  // Keep the symbol selector in sync if the holdings list changes (e.g.
  // user added a new asset while the form was already mounted).
  useEffect(() => {
    if (!symbol && holdingsSymbols.length > 0) setSymbol(holdingsSymbols[0]);
  }, [holdingsSymbols, symbol]);

  const effectiveSymbol = customSymbol.trim()
    ? resolveExchangeSymbol(customSymbol)
    : symbol;

  const valid = qty > 0 && Boolean(effectiveSymbol) && priceUsd >= 0;

  const handleSubmit = () => {
    if (!valid) return;
    onSubmit({
      kind,
      qty,
      symbol: effectiveSymbol,
      priceUsd: priceUsd > 0 ? priceUsd : null,
      occurredAt: parseDateInput(dateStr),
    });
    // Reset form (keep kind and date for fast multi-entry).
    setQty(0);
    setCustomSymbol("");
    setPriceUsd(0);
  };

  return (
    <div className="rounded-md border border-surface-border bg-surface-strong/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div className="sm:col-span-1">
          <label className={EYEBROW_CLS}>kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TxKind)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-strong/50 px-2 py-1.5 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
          >
            <option value="BUY">Купил</option>
            <option value="SELL">Продал</option>
            <option value="DEPOSIT">Депозит</option>
            <option value="WITHDRAW">Вывод</option>
          </select>
        </div>

        <div className="sm:col-span-1">
          <label className={EYEBROW_CLS}>qty</label>
          <NumberInput
            value={qty}
            onValueChange={setQty}
            min={0}
            step={0.0001}
            className={"mt-1 " + NUMBER_INPUT_CLS}
            name="tx-qty"
          />
        </div>

        <div className="sm:col-span-2">
          <label className={EYEBROW_CLS}>symbol</label>
          <div className="mt-1 flex gap-1">
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setCustomSymbol("");
              }}
              disabled={customSymbol.trim().length > 0 || holdingsSymbols.length === 0}
              className="flex-1 rounded-md border border-surface-border bg-surface-strong/50 px-2 py-1.5 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-50"
            >
              {holdingsSymbols.length === 0 ? (
                <option value="">—</option>
              ) : (
                holdingsSymbols.map((s) => (
                  <option key={s} value={s}>
                    {prettySymbol(s)}
                  </option>
                ))
              )}
            </select>
            <input
              type="text"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
              placeholder="или свой"
              className="w-24 rounded-md border border-surface-border bg-surface-strong/50 px-2 py-1.5 font-mono text-sm uppercase text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </div>
        </div>

        <div className="sm:col-span-1">
          <label className={EYEBROW_CLS}>price usd</label>
          <NumberInput
            value={priceUsd}
            onValueChange={setPriceUsd}
            min={0}
            step={0.01}
            className={"mt-1 " + NUMBER_INPUT_CLS}
            name="tx-price"
          />
        </div>

        <div className="sm:col-span-1">
          <label className={EYEBROW_CLS}>date</label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-strong/50 px-2 py-1.5 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand-light transition hover:border-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={12} />
          <span className="font-mono uppercase tracking-[0.18em]">Добавить</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TxList — paginated 50/page
// ---------------------------------------------------------------------------

interface TxListProps {
  transactions: Transaction[];
  onVoid: (id: string) => void;
}

function TxList({ transactions, onVoid }: TxListProps) {
  const [page, setPage] = useState(0);
  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0) || (b.loggedAt ?? 0) - (a.loggedAt ?? 0),
      ),
    [transactions],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / TX_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const slice = sorted.slice(
    clampedPage * TX_PAGE_SIZE,
    (clampedPage + 1) * TX_PAGE_SIZE,
  );

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-ink-faint">
        Журнал пуст. Добавьте операцию выше — это удобно для трекинга средней
        цены, но не обязательно.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-surface-border/60">
        {slice.map((tx) => (
          <TxRow key={tx.id} tx={tx} onVoid={onVoid} />
        ))}
      </ul>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="rounded-md border border-surface-border bg-surface-strong/40 px-2 py-1 font-mono uppercase tracking-[0.18em] hover:border-brand/40 hover:text-ink disabled:opacity-40"
          >
            ← prev
          </button>
          <span className="font-mono uppercase tracking-[0.18em] text-ink-faint">
            страница {clampedPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            className="rounded-md border border-surface-border bg-surface-strong/40 px-2 py-1 font-mono uppercase tracking-[0.18em] hover:border-brand/40 hover:text-ink disabled:opacity-40"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}

interface TxRowProps {
  tx: Transaction;
  onVoid: (id: string) => void;
}

function TxRow({ tx, onVoid }: TxRowProps) {
  const [confirming, setConfirming] = useState(false);
  const voided = tx.voidedAt != null;
  const kindLabel: Record<TxKind, string> = {
    BUY: "Купил",
    SELL: "Продал",
    DEPOSIT: "Депозит",
    WITHDRAW: "Вывод",
  };
  const kindCls: Record<TxKind, string> = {
    BUY: "text-emerald-300",
    SELL: "text-rose-300",
    DEPOSIT: "text-sky-300",
    WITHDRAW: "text-amber-300",
  };

  return (
    <li
      className={
        "flex flex-wrap items-center justify-between gap-3 py-2 text-sm " +
        (voided ? "opacity-50" : "")
      }
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={"font-mono text-xs uppercase tracking-[0.18em] " + kindCls[tx.kind]}>
          {kindLabel[tx.kind]}
        </span>
        <span className={"font-mono " + (voided ? "line-through text-ink-faint" : "text-ink")}>
          {tx.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}
        </span>
        <span className={"font-mono font-medium " + (voided ? "line-through" : "text-brand-light")}>
          {prettySymbol(tx.symbol)}
        </span>
        {tx.priceUsd != null && tx.priceUsd > 0 && (
          <span className="font-mono text-xs text-ink-muted">
            @ {formatPrice(tx.priceUsd)}
          </span>
        )}
        <span className="font-mono text-xs text-ink-faint">
          · {isoDateInput(tx.occurredAt)}
        </span>
        {voided && (
          <span className="rounded-sm border border-surface-border bg-surface-strong/50 px-1 py-px font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            отменена
          </span>
        )}
      </div>
      {!voided && (
        <>
          {confirming ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200">
              <button
                type="button"
                onClick={() => {
                  onVoid(tx.id);
                  setConfirming(false);
                }}
                className="font-mono uppercase tracking-[0.18em] hover:text-rose-100"
              >
                отменить?
              </button>
              <span className="text-ink-faint">·</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="font-mono uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
              >
                нет
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md p-1 text-ink-faint hover:bg-rose-500/10 hover:text-rose-300"
              title="Soft-delete (отменить операцию)"
            >
              <Trash2 size={12} />
            </button>
          )}
        </>
      )}
    </li>
  );
}
