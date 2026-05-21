"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { searchTickers, type TickerSearchRow } from "@/lib/search-tickers";
import type { StockHolding } from "@/store/portfolioStore";

type Suggestion = TickerSearchRow & { fromPortfolio?: boolean; qty?: number };

export function SymbolTradeCombobox({
  value,
  onChange,
  portfolioStocks,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  portfolioStocks: StockHolding[];
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<TickerSearchRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = `${id ?? "trade-symbol"}-listbox`;

  const portfolioSuggestions = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return [] as Suggestion[];
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const s of portfolioStocks) {
      if (!s.symbol.toUpperCase().includes(q) && !(s.name ?? "").toUpperCase().includes(q)) continue;
      const sym = s.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      out.push({
        symbol: sym,
        company_name: s.name ?? null,
        fromPortfolio: true,
        qty: s.quantity,
      });
    }
    out.sort((a, b) => {
      const ap = a.symbol.startsWith(q) ? 0 : 1;
      const bp = b.symbol.startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.symbol.localeCompare(b.symbol);
    });
    return out;
  }, [portfolioStocks, value]);

  const merged = useMemo(() => {
    const seen = new Set(portfolioSuggestions.map((x) => x.symbol));
    const rest = remote.filter((r) => !seen.has(r.symbol));
    return [...portfolioSuggestions, ...rest] as Suggestion[];
  }, [portfolioSuggestions, remote]);

  const directFallback: Suggestion | null =
    value.trim().length >= 1 && !loading && remote.length === 0 && portfolioSuggestions.length === 0
      ? { symbol: value.trim().toUpperCase(), company_name: "Add directly by symbol" }
      : null;

  const displayList: Suggestion[] = directFallback ? [...merged, directFallback] : merged;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setRemote([]);
      setLoading(false);
      return;
    }
    if (!hasSupabaseConfig()) {
      setRemote([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      try {
        const supabase = createClient();
        const rows = await searchTickers(supabase, q, 18);
        setRemote(rows);
      } catch {
        setRemote([]);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    setHighlight((h) => (displayList.length === 0 ? 0 : Math.min(h, displayList.length - 1)));
  }, [displayList.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = useCallback(
    (sym: string) => {
      onChange(sym);
      setOpen(false);
    },
    [onChange]
  );

  const showList = open && (displayList.length > 0 || loading);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!showList || merged.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % displayList.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + displayList.length) % displayList.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = displayList[highlight];
            if (row) pick(row.symbol);
          }
        }}
        placeholder="Type ticker or name…"
        autoComplete="off"
        spellCheck={false}
        className="min-w-[11rem] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full min-w-[16rem] overflow-auto rounded-lg border border-border bg-elevated py-1 shadow-lg dark:border-white/[0.08]"
        >
          {loading && displayList.length === 0 ? (
            <li className="px-3 py-2 text-xs text-subtle">Searching…</li>
          ) : null}
          {displayList.map((row, i) => (
            <li key={row.symbol + (row.company_name === "Add directly by symbol" ? "__direct" : "")} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-muted/70 dark:bg-white/[0.08]" : "hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(row.symbol)}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="font-mono font-medium text-foreground">
                  {row.symbol}
                  {row.fromPortfolio ? (
                    <span className="ml-2 font-sans text-[10px] font-normal uppercase tracking-wide text-subtle">
                      {row.qty != null && row.qty > 0 ? `qty ${row.qty}` : "watchlist"}
                    </span>
                  ) : null}
                </span>
                {row.company_name ? (
                  <span className={`line-clamp-2 text-xs ${
                    row.company_name === "Add directly by symbol" ? "text-theme-primary" : "text-subtle"
                  }`}>{row.company_name}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
