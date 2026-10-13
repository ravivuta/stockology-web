"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { StockHolding } from "@/store/portfolioStore";
import { usePortfolioStore } from "@/store/portfolioStore";
import { isBuyOrSellAction } from "@/lib/recommendation";
import { fetchLatestMarketOutlook } from "@/lib/market-outlook";
import { createClient } from "@/lib/supabase/client";
import { fixedIncomeTotal } from "@/lib/fixed-income-accounts";

const MAX_VISIBLE = 4;

function pickActions(stocks: StockHolding[]) {
  const held = stocks.filter((s) => s.quantity > 0 && isBuyOrSellAction(s.recommendation?.action));
  const watch = stocks.filter((s) => s.quantity === 0 && isBuyOrSellAction(s.recommendation?.action));
  const list = held.length > 0 ? held : watch;
  const source: "holdings" | "watchlist" = held.length > 0 ? "holdings" : "watchlist";
  return {
    items: [...list].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    source,
  };
}

function ActionBadge({ action }: { action: string }) {
  const u = action.toUpperCase();
  const sell = u === "SELL";
  const reduce = u === "REDUCE";
  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        sell
          ? "bg-red-600/12 text-red-700 dark:bg-red-400/18 dark:text-red-200"
          : reduce
            ? "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200"
            : "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary"
      }`}
    >
      {u}
    </span>
  );
}

function ActionRow({ stock, dimmed }: { stock: StockHolding; dimmed?: boolean }) {
  const rec = stock.recommendation!;
  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.symbol)}`}
      className={`ui-hover-surface flex w-full items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-left shadow-sm dark:bg-white/5 ${
        dimmed ? "pointer-events-none" : ""
      }`}
    >
      <ActionBadge action={rec.action} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground">{stock.symbol}</div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-subtle">{rec.comments}</p>
      </div>
    </Link>
  );
}

export function RecommendedActionsWidget({ stocks }: { stocks: StockHolding[] }) {
  const reduceMotion = useReducedMotion();
  const { items, source } = useMemo(() => pickActions(stocks), [stocks]);
  const destination = source === "holdings" ? "/portfolio" : "/watchlist";
  const outlookEnabled = usePortfolioStore((s) => s.useMarketRegimeCashTilt);
  const outlook = usePortfolioStore((s) => s.marketOutlook);
  const cashBalance = usePortfolioStore((s) => s.cashBalance);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const [outlookOpen, setOutlookOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestMarketOutlook(createClient()).then((next) => {
      if (cancelled || !next) return;
      const state = usePortfolioStore.getState();
      usePortfolioStore.setState({ marketOutlook: next });
      if (state.useMarketRegimeCashTilt) {
        state.setSettings({ useMarketRegimeCashTilt: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasOverflow = items.length > MAX_VISIBLE;
  const visible = hasOverflow ? items.slice(0, MAX_VISIBLE) : items;

  return (
    <motion.section
      className="dashboard-panel p-5 text-foreground sm:p-6"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.08 }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">Recommended Actions</h2>
          {outlookEnabled && outlook && !outlook.stale ? (
            <button
              type="button"
              onClick={() => setOutlookOpen((open) => !open)}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                outlook.preferCash
                  ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                  : "border-primary/40 text-primary"
              }`}
              aria-expanded={outlookOpen}
            >
              Outlook
            </button>
          ) : null}
        </div>
        {items.length > 0 ? (
          <Link href={destination} className="ui-hover-text text-xs font-semibold text-primary">
            See all
          </Link>
        ) : null}
      </div>

      {outlookOpen && outlook ? (
        <div className="mb-4 rounded-xl border border-border bg-background/60 px-3 py-3 text-sm dark:bg-white/5">
          <p className="font-semibold text-foreground">{outlook.label}</p>
          <p className={`mt-0.5 text-xs font-semibold ${outlook.preferCash ? "text-amber-700 dark:text-amber-300" : "text-subtle"}`}>
            {outlook.backdrop}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-subtle">{outlook.explanation}</p>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            {(() => {
              const cashEquivalent = cashBalance + fixedIncomeTotal(fixedIncomeByAccount);
              const cashShare = portfolioSize > 0 ? (cashEquivalent / portfolioSize) * 100 : 0;
              const belowTarget = cashShare + 0.5 < outlook.cashTargetPct;
              return belowTarget
                ? `Cash-equivalent target: ${Math.round(outlook.cashTargetPct)}%. You currently have ${Math.round(cashShare)}% (cash + fixed income). New buys may pause until this is rebuilt.`
                : `Cash-equivalent target: ${Math.round(outlook.cashTargetPct)}%. You currently have ${Math.round(cashShare)}% (cash + fixed income).`;
            })()}
          </p>
          {outlook.influences.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-foreground">What is influencing this outlook</p>
              <ul className="mt-1 space-y-1">
                {outlook.influences.map((line) => (
                  <li key={line} className="text-xs leading-snug text-subtle">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 text-[10px] text-subtle">
            Outlook computed {new Date(outlook.computedAt).toLocaleString()} · Source: OpenAI
          </p>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/50 px-3 py-3 dark:bg-white/5">
          <span className="text-base leading-none text-primary" aria-hidden>
            ✓
          </span>
          <p className="text-sm text-subtle">No actions needed — all stocks are in WAIT status</p>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2">
            {visible.map((s) => (
              <li key={s.symbol}>
                <ActionRow stock={s} />
              </li>
            ))}
          </ul>

          {hasOverflow ? (
            <Link
              href={destination}
              className="ui-hover-text block pt-1 text-center text-xs font-medium text-subtle"
            >
              +{items.length - MAX_VISIBLE} more
            </Link>
          ) : null}
        </div>
      )}
    </motion.section>
  );
}
