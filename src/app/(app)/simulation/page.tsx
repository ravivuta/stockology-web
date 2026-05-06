"use client";

import { useMemo, useState } from "react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { formatCurrency } from "@/lib/numberFormat";
import { usePortfolioStore } from "@/store/portfolioStore";

type SingleSimulationResponse = {
  ok?: boolean;
  error?: string;
  result?: {
    totalTrades: number;
    buySignals: number;
    sellSignals: number;
    totalReturn: number;
    winRate: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
};

type WatchlistSimulationResponse = {
  ok?: boolean;
  error?: string;
  universe?: {
    totalTracked: number;
    totalSimulated: number;
    idealWatchlistSize: number;
    riskAppetite: string;
    enableRiskFilter: boolean;
    limitWatchlistSize: boolean;
    simulatedSymbols: string[];
    skippedSymbols?: {
      insufficientHistory?: string[];
      unavailableHistory?: string[];
    };
    gating?: {
      considered?: string[];
      bypassed?: string[];
    };
  };
  result?: {
    finalPortfolioValue: number;
    totalReturn: number;
    totalTrades: number;
    avgWinRate: number;
    realizedGainPct: number;
    unrealizedGainPct: number;
    stockContributions: Array<{
      symbol: string;
      profit: number;
      contributionPct: number;
      trades: number;
      winRate: number;
    }>;
  };
};

function metricTone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-foreground";
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function SimulationPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [capital, setCapital] = useState("10000");
  const [years, setYears] = useState("1");
  const [result, setResult] = useState<SingleSimulationResponse | null>(null);
  const [watchlistResult, setWatchlistResult] = useState<WatchlistSimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const stocks = usePortfolioStore((s) => s.stocks);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const watchlistTrackedCount = stocks.length;
  const trackedStock = useMemo(
    () => stocks.find((stock) => stock.symbol === symbol.trim().toUpperCase()),
    [stocks, symbol]
  );

  async function run() {
    setLoading(true);
    setResult(null);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${basePath}/api/python/simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          capital: parseFloat(capital) || 0,
          years: parseInt(years, 10) || 1,
          shortSMA: trackedStock?.shortSMA,
          dynamicFactor: trackedStock?.dynamicFactor,
          stockLimit: trackedStock?.stockLimit,
          transactionLimit: trackedStock?.transactionLimit,
          analystTarget: trackedStock?.analystTarget,
          analystAvg: trackedStock?.analystAvg,
          marketCap: trackedStock?.marketCap,
          peg: trackedStock?.peg,
          isETF: trackedStock?.isETF,
          rsiPeriod: trackedStock?.rsiPeriod,
          rsiOversoldThreshold: trackedStock?.rsiOversoldThreshold,
          rsiOverboughtThreshold: trackedStock?.rsiOverboughtThreshold,
          rsiHysteresisPoints: trackedStock?.rsiHysteresisPoints,
          rsiMinRisingDays: trackedStock?.rsiMinRisingDays,
          etfProfitTargetPercent: etfProfitTarget,
          stockProfitTargetPercent: stockProfitTarget,
          useRSIGating: useRSIGatingForRecommendations,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function runWatchlist() {
    setWatchlistLoading(true);
    setWatchlistResult(null);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${basePath}/api/python/watchlist-simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          years: parseInt(years, 10) || 1,
          portfolioSize,
          riskAppetite,
          enableRiskFilter,
          limitWatchlistSize,
          etfProfitTargetPercent: etfProfitTarget,
          stockProfitTargetPercent: stockProfitTarget,
          useRSIGating: useRSIGatingForRecommendations,
          stocks,
        }),
      });
      const data = await res.json();
      setWatchlistResult(data);
    } catch (e) {
      setWatchlistResult({ ok: false, error: String(e) });
    } finally {
      setWatchlistLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Simulation</h1>
      <p className="text-sm text-subtle">The single-symbol backtest already matched iOS simulation rules. This page now also includes the missing iOS-style watchlist simulation path with risk and shortlist filtering.</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="ui-hover-lift space-y-4 rounded-2xl border border-border bg-elevated p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Single Symbol</h2>
            <p className="text-sm text-subtle">Uses the tracked stock&apos;s saved SMA, limits, and RSI settings. Score, AI, wash-sale, and long-term sell-only gates are intentionally relaxed to match iOS simulation.</p>
          </div>
          <label className="block text-sm font-medium text-foreground">
            Symbol
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Starting capital
            <input value={capital} onChange={(e) => setCapital(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Years
            <select value={years} onChange={(e) => setYears(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">
              <option value="1">1 year</option>
              <option value="2">2 years</option>
              <option value="3">3 years</option>
              <option value="4">4 years</option>
              <option value="5">5 years</option>
            </select>
          </label>
          {trackedStock ? (
            <p className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-xs text-subtle">
              Using saved strategy for {trackedStock.symbol}: SMA {trackedStock.shortSMA}, dynamic {trackedStock.dynamicFactor}%, stock limit {formatCurrency(trackedStock.stockLimit)}, transaction limit {formatCurrency(trackedStock.transactionLimit)}.
            </p>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={run}
            className={appCtaButton("ui-hover-spotlight w-full rounded-xl py-3 font-medium disabled:opacity-50")}
          >
            {loading ? "Running…" : "Run symbol simulation"}
          </button>
          {result ? (
            result.ok && result.result ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-subtle">Return</div>
                  <div className={`mt-1 text-xl font-semibold ${metricTone(result.result.totalReturn)}`}>{formatPct(result.result.totalReturn)}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-subtle">Trades</div>
                  <div className="mt-1 text-xl font-semibold text-foreground">{result.result.totalTrades}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/50 p-3 text-sm text-subtle">
                  Buys {result.result.buySignals} • Sells {result.result.sellSignals}
                </div>
                <div className="rounded-xl border border-border/70 bg-background/50 p-3 text-sm text-subtle">
                  Win rate {formatPct(result.result.winRate)} • Max drawdown {formatPct(result.result.maxDrawdown)}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{result.error ?? "Simulation failed"}</div>
            )
          ) : null}
        </div>

        <div id="watchlist-simulation" className="ui-hover-lift space-y-4 rounded-2xl border border-border bg-elevated p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Watchlist Simulation</h2>
              <p className="text-sm text-subtle">Mirrors the iOS portfolio/watchlist simulation path with shared cash, risk filtering, recommended-watchlist limiting, and the same relaxed recommendation gates used during mobile backtests.</p>
            </div>
            <button
              type="button"
              disabled={watchlistLoading || watchlistTrackedCount === 0}
              onClick={runWatchlist}
              className={appCtaButton("ui-hover-spotlight rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50")}
            >
              {watchlistLoading ? "Running…" : "Run watchlist simulation"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/50 p-3 text-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-subtle">Universe</div>
              <div className="mt-1 font-medium text-foreground">{watchlistTrackedCount} tracked symbols</div>
              <div className="mt-1 text-subtle">Portfolio size {formatCurrency(portfolioSize)}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/50 p-3 text-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-subtle">Filters</div>
              <div className="mt-1 font-medium text-foreground">{riskAppetite} risk</div>
              <div className="mt-1 text-subtle">
                Risk filter {enableRiskFilter ? "on" : "off"} • Watchlist limit {limitWatchlistSize ? "on" : "off"}
              </div>
            </div>
          </div>

          {watchlistResult ? (
            watchlistResult.ok && watchlistResult.result && watchlistResult.universe ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Return</div>
                    <div className={`mt-1 text-xl font-semibold ${metricTone(watchlistResult.result.totalReturn)}`}>{formatPct(watchlistResult.result.totalReturn)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Final Value</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(watchlistResult.result.finalPortfolioValue)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Trades</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{watchlistResult.result.totalTrades}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Avg Win Rate</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{formatPct(watchlistResult.result.avgWinRate)}</div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Simulation Universe</div>
                    <div className="mt-2 text-sm text-foreground">
                      {watchlistResult.universe.totalSimulated} of {watchlistResult.universe.totalTracked} tracked names simulated. Ideal watchlist size {watchlistResult.universe.idealWatchlistSize}.
                    </div>
                    <div className="mt-3 text-sm text-subtle">{watchlistResult.universe.simulatedSymbols.join(", ")}</div>
                    {(watchlistResult.universe.skippedSymbols?.insufficientHistory?.length ?? 0) > 0 ? (
                      <div className="mt-3 text-sm text-amber-300">
                        Skipped for insufficient history: {watchlistResult.universe.skippedSymbols?.insufficientHistory?.join(", ")}
                      </div>
                    ) : null}
                    {(watchlistResult.universe.skippedSymbols?.unavailableHistory?.length ?? 0) > 0 ? (
                      <div className="mt-2 text-sm text-rose-300">
                        Missing history fetch: {watchlistResult.universe.skippedSymbols?.unavailableHistory?.join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Gating</div>
                    <div className="mt-2 text-sm text-foreground">Considered</div>
                    <div className="mt-1 text-sm text-subtle">{watchlistResult.universe.gating?.considered?.join(" • ")}</div>
                    <div className="mt-3 text-sm text-foreground">Bypassed</div>
                    <div className="mt-1 text-sm text-subtle">{watchlistResult.universe.gating?.bypassed?.join(" • ")}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-subtle">Top Contributions</div>
                    <div className="text-sm text-subtle">
                      Realized {formatPct(watchlistResult.result.realizedGainPct)} • Unrealized {formatPct(watchlistResult.result.unrealizedGainPct)}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {watchlistResult.result.stockContributions.slice(0, 8).map((stock) => (
                      <div key={stock.symbol} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <div className="font-medium text-foreground">{stock.symbol}</div>
                        <div className={`min-w-20 text-right font-medium ${metricTone(stock.profit)}`}>{formatCurrency(stock.profit)}</div>
                        <div className="min-w-20 text-right text-subtle">{formatPct(stock.contributionPct)}</div>
                        <div className="min-w-20 text-right text-subtle">{stock.trades} trades</div>
                        <div className="min-w-20 text-right text-subtle">{formatPct(stock.winRate)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{watchlistResult.error ?? "Watchlist simulation failed"}</div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
