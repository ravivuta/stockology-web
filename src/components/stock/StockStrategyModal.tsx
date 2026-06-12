"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { formatCurrency } from "@/lib/numberFormat";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import type { StockHolding } from "@/store/portfolioStore";

type Props = {
  open: boolean;
  onClose: () => void;
  stock: StockHolding;
  etfProfitTarget: number;
  stockProfitTarget: number;
  portfolioSize: number;
  limitWatchlistSize: boolean;
  activeStockCount: number;
  onSave: (patch: Partial<StockHolding>) => void;
};

export function StockStrategyModal({ open, onClose, stock, etfProfitTarget, stockProfitTarget, portfolioSize, limitWatchlistSize, activeStockCount, onSave }: Props) {
  const [shortSMA, setShortSMA] = useState(String(stock.shortSMA));
  const [dynamicFactor, setDynamicFactor] = useState(String(stock.dynamicFactor));
  const [stockLimit, setStockLimit] = useState(String(stock.stockLimit));
  const [transactionLimit, setTransactionLimit] = useState(String(stock.transactionLimit));
  const [targetPrice, setTargetPrice] = useState(stock.targetPrice != null ? String(stock.targetPrice) : "");

  useEffect(() => {
    if (!open) return;
    setShortSMA(String(stock.shortSMA));
    setDynamicFactor(String(stock.dynamicFactor));
    setStockLimit(String(stock.stockLimit));
    setTransactionLimit(String(stock.transactionLimit));
    setTargetPrice(stock.targetPrice != null ? String(stock.targetPrice) : "");
  }, [open, stock]);

  const costBasis = stock.quantity * stock.averageCost;
  const maxAccumulation = 2 * stock.stockLimit;

  const sellTarget = (() => {
    if (stock.analystTarget && stock.analystTarget > 0) {
      return { price: stock.analystTarget, source: "Analyst Target (Median)" as const };
    }
    if (stock.quantity > 0) {
      const pt = stock.isETF ? etfProfitTarget : stockProfitTarget;
      const p = stock.averageCost * (1 + pt / 100);
      return { price: p, source: "User profit target %" as const };
    }
    return { price: null as number | null, source: "Not in portfolio" as const };
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sma = Math.max(1, Math.round(parseFloat(shortSMA) || stock.shortSMA));
    const dyn = Math.max(0, parseFloat(dynamicFactor) || stock.dynamicFactor);
    const sl = Math.max(0, parseFloat(stockLimit) || stock.stockLimit);
    const tl = Math.max(0, parseFloat(transactionLimit) || stock.transactionLimit);
    const tp = targetPrice.trim() === "" ? undefined : Math.max(0, parseFloat(targetPrice) || 0);
    onSave({
      shortSMA: sma,
      dynamicFactor: dyn,
      stockLimit: sl,
      transactionLimit: tl,
      targetPrice: tp,
      pendingOptimization: false,
    });
    onClose();
  }

  return (
    <AppModal open={open} onClose={onClose} size="md" titleId="strategy-modal-title">
      <ModalSection className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
        <h2 id="strategy-modal-title" className="text-lg font-semibold text-foreground">
          Strategy parameters · {stock.symbol}
        </h2>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-subtle hover:bg-border/60 hover:text-foreground" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </ModalSection>

      <ModalSection className="min-h-0 shrink-0 space-y-4 px-4 py-4 text-sm text-subtle">
        <p className="leading-relaxed">
          Entry uses an SMA trend filter; adds trigger near your dynamic factor below average cost. Limits cap position and trade size. Use Optimize on the stock details screen
          to run the same web-side parameter search against cached historical data.
        </p>

        <div className="rounded-xl border border-border bg-background/60 p-3 text-xs leading-relaxed dark:border-foreground/10 dark:bg-yale/20">
          <p>
            <span className="font-medium text-foreground">Accumulation:</span> up to about 2× stock limit to average down.
          </p>
          <p className="mt-2">
            <span className="font-medium text-foreground">Current cost basis:</span> {formatCurrency(costBasis)} ·{" "}
            <span className="font-medium text-foreground">Max accumulation:</span> {formatCurrency(maxAccumulation)}
          </p>
          <p className="mt-2">
            <span className="font-medium text-foreground">Sell target:</span>{" "}
            {sellTarget.price != null ? formatCurrency(sellTarget.price) : "—"}{" "}
            <span className="text-subtle">({sellTarget.source})</span>
          </p>
        </div>
      </ModalSection>

      <ModalSection className="flex min-h-0 flex-1 flex-col border-t border-border/60 dark:border-white/[0.06]">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="space-y-3 px-4 py-4 text-sm text-subtle">
            <label className="block">
              <span className="text-xs font-medium text-foreground">Short SMA (days)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={shortSMA}
                onChange={(e) => setShortSMA(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-foreground">Dynamic factor (% below avg cost)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={dynamicFactor}
                onChange={(e) => setDynamicFactor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                Stock limit ($)
                <span className="group relative inline-flex items-center">
                  <Info className="h-3.5 w-3.5 cursor-help text-subtle" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg border border-border bg-elevated px-3 py-2.5 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    <span className="block font-semibold text-foreground mb-1.5">How Stock Limit is calculated</span>
                    <span className="flex flex-col gap-1">
                      <span className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 font-mono font-bold text-subtle">1.</span>
                        <span>
                          <span className="font-medium">Base = Portfolio ÷ Watchlist size</span><br />
                          <span className="text-subtle">
                            {formatCurrency(portfolioSize)} ÷{" "}
                            {limitWatchlistSize
                              ? <>recommended <strong>{Math.max(7, Math.min(75, Math.round(7 + ((Math.max(10000, Math.min(1000000, portfolioSize)) - 10000) / 990000) * 68)))}</strong> (setting ON)</>
                              : <>actual active <strong>{activeStockCount}</strong> stocks (setting OFF)</>}
                            {" "} = <strong>{formatCurrency(portfolioSize / (limitWatchlistSize ? Math.max(7, Math.min(75, Math.round(7 + ((Math.max(10000, Math.min(1000000, portfolioSize)) - 10000) / 990000) * 68))) : Math.max(activeStockCount, 1)))}</strong>
                          </span>
                        </span>
                      </span>
                      <span className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 font-mono font-bold text-subtle">2.</span>
                        <span>
                          <span className="font-medium">× Risk multiplier</span><br />
                          <span className="text-subtle">
                            {stock.isETF
                              ? <>ETF → <strong>10×</strong></>
                              : <><strong>1×</strong> (standard)</>}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-start gap-1.5 border-t border-border/60 pt-1 mt-0.5">
                        <span className="mt-0.5 shrink-0 font-mono font-bold text-subtle">=</span>
                        <span><span className="font-medium">Stock Limit: </span><strong>{formatCurrency(stock.stockLimit)}</strong></span>
                      </span>
                    </span>
                  </span>
                </span>
              </span>
              <input
                type="number"
                min={0}
                step={100}
                value={stockLimit}
                onChange={(e) => setStockLimit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-foreground">Transaction limit ($)</span>
              <input
                type="number"
                min={0}
                step={100}
                value={transactionLimit}
                onChange={(e) => setTransactionLimit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-foreground">Target price (optional)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Override analyst / default"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" className={appCtaButton("ui-hover-spotlight px-4 py-2 text-sm")}>
                Save
              </button>
              <button type="button" onClick={onClose} className="ui-hover-pop rounded-lg border border-border px-4 py-2 text-sm text-foreground">
                Cancel
              </button>
            </div>
          </div>
        </form>
        <p className="shrink-0 border-t border-border px-4 py-3 text-[11px] text-subtle dark:border-foreground/10">
          RSI thresholds are now global and managed from Settings under the RSI gate toggle.
        </p>
      </ModalSection>
    </AppModal>
  );
}
