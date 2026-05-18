"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { prettySymbol } from "@/lib/portfolio/format";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const QUICK_PICKS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "ATOMUSDT",
  "LTCUSDT",
];

export function AssetSelector({ value, onChange, disabled }: Props) {
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const symbol = normalizeSymbol(raw);
    if (!symbol) return;
    if (value.includes(symbol)) return;
    onChange([...value, symbol]);
    setInput("");
  };

  const remove = (symbol: string) => {
    onChange(value.filter((s) => s !== symbol));
  };

  const availableQuickPicks = QUICK_PICKS.filter((s) => !value.includes(s));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-medium text-[var(--rex-text)]"
          >
            {prettySymbol(s)}
            <button
              type="button"
              onClick={() => remove(s)}
              disabled={disabled}
              className="rounded-full p-0.5 text-[var(--rex-muted)] transition hover:bg-white/[0.08] hover:text-[var(--rex-text)] disabled:opacity-40"
              aria-label={`Удалить ${s}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}

        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            add(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            disabled={disabled}
            placeholder="BTC или BTCUSDT"
            className="w-44 rounded-md border border-surface-border bg-white/[0.03] px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus:border-brand/50 focus:outline-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-white/[0.04] px-2.5 py-1 text-sm text-ink transition hover:border-brand/50 hover:text-ink disabled:opacity-40"
          >
            <Plus size={14} />
            Добавить
          </button>
        </form>
      </div>

      {availableQuickPicks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-[var(--rex-muted)]">
            Быстрый выбор:
          </span>
          {availableQuickPicks.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              disabled={disabled}
              className="rounded-full border border-surface-border bg-white/[0.02] px-2.5 py-0.5 text-xs text-ink-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-40"
            >
              {prettySymbol(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeSymbol(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 2 || cleaned.length > 20) return null;
  if (
    cleaned.endsWith("USDT") ||
    cleaned.endsWith("USDC") ||
    cleaned.endsWith("BUSD")
  ) {
    return cleaned;
  }
  return `${cleaned}USDT`;
}
