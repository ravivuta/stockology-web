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
  const [flowChartOpen, setFlowChartOpen] = useState(false);

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
    <>
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
            onClick={() => setFlowChartOpen(true)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"
          >
            <Info className="h-3.5 w-3.5 text-subtle" />
            Recommendation Flow
          </button>
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
    <AppModal
      open={flowChartOpen}
      onClose={() => setFlowChartOpen(false)}
      size="xl"
      panelClassName="h-[94vh] max-w-[min(98vw,1320px)]"
      shellClassName="sm:p-2"
      titleId="strategy-flowchart-modal-title"
    >
      <ModalSection className="border-b border-border bg-elevated px-4 py-3 sm:px-5 sm:py-3.5 dark:border-foreground/10">
        <h3 id="strategy-flowchart-modal-title" className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Recommendation Flow
        </h3>
        <p className="mt-1 text-xs text-subtle sm:text-sm">Full strategy flowchart in a large view for easier readability.</p>
      </ModalSection>
      <ModalSection className="min-h-0 flex-1 space-y-2 px-3 py-3 sm:px-5 sm:py-4">
        <RecommendationFlowSvgDiagram />
      </ModalSection>
    </AppModal>
    </>
  );
}

function RecommendationFlowSvgDiagram() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2 dark:border-white/[0.08]">
      <div className="h-[70vh] overflow-auto rounded-md border border-border/50 bg-background/30 p-1.5 sm:h-[74vh] sm:p-2 dark:border-white/[0.08]">
      <svg viewBox="0 0 740 1020" className="mx-auto h-auto w-full max-w-[980px]">
        <defs>
          <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
          </marker>
        </defs>

        <rect x="220" y="12" width="260" height="42" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="232" y="30" fontSize="11" fill="currentColor" fontWeight="600">A. Start</text>
        <text x="232" y="44" fontSize="10" fill="#94a3b8">Live price + latest data loaded</text>
        <line x1="350" y1="54" x2="350" y2="82" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <polygon points="350,86 410,112 350,138 290,112" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="350" y="110" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">B. Excluded or suppressed?</text>
        <line x1="294" y1="112" x2="150" y2="140" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="210" y="118" fontSize="9" fill="#94a3b8">Yes</text>
        <line x1="350" y1="138" x2="350" y2="162" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="358" y="154" fontSize="9" fill="#94a3b8">No</text>

        <rect x="48" y="142" width="204" height="44" rx="8" fill="rgba(239,68,68,0.12)" stroke="#f87171" />
        <text x="60" y="160" fontSize="11" fill="#f87171" fontWeight="700">WAIT</text>
        <text x="60" y="174" fontSize="10" fill="currentColor">No action due to your override</text>

        <polygon points="350,166 410,192 350,218 290,192" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="350" y="196" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">C. Enough price history?</text>
        <line x1="294" y1="192" x2="150" y2="220" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="212" y="198" fontSize="9" fill="#94a3b8">No</text>
        <line x1="350" y1="218" x2="350" y2="244" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="358" y="236" fontSize="9" fill="#94a3b8">Yes</text>

        <rect x="48" y="222" width="204" height="44" rx="8" fill="rgba(239,68,68,0.12)" stroke="#f87171" />
        <text x="60" y="240" fontSize="11" fill="#f87171" fontWeight="700">WAIT</text>
        <text x="60" y="254" fontSize="10" fill="currentColor">Need more historical data</text>

        <rect x="200" y="248" width="300" height="52" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="212" y="268" fontSize="11" fill="currentColor" fontWeight="600">D. Compute key levels</text>
        <text x="212" y="282" fontSize="10" fill="#94a3b8">SMA, next buy, selected target, upside %</text>
        <line x1="350" y1="300" x2="350" y2="326" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <polygon points="350,330 410,356 350,382 290,356" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="350" y="360" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">E. Holding shares now?</text>

        <line x1="294" y1="356" x2="210" y2="384" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="246" y="352" fontSize="9" fill="#94a3b8">No</text>
        <line x1="406" y1="356" x2="490" y2="384" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="430" y="352" fontSize="9" fill="#94a3b8">Yes</text>

        <polygon points="210,388 270,414 210,440 150,414" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="210" y="412" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">F. Price ≤ SMA + entry gates?</text>
        <line x1="154" y1="414" x2="112" y2="444" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="134" y="422" fontSize="9" fill="#94a3b8">Yes</text>
        <line x1="266" y1="414" x2="310" y2="444" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="270" y="422" fontSize="9" fill="#94a3b8">No</text>

        <rect x="34" y="448" width="156" height="44" rx="8" fill="rgba(16,185,129,0.16)" stroke="#10b981" />
        <text x="46" y="466" fontSize="11" fill="#10b981" fontWeight="700">BUY</text>
        <text x="46" y="480" fontSize="10" fill="currentColor">Entry gates passed</text>
        <rect x="232" y="448" width="156" height="44" rx="8" fill="rgba(239,68,68,0.12)" stroke="#f87171" />
        <text x="244" y="466" fontSize="11" fill="#f87171" fontWeight="700">WAIT_BUY</text>
        <text x="244" y="480" fontSize="10" fill="currentColor">Entry conditions pending</text>

        <polygon points="490,388 550,414 490,440 430,414" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="490" y="412" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">I. RSI sell / target-hit sell?</text>
        <line x1="434" y1="414" x2="410" y2="444" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="422" y="422" fontSize="9" fill="#94a3b8">Yes</text>
        <line x1="546" y1="414" x2="570" y2="444" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="548" y="422" fontSize="9" fill="#94a3b8">No</text>

        <rect x="330" y="448" width="160" height="44" rx="8" fill="rgba(16,185,129,0.16)" stroke="#10b981" />
        <text x="342" y="466" fontSize="11" fill="#10b981" fontWeight="700">SELL / REDUCE</text>
        <text x="342" y="480" fontSize="10" fill="currentColor">Profit-taking condition hit</text>

        <polygon points="570,448 630,474 570,500 510,474" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="570" y="472" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">K. Price ≤ next buy + add gates?</text>
        <line x1="514" y1="474" x2="490" y2="504" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="500" y="482" fontSize="9" fill="#94a3b8">Yes</text>
        <line x1="626" y1="474" x2="650" y2="504" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="626" y="482" fontSize="9" fill="#94a3b8">No</text>

        <rect x="412" y="508" width="156" height="44" rx="8" fill="rgba(16,185,129,0.16)" stroke="#10b981" />
        <text x="424" y="526" fontSize="11" fill="#10b981" fontWeight="700">ADD</text>
        <text x="424" y="540" fontSize="10" fill="currentColor">Averaging-down entry</text>

        <polygon points="650,508 710,534 650,560 590,534" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" />
        <text x="650" y="532" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">M. Oversize + trim gates pass?</text>
        <line x1="594" y1="534" x2="560" y2="564" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="576" y="542" fontSize="9" fill="#94a3b8">Yes</text>
        <line x1="706" y1="534" x2="710" y2="564" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <text x="704" y="542" fontSize="9" fill="#94a3b8">No</text>

        <rect x="482" y="568" width="156" height="44" rx="8" fill="rgba(16,185,129,0.16)" stroke="#10b981" />
        <text x="494" y="586" fontSize="11" fill="#10b981" fontWeight="700">REDUCE</text>
        <text x="494" y="600" fontSize="10" fill="currentColor">Trim oversized holding</text>
        <rect x="620" y="568" width="112" height="58" rx="8" fill="rgba(239,68,68,0.12)" stroke="#f87171" />
        <text x="632" y="586" fontSize="10" fill="#f87171" fontWeight="700">WAIT_ADD</text>
        <text x="632" y="599" fontSize="10" fill="#f87171" fontWeight="700">/ WAIT_REDUCE</text>
        <text x="632" y="612" fontSize="9" fill="currentColor">Holding, conditions pending</text>

        <line x1="112" y1="492" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="310" y1="492" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="410" y1="492" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="490" y1="552" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="560" y1="612" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />
        <line x1="676" y1="626" x2="350" y2="666" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="190" y="670" width="320" height="50" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="202" y="690" fontSize="11" fill="currentColor" fontWeight="600">P. Apply shortlist / risk rules</text>
        <text x="202" y="705" fontSize="10" fill="#94a3b8">Post-process BUY/WAIT/ADD/SELL actions against portfolio shortlist gates</text>
        <line x1="350" y1="720" x2="350" y2="746" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="190" y="750" width="320" height="50" rx="8" fill="rgba(148,163,184,0.10)" stroke="#94a3b8" />
        <text x="202" y="770" fontSize="11" fill="currentColor" fontWeight="600">Q. Apply market outlook cash-raise rules</text>
        <text x="202" y="785" fontSize="10" fill="#94a3b8">Escalate to SELL/REDUCE when cash is below the target floor</text>
        <line x1="350" y1="800" x2="350" y2="826" stroke="#94a3b8" markerEnd="url(#arrowHead)" />

        <rect x="190" y="830" width="320" height="50" rx="8" fill="rgba(59,130,246,0.12)" stroke="#60a5fa" />
        <text x="202" y="850" fontSize="11" fill="currentColor" fontWeight="600">R. Final recommendation shown in app</text>
        <text x="202" y="865" fontSize="10" fill="#94a3b8">Action + comments + color-coded decision factors in Recommendation tab</text>
      </svg>
      </div>
      <div className="mt-1 rounded-md border border-border/70 bg-background/30 px-2 py-1 dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold text-foreground sm:text-xs">Full decision tree (base logic + overlays)</p>
        <p className="text-[10px] text-subtle sm:text-[11px]">Shows every branch from suppression/history checks through shortlist and market-outlook post-processing.</p>
      </div>
    </div>
  );
}
