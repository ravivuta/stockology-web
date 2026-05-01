"use client";

import { useMemo, useState } from "react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { formatCurrency } from "@/lib/numberFormat";
import { usePortfolioStore } from "@/store/portfolioStore";

export default function SimulationPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [capital, setCapital] = useState("10000");
  const [years, setYears] = useState("1");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stocks = usePortfolioStore((s) => s.stocks);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
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
          enableRSIReversalGate: trackedStock?.enableRSIReversalGate,
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
      setResult(data.message ?? JSON.stringify(data));
    } catch (e) {
      setResult(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Simulation</h1>
      <p className="text-sm text-subtle">
        Backtests the iOS-style strategy on saved historical prices. Tracked symbols reuse your saved SMA, limits, and RSI settings automatically.
      </p>
      <div className="ui-hover-lift space-y-4 rounded-2xl border border-border bg-elevated p-6">
        <label className="block text-sm font-medium text-foreground">
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Starting capital
          <input value={capital} onChange={(e) => setCapital(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Years
          <select value={years} onChange={(e) => setYears(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2">
            <option value="1">1 year</option>
            <option value="2">2 years</option>
            <option value="3">3 years</option>
            <option value="4">4 years</option>
          </select>
        </label>
        {trackedStock ? (
          <p className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-xs text-subtle">
            Using saved strategy for {trackedStock.symbol}: SMA {trackedStock.shortSMA}, dynamic {trackedStock.dynamicFactor}%, stock limit{" "}
            {formatCurrency(trackedStock.stockLimit)}, transaction limit {formatCurrency(trackedStock.transactionLimit)}.
          </p>
        ) : null}
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className={appCtaButton("ui-hover-spotlight w-full rounded-xl py-3 font-medium disabled:opacity-50")}
        >
          {loading ? "Running…" : "Run simulation"}
        </button>
        {result && <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs text-subtle">{result}</pre>}
      </div>
    </div>
  );
}
