"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { analystTargetSourceLabel, selectedAnalystTarget } from "@/lib/ios-recommendation";
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
  const [showRecommendationFlow, setShowRecommendationFlow] = useState(false);

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
    const selectedTarget = selectedAnalystTarget(stock);
    if (selectedTarget.value && selectedTarget.value > 0) {
      return { price: selectedTarget.value, source: analystTargetSourceLabel(selectedTarget.tier) };
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

  const score = stock.score;
  const addBasisSentence =
    score != null && score < 85
      ? `Adds for this stock use the average holding price because the score is ${Math.round(score)}, below 85.`
      : score != null
        ? `Adds for this stock use the moving average because the score is ${Math.round(score)}.`
        : "Adds use the moving average until this stock has a score below 85.";

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
          Entry uses an SMA trend filter. {addBasisSentence} Limits cap position and trade size. Use Optimize on the stock details screen
          to run the same web-side parameter search against cached historical data.
        </p>
        <div className="rounded-xl border border-border/70 bg-background/50 p-3 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setShowRecommendationFlow((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"
          >
            <Info className="h-3.5 w-3.5 text-subtle" />
            Recommendation Flow
          </button>
          {showRecommendationFlow ? (
            <div className="mt-2">
              <RecommendationFlowSvgDiagram />
            </div>
          ) : null}
        </div>

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

function RecommendationFlowSvgDiagram() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2 dark:border-white/[0.08]">
      <svg viewBox="0 0 340 360" className="h-auto w-full">
        <defs>
          <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
          </marker>
        </defs>

        <rect x="40" y="10" width="260" height="40" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="52" y="27" fontSize="11" fill="currentColor" fontWeight="600">Start</text>
        <text x="52" y="41" fontSize="10" fill="#94a3b8">Live price + latest history/settings</text>

        <line x1="170" y1="50" x2="170" y2="66" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="40" y="70" width="260" height="42" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="52" y="88" fontSize="11" fill="currentColor" fontWeight="600">Compute levels</text>
        <text x="52" y="102" fontSize="10" fill="#94a3b8">SMA, next-buy trigger, selected analyst target</text>

        <line x1="170" y1="112" x2="170" y2="124" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <polygon points="170,128 230,154 170,180 110,154" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="170" y="158" textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="600">Has position?</text>

        <line x1="170" y1="180" x2="170" y2="194" stroke="#94a3b8" />
        <line x1="170" y1="194" x2="90" y2="194" stroke="#94a3b8" />
        <line x1="170" y1="194" x2="250" y2="194" stroke="#94a3b8" />
        <line x1="90" y1="194" x2="90" y2="204" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="250" y1="194" x2="250" y2="204" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="20" y="208" width="140" height="42" rx="6" fill="rgba(16,185,129,0.14)" stroke="#10b981" />
        <text x="30" y="224" fontSize="10" fill="#10b981" fontWeight="700">YES</text>
        <text x="30" y="238" fontSize="10" fill="currentColor">ADD / REDUCE / SELL / WAIT</text>

        <rect x="180" y="208" width="140" height="42" rx="6" fill="rgba(148,163,184,0.08)" stroke="#94a3b8" />
        <text x="190" y="224" fontSize="10" fill="#94a3b8" fontWeight="700">NO</text>
        <text x="190" y="238" fontSize="10" fill="currentColor">BUY / WAIT_BUY</text>

        <line x1="90" y1="250" x2="170" y2="264" stroke="#94a3b8" />
        <line x1="250" y1="250" x2="170" y2="264" stroke="#94a3b8" />
        <line x1="170" y1="264" x2="170" y2="278" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="40" y="282" width="260" height="36" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="52" y="299" fontSize="11" fill="currentColor" fontWeight="600">Safety gates</text>
        <text x="52" y="312" fontSize="10" fill="#94a3b8">RSI, AI sentiment, wash sale, long-term tax</text>

        <line x1="170" y1="318" x2="170" y2="332" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
      </svg>
      <div className="mt-1 rounded-md border border-border/70 bg-background/30 px-2 py-1 dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold text-foreground">Portfolio overlays → Final recommendation</p>
        <p className="text-[10px] text-subtle">Shortlist/risk + market-outlook cash rules, then Action + Comments + Factors.</p>
      </div>
    </div>
  );
}
