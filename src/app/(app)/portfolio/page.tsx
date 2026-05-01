"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore, type TradeJournalEntry } from "@/store/portfolioStore";
import { runRefreshPipeline } from "@/lib/refresh";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { PortfolioAllocationChart } from "@/components/portfolio/PortfolioAllocationChart";
import { PortfolioNetWorthChart } from "@/components/portfolio/PortfolioNetWorthChart";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { isValidTicker } from "@/lib/csvPortfolio";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { computeTodayChangeFromLiveQuotes } from "@/lib/portfolio-net-worth-series";

type SortKey = "symbol" | "value" | "pnl";

function recBadgeClass(action: string): string {
  const u = action.toUpperCase();
  if (u === "SELL")
    return "bg-error/15 text-error dark:bg-error/25 dark:text-[color-mix(in_srgb,var(--palette-alice)_88%,white)]";
  if (u === "REDUCE") return "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200";
  if (u.startsWith("WAIT")) return "bg-muted/80 text-subtle dark:bg-white/[0.08]";
  return "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary";
}

function fmtCash(n: number) {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function PortfolioPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const tradeJournal = usePortfolioStore((s) => s.tradeJournal ?? []);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const addStock = usePortfolioStore((s) => s.addStock);
  const recordTrade = usePortfolioStore((s) => s.recordTrade);
  const undoLastTrade = usePortfolioStore((s) => s.undoLastTrade);

  const [sort, setSort] = useState<SortKey>("symbol");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQty, setTradeQty] = useState("1");
  const [tradePrice, setTradePrice] = useState("");
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  /** Portfolio page lists positions only; watchlist-only symbols (0 qty) stay in store for trading elsewhere. */
  const holdings = useMemo(() => stocks.filter((s) => s.quantity > 0), [stocks]);

  const rows = useMemo(() => {
    let r = [...holdings];
    const q = query.trim().toUpperCase();
    if (q) r = r.filter((s) => s.symbol.includes(q));
    r.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      const va = a.quantity * (a.lastPrice ?? 0);
      const vb = b.quantity * (b.lastPrice ?? 0);
      if (sort === "value") return vb - va;
      const pa = (a.lastPrice ?? 0) - a.averageCost;
      const pb = (b.lastPrice ?? 0) - b.averageCost;
      return pb * b.quantity - pa * a.quantity;
    });
    return r;
  }, [holdings, sort, query]);

  const { assetsValue, netWorth, portfolioTodayChange } = useMemo(() => {
    const assets = stocks.reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0);
    const net = assets + cash;
    const portfolioTodayChange = computeTodayChangeFromLiveQuotes(stocks, cash);
    return { assetsValue: assets, netWorth: net, portfolioTodayChange };
  }, [stocks, cash]);

  const journalChronological = useMemo(() => [...tradeJournal].reverse(), [tradeJournal]);
  const lastEntry = tradeJournal.length > 0 ? tradeJournal[tradeJournal.length - 1] : undefined;
  const lastUndoableTradeId = lastEntry?.undoable === false ? null : lastEntry?.id ?? null;
  const historyFromLotsOnly =
    tradeJournal.length > 0 && tradeJournal.every((e) => e.undoable === false);

  async function refresh() {
    if (stocks.length === 0) return;
    setRefreshing(true);
    await runRefreshPipeline(stocks.map((s) => s.symbol));
    recalc();
    usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
    setRefreshing(false);
  }

  function submitTrade(symbol: string) {
    const sym = symbol.toUpperCase();
    const q = parseFloat(tradeQty) || 0;
    if (q <= 0) return;
    const st = stocks.find((s) => s.symbol === sym);
    const last = st?.lastPrice ?? 0;
    const p = parseFloat(tradePrice) || last;
    if (!Number.isFinite(p) || p <= 0) return;
    const date = new Date().toISOString().slice(0, 10);
    if (tradeSide === "BUY" && !st) {
      addStock({ symbol: sym, quantity: 0, averageCost: 0, lastPrice: p });
    }
    recordTrade(sym, tradeSide, q, p, date);
    setTradePrice("");
  }

  function cashDelta(e: TradeJournalEntry) {
    if (e.side === "BUY") return -(e.quantity * e.price);
    return e.quantity * e.price;
  }

  const symU = tradeSymbol.trim().toUpperCase();
  const holdingForTrade = stocks.find((s) => s.symbol === symU);
  const tradeQtyNum = parseFloat(tradeQty) || 0;
  const lastForTrade = holdingForTrade?.lastPrice ?? 0;
  const tradePriceNum = parseFloat(tradePrice) || lastForTrade;
  const tradePriceOk = Number.isFinite(tradePriceNum) && tradePriceNum > 0;
  const canApplyTrade =
    isValidTicker(symU) &&
    tradeQtyNum > 0 &&
    tradePriceOk &&
    (tradeSide === "BUY" || (holdingForTrade != null && holdingForTrade.quantity > 0));
  const applyTradeTitle = !canApplyTrade
    ? !isValidTicker(symU)
      ? "Enter a valid ticker (letters, numbers, optional . or -)."
      : tradeQtyNum <= 0
        ? "Quantity must be greater than zero."
        : !tradePriceOk
          ? "Enter a price, or add the symbol and refresh so a last price exists."
          : tradeSide === "SELL"
            ? "Sell only applies to symbols you hold with quantity greater than zero."
            : undefined
    : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={refreshing || stocks.length === 0}
            onClick={refresh}
            className={appCtaButton("ui-hover-spotlight px-4 py-2 text-sm disabled:opacity-50")}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/csv-help" className="ui-hover-pop rounded-lg border border-primary/30 px-3 py-2 text-sm text-foreground dark:border-primary/25">
            CSV help
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Cash balance</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">${cash.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Assets value</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">${assetsValue.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-subtle">Holdings at last price</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Net worth</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">${netWorth.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-subtle">Cash + assets</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Today (portfolio)</p>
          {portfolioTodayChange.hasBaseline ? (
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                portfolioTodayChange.change > 0
                  ? "text-emerald-600 dark:text-primary"
                  : portfolioTodayChange.change < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground"
              }`}
            >
              {portfolioTodayChange.change >= 0 ? "+" : "−"}$
              {Math.abs(portfolioTodayChange.change).toFixed(2)} ({portfolioTodayChange.percent >= 0 ? "+" : ""}
              {portfolioTodayChange.percent.toFixed(2)}%)
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold tabular-nums text-subtle">—</p>
          )}
          <p className="mt-0.5 text-[11px] text-subtle">Estimated from live quote changes across holdings</p>
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">CSV import / export</h2>
            <p className="mt-1 text-sm text-subtle">
              Matches the Stocks PM mobile export: multi-line lots merge into one position (weighted average), SELL rows are skipped, and full strategy columns are supported.{" "}
              <Link href="/csv-help" className="ui-hover-text text-primary underline-offset-2 hover:underline">
                Column reference
              </Link>
            </p>
          </div>
          <CsvImportExportBar exportFilename="stocks-pm-portfolio.csv" />
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <h2 className="text-lg font-semibold text-foreground">Buy / sell</h2>
        <p className="mt-1 text-sm text-subtle">
          Buys and sells update cash, quantity, average cost, and lots. Buying a symbol you don’t track yet adds it to your watchlist first.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-subtle">
            Symbol
            <SymbolTradeCombobox
              id="portfolio-trade-symbol"
              value={tradeSymbol}
              onChange={setTradeSymbol}
              portfolioStocks={stocks}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-subtle">
            Side
            <select
              value={tradeSide}
              onChange={(e) => setTradeSide(e.target.value as "BUY" | "SELL")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-subtle">
            Qty
            <input
              value={tradeQty}
              onChange={(e) => setTradeQty(e.target.value)}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex min-w-[8rem] flex-col gap-1 text-xs text-subtle">
            Price
            <input
              value={tradePrice}
              onChange={(e) => setTradePrice(e.target.value)}
              placeholder="Last if empty"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={!canApplyTrade}
            title={applyTradeTitle}
            onClick={() => canApplyTrade && submitTrade(symU)}
            className={appCtaButton("ui-hover-spotlight px-4 py-2 text-sm disabled:opacity-50")}
          >
            Apply trade
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filter symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:max-w-xs"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="symbol">Sort: Symbol</option>
          <option value="value">Sort: Value</option>
          <option value="pnl">Sort: P/L</option>
        </select>
      </div>

      <div className="ui-hover-lift overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-subtle">
            <tr>
              <th scope="col" className="px-4 pb-2 pt-3 text-left text-xs font-semibold tracking-wide">
                Symbol
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Qty
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Avg
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Cost basis
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Last
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Current value
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Gain / loss (%)
              </th>
              <th scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                Today %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((s) => {
              const value = s.quantity * (s.lastPrice ?? 0);
              const costBasis = s.quantity * s.averageCost;
              const gainLoss = value - costBasis;
              const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : null;
              const d = s.dailyChangePercent;
              return (
                <tr
                  key={s.symbol}
                  className="transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/stock/${encodeURIComponent(s.symbol)}`}
                        className="ui-hover-text inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                      >
                        {s.symbol}
                      </Link>
                      {s.recommendation ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${recBadgeClass(s.recommendation.action)}`}
                          >
                            {recommendationActionDisplay(s.recommendation.action)}
                          </span>
                          {s.recommendation.comments ? (
                            <span className="truncate text-xs text-subtle" title={s.recommendation.comments}>
                              {s.recommendation.comments}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">${s.averageCost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">${costBasis.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">${(s.lastPrice ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">${value.toFixed(2)}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      gainLoss > 0
                        ? "text-emerald-700 dark:text-primary"
                        : gainLoss < 0
                          ? "text-red-700 dark:text-red-400"
                          : "text-subtle"
                    }`}
                  >
                    {`${gainLoss >= 0 ? "+" : "−"}$${Math.abs(gainLoss).toFixed(2)}`}
                    {gainLossPct != null ? ` (${gainLossPct >= 0 ? "+" : ""}${gainLossPct.toFixed(2)}%)` : ""}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      d == null ? "text-subtle" : d > 0 ? "text-emerald-700 dark:text-primary" : d < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"
                    }`}
                  >
                    {d != null && Number.isFinite(d) ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-subtle">
            {holdings.length === 0
              ? "You don’t have any holdings yet. Buy a stock above to open a position."
              : "No holdings match your search."}
          </p>
        )}
      </div>

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Transaction history</h2>
          <button
            type="button"
            disabled={!lastUndoableTradeId}
            onClick={() => setUndoConfirmOpen(true)}
            className="ui-hover-pop rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-40"
          >
            Undo last trade
          </button>
        </div>
        <p className="mt-1 text-xs text-subtle">
          Undo only reverses the most recent trade so your totals stay consistent.
          {historyFromLotsOnly ? " Rows synced from the app are shown from tax lots; record a new trade here to enable undo." : null}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  Time
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Symbol
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Side
                </th>
                <th scope="col" className="px-3 py-2 text-right tabular-nums">
                  Qty
                </th>
                <th scope="col" className="px-3 py-2 text-right tabular-nums">
                  Price
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Trade date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-mono tabular-nums normal-case">
                  Cash Δ
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {journalChronological.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-subtle">
                    No trades yet.
                  </td>
                </tr>
              ) : (
                journalChronological.map((e) => (
                  <tr
                    key={e.id}
                    className="transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2.5 text-subtle">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{e.symbol}</td>
                    <td className="px-3 py-2.5">{e.side}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{e.quantity}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">${e.price.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-subtle">{e.tradeDate}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{fmtCash(cashDelta(e))}</td>
                    <td className="px-3 py-2.5 text-right">
                      {e.id === lastUndoableTradeId && (
                        <button type="button" className="ui-hover-text text-xs text-primary hover:underline" onClick={() => setUndoConfirmOpen(true)}>
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-foreground">Net worth over time</h2>
        <p className="mt-1 text-sm text-subtle">
          Total portfolio value (holdings at last price + cash). When you’re signed in, saved daily totals may appear; otherwise the chart is built from your trade history.
        </p>
        <div className="mt-4">
          <PortfolioNetWorthChart stocks={stocks} cash={cash} tradeJournal={tradeJournal} />
        </div>
      </section>

      <ConfirmModal
        open={undoConfirmOpen}
        onClose={() => setUndoConfirmOpen(false)}
        onConfirm={() => undoLastTrade()}
        title="Undo last trade?"
        description="The most recent buy or sell will be reversed so cash, quantities, and averages match the prior state."
        confirmLabel="Undo trade"
        cancelLabel="Cancel"
        variant="danger"
      />

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-foreground">Portfolio allocation</h2>
        <p className="mt-1 text-sm text-subtle">
          Market value by position and cash (largest slices first). Smaller positions may be grouped as Other.
        </p>
        <div className="mt-4">
          <PortfolioAllocationChart stocks={stocks} cash={cash} />
        </div>
      </section>
    </div>
  );
}
