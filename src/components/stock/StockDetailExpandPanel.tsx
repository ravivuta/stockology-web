"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Settings, X } from "lucide-react";
import { computeRecommendationFactors, scoreBreakdownRows } from "@/lib/ios-recommendation";
import { usePortfolioStore, type TradeJournalEntry } from "@/store/portfolioStore";
import { useSupabaseStockHistory } from "@/hooks/useSupabaseStockHistory";
import { lastSma } from "@/lib/stock-chart";
import { APP_CTA_FILL, appCtaButton } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";
import { StockHistoricalChart } from "./StockHistoricalChart";
import { StockStrategyModal } from "./StockStrategyModal";

function fmtJournalCash(e: TradeJournalEntry) {
  if (e.side === "BUY") return -(e.quantity * e.price);
  return e.quantity * e.price;
}

/** Human-readable score (avoid long float noise). */
function formatScoreDisplay(score: number | undefined | null): string {
  if (score == null || !Number.isFinite(score)) return "—";
  const a = Math.abs(score);
  if (a >= 1000) return score.toFixed(0);
  if (a >= 100) return score.toFixed(1);
  if (a >= 10) return score.toFixed(1);
  return score.toFixed(2);
}

type Props = {
  symbol: string;
  embedded?: boolean;
  onClose?: () => void;
  showBackLink?: boolean;
};

function StatTile({
  label,
  value,
  className,
  valueClassName,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-background/70 dark:border-white/[0.08] dark:bg-white/[0.04]",
        compact ? "px-2.5 py-2" : "rounded-xl px-4 py-3.5",
        className
      )}
    >
      <p
        className={cn(
          "font-semibold uppercase tracking-[0.12em] text-subtle",
          compact ? "text-[9px] tracking-[0.1em]" : "text-[11px]"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-semibold tabular-nums tracking-tight text-foreground",
          compact ? "mt-1 text-sm" : "mt-1.5 text-lg",
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  compact,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "border border-border/80 bg-elevated shadow-sm dark:border-white/[0.08]",
        compact ? "rounded-xl p-3" : "rounded-2xl p-5"
      )}
    >
      <div className={cn("border-b border-border/60 dark:border-white/[0.06]", compact ? "pb-2" : "pb-3")}>
        <h3 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{title}</h3>
        {description ? (
          <p className={cn("mt-1 text-subtle", compact ? "line-clamp-2 text-xs leading-snug" : "text-sm leading-relaxed")}>
            {description}
          </p>
        ) : null}
      </div>
      <div className={compact ? "pt-3" : "pt-4"}>{children}</div>
    </section>
  );
}

export function StockDetailExpandPanel({ symbol, embedded, onClose, showBackLink }: Props) {
  const stocks = usePortfolioStore((s) => s.stocks);
  const recordTrade = usePortfolioStore((s) => s.recordTrade);
  const updateStock = usePortfolioStore((s) => s.updateStock);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const tradeJournal = usePortfolioStore((s) => s.tradeJournal ?? []);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);

  const stock = useMemo(() => stocks.find((s) => s.symbol === symbol), [stocks, symbol]);
  const { points, loading: histLoading, error: histError } = useSupabaseStockHistory(stock ? symbol : null);

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"recommendation" | "chart" | "snapshot">("recommendation");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const smaFromHistory = useMemo(() => {
    if (!points || !stock) return null;
    const p = Math.min(stock.shortSMA, points.length);
    return lastSma(points, p);
  }, [points, stock]);

  const smaForSnapshot =
    stock != null && stock.movingAvg != null && Number.isFinite(stock.movingAvg) && stock.movingAvg > 0
      ? stock.movingAvg
      : smaFromHistory;

  const symbolJournal = useMemo(
    () => [...tradeJournal].filter((e) => e.symbol === symbol).reverse(),
    [tradeJournal, symbol]
  );

  const lots = lotsBySymbol[symbol];
  const closes = useMemo(
    () => (points ?? []).map((point) => point.close).filter((value) => Number.isFinite(value)),
    [points]
  );
  const rec = stock?.recommendation;
  const recommendationFactors = useMemo(() => {
    if (!stock || !rec) return [];
    return computeRecommendationFactors(stock, rec, {
      useRSIGating: useRSIGatingForRecommendations,
      sellOnlyLongTermQualified,
      closes,
    });
  }, [closes, rec, sellOnlyLongTermQualified, stock, useRSIGatingForRecommendations]);
  const scoreRows = useMemo(() => (stock ? scoreBreakdownRows(stock) : null), [stock]);

  if (!stock) {
    return (
      <div className={`border-border bg-muted/30 px-4 py-6 text-sm text-subtle ${embedded ? "border-t" : ""}`}>
        {showBackLink && (
          <Link href="/portfolio" className="mb-2 inline-block text-primary hover:underline">
            ← Portfolio
          </Link>
        )}
        <p>No data for {symbol}. Add it from Portfolio or import.</p>
      </div>
    );
  }

  const last = stock.lastPrice ?? 0;
  const tradePrice = price ? parseFloat(price) : last;
  const hasPosition = stock.quantity > 0;
  const costBasis = stock.quantity * stock.averageCost;
  const positionValue = stock.quantity * last;
  const unrealized = positionValue - costBasis;
  const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : 0;

  function applyTrade() {
    const q = parseFloat(qty) || 0;
    if (q <= 0 || !Number.isFinite(tradePrice) || tradePrice <= 0) return;
    recordTrade(symbol, side, q, tradePrice, new Date().toISOString().slice(0, 10));
    setPrice("");
  }

  const detailTabOrder = ["recommendation", "chart", "snapshot"] as const;
  const dense = Boolean(embedded);

  return (
    <div
      className={cn(
        "border-border bg-muted/20 text-foreground",
        embedded ? "border-t" : "rounded-2xl border ui-hover-lift"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex flex-col border-b border-border/80 sm:flex-row sm:items-start sm:justify-between dark:border-white/[0.08]",
          dense ? "gap-2 px-3 py-2.5 sm:gap-3" : "gap-4 px-5 py-4"
        )}
      >
        <div className="min-w-0 flex-1">
          {showBackLink && (
            <Link
              href="/portfolio"
              className={cn("mb-2 inline-block font-medium text-primary hover:underline", dense ? "text-xs" : "text-sm")}
            >
              ← Portfolio
            </Link>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:gap-x-3 sm:gap-y-1">
            <h2 className={cn("font-bold tracking-tight", dense ? "text-xl" : "text-2xl")}>{stock.symbol}</h2>
            {stock.name ? (
              <span
                className={cn("max-w-full truncate text-foreground/75", dense ? "max-w-[min(100%,14rem)] text-xs" : "text-base")}
                title={stock.name}
              >
                {stock.name}
              </span>
            ) : null}
          </div>
          <div className={cn("mt-1.5 flex flex-wrap items-baseline gap-2 sm:mt-2 sm:gap-3", dense && "mt-1")}>
            <span className={cn("font-semibold tabular-nums tracking-tight", dense ? "text-2xl" : "text-3xl")}>
              ${last.toFixed(2)}
            </span>
            {stock.dailyChangePercent != null && (
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  dense ? "text-sm" : "text-base",
                  stock.dailyChangePercent >= 0 ? "text-primary" : "text-error"
                )}
              >
                {stock.dailyChangePercent >= 0 ? "+" : ""}
                {stock.dailyChangePercent.toFixed(2)}% today
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setStrategyOpen(true)}
            className={cn(
              "ui-hover-pop inline-flex items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground shadow-sm dark:border-white/10 dark:bg-white/5 sm:gap-2 sm:rounded-xl",
              dense ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
            )}
            aria-label="Strategy parameters"
          >
            <Settings className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
            Parameters
          </button>
          {embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className={cn("rounded-lg text-subtle hover:bg-border/40 hover:text-foreground sm:rounded-xl", dense ? "p-1.5" : "p-2.5")}
              aria-label="Collapse"
            >
              <X className={dense ? "h-4 w-4" : "h-5 w-5"} />
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          dense ? "space-y-3 px-3 py-3" : "max-h-[min(72vh,920px)] space-y-5 overflow-y-auto px-5 py-5"
        )}
      >
        {/* At-a-glance: position or watch-only */}
        {hasPosition ? (
          <div>
            <p
              className={cn(
                "font-semibold uppercase tracking-[0.14em] text-subtle",
                dense ? "mb-2 text-[10px]" : "mb-3 text-xs"
              )}
            >
              Position
            </p>
            <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5", dense ? "gap-2" : "gap-3")}>
              <StatTile compact={dense} label="Quantity" value={stock.quantity} />
              <StatTile compact={dense} label="Avg cost" value={`$${stock.averageCost.toFixed(2)}`} />
              <StatTile compact={dense} label="Last" value={`$${last.toFixed(2)}`} />
              <StatTile compact={dense} label="Market value" value={`$${positionValue.toFixed(2)}`} />
              <StatTile
                compact={dense}
                label="Unrealized P/L"
                value={`$${unrealized.toFixed(2)} (${unrealizedPct >= 0 ? "+" : ""}${unrealizedPct.toFixed(1)}%)`}
                valueClassName={unrealized >= 0 ? "text-primary" : "text-error"}
              />
            </div>
          </div>
        ) : (
          <div>
            <p
              className={cn(
                "font-semibold uppercase tracking-[0.14em] text-subtle",
                dense ? "mb-2 text-[10px]" : "mb-3 text-xs"
              )}
            >
              Quote
            </p>
            <div className={cn("grid grid-cols-2 sm:grid-cols-4", dense ? "gap-2" : "gap-3")}>
              <StatTile compact={dense} label="Last price" value={`$${last.toFixed(2)}`} />
              <StatTile
                compact={dense}
                label="Day change"
                value={
                  stock.dailyChangePercent != null
                    ? `${stock.dailyChangePercent >= 0 ? "+" : ""}${stock.dailyChangePercent.toFixed(2)}%`
                    : "—"
                }
                valueClassName={
                  stock.dailyChangePercent == null
                    ? undefined
                    : stock.dailyChangePercent >= 0
                      ? "text-primary"
                      : "text-error"
                }
              />
              <StatTile
                compact={dense}
                label="Analyst target"
                value={stock.analystTarget != null ? `$${stock.analystTarget.toFixed(2)}` : "—"}
              />
              <StatTile
                compact={dense}
                label="Consensus"
                value={stock.analystAvg?.trim() || "—"}
                valueClassName={dense ? "text-sm font-medium" : "text-base font-medium"}
              />
            </div>
          </div>
        )}

        <section
          className={cn(
            "overflow-hidden border border-border/80 bg-elevated shadow-sm dark:border-white/[0.08]",
            dense ? "rounded-xl" : "rounded-2xl"
          )}
          aria-label="Stock detail sections"
        >
          <div
            className={cn(
              "flex flex-wrap gap-1 border-b border-border/60 dark:border-white/[0.06]",
              dense ? "p-1.5" : "p-2"
            )}
            role="tablist"
            aria-label="Detail views"
          >
            {(
              [
                { id: "recommendation" as const, label: "Recommendation" },
                { id: "chart" as const, label: "Chart" },
                { id: "snapshot" as const, label: "Snapshot" },
              ] as const
            ).map((t) => {
              const selected = detailTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`stock-detail-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`stock-detail-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setDetailTab(t.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const i = detailTabOrder.indexOf(t.id);
                    const next =
                      e.key === "ArrowRight"
                        ? detailTabOrder[(i + 1) % detailTabOrder.length]
                        : detailTabOrder[(i - 1 + detailTabOrder.length) % detailTabOrder.length];
                    setDetailTab(next);
                    requestAnimationFrame(() => document.getElementById(`stock-detail-tab-${next}`)?.focus());
                  }}
                  className={cn(
                    "flex-1 rounded-lg text-center font-semibold transition-colors sm:flex-none",
                    dense ? "min-h-8 px-2 py-1.5 text-xs sm:px-3" : "min-h-10 rounded-xl px-3 py-2 text-sm sm:px-5",
                    selected
                      ? cn(APP_CTA_FILL, "shadow-sm")
                      : "text-subtle hover:bg-background/80 hover:text-foreground dark:hover:bg-white/[0.06]"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className={dense ? "p-3" : "p-5"}>
            {detailTab === "recommendation" && (
              <div
                id="stock-detail-panel-recommendation"
                role="tabpanel"
                aria-labelledby="stock-detail-tab-recommendation"
                className={dense ? "space-y-2" : "space-y-4"}
              >
                <p className={cn("leading-relaxed text-subtle", dense ? "text-xs" : "text-sm")}>
                  Rules-based signal from your holdings, limits, and moving averages—the same logic as the Stocks PM mobile app.
                </p>
                {rec ? (
                  <div className={dense ? "space-y-3" : "space-y-5"}>
                    <p
                      className={cn(
                        "inline-flex rounded-lg border border-primary/25 bg-primary/10 font-bold tracking-tight text-primary",
                        dense ? "px-2.5 py-1 text-sm" : "px-3 py-1.5 text-lg"
                      )}
                    >
                      {rec.action}
                    </p>
                    <p className={cn("leading-relaxed text-foreground/90", dense ? "text-sm" : "text-base")}>{rec.comments}</p>

                    <div className={cn("grid sm:grid-cols-2 lg:grid-cols-3", dense ? "gap-2" : "gap-3")}>
                      <RecMetric compact={dense} label="Next buy near" value={`$${rec.nextBuyPrice.toFixed(2)}`} />
                      <RecMetric compact={dense} label={`MA (${stock.shortSMA})`} value={`$${rec.movingAvg.toFixed(2)}`} />
                      <RecMetric
                        compact={dense}
                        label="Expected return"
                        value={`${rec.expectedReturnPct >= 0 ? "+" : ""}${rec.expectedReturnPct.toFixed(1)}%`}
                      />
                      {stock.score != null && (
                        <RecMetric
                          compact={dense}
                          label="Score"
                          value={formatScoreDisplay(stock.score)}
                          hint="Risk–return composite"
                        />
                      )}
                      {stock.aiSentimentScore != null && (
                        <RecMetric
                          compact={dense}
                          label="AI sentiment"
                          value={String(stock.aiSentimentScore)}
                          hint="Scaled headline sentiment"
                        />
                      )}
                    </div>

                    <div className={cn("grid items-start xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]", dense ? "gap-3" : "gap-4")}>
                      <div
                        className={cn(
                          "rounded-xl border border-border/70 bg-background/45 dark:border-white/[0.07] dark:bg-white/[0.03]",
                          dense ? "p-3" : "p-4"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Why this signal</p>
                            <p className={cn("text-subtle", dense ? "mt-0.5 text-[11px]" : "mt-1 text-xs")}>
                              Rules checked for the current recommendation, with pass/fail flags.
                            </p>
                          </div>
                          <span className={cn("font-medium text-subtle", dense ? "text-[10px]" : "text-xs")}>
                            {recommendationFactors.filter((factor) => factor.passes).length}/{recommendationFactors.length} passed
                          </span>
                        </div>
                        <div className={dense ? "mt-3 space-y-2" : "mt-4 space-y-2.5"}>
                          {recommendationFactors.map((factor) => (
                            <FactorFlagRow
                              key={`${factor.label}-${factor.detail}`}
                              compact={dense}
                              label={factor.label}
                              detail={factor.detail}
                              passes={factor.passes}
                            />
                          ))}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "rounded-xl border border-border/70 bg-background/45 dark:border-white/[0.07] dark:bg-white/[0.03]",
                          dense ? "p-3" : "p-4"
                        )}
                      >
                        <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Score inputs</p>
                        <p className={cn("text-subtle", dense ? "mt-0.5 text-[11px]" : "mt-1 text-xs")}>
                          Components used for the iOS-aligned risk-return score.
                        </p>
                        {scoreRows ? (
                          <div className={dense ? "mt-3 space-y-2" : "mt-4 space-y-2.5"}>
                            <SnapshotRow compact={dense} label="Analyst rating" value={scoreRows.analystLine} hint={scoreRows.analystPoints} />
                            <SnapshotRow compact={dense} label="Upside to target" value={scoreRows.upsideLine} hint={scoreRows.upsidePoints} />
                            <SnapshotRow compact={dense} label="Market cap" value={scoreRows.capLine} hint={scoreRows.capPoints} />
                            <SnapshotRow compact={dense} label="PEG ratio" value={scoreRows.pegLine} hint={scoreRows.pegPoints} />
                            {stock.score != null ? (
                              <SnapshotRow
                                compact={dense}
                                label="Composite score"
                                value={formatScoreDisplay(stock.score)}
                                hint="Final rules score used by recommendation gating"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className={cn("text-subtle", dense ? "text-sm" : "text-base")}>
                    No recommendation yet — refresh quotes from Portfolio or Dashboard.
                  </p>
                )}
              </div>
            )}

            {detailTab === "chart" && (
              <div
                id="stock-detail-panel-chart"
                role="tabpanel"
                aria-labelledby="stock-detail-tab-chart"
                className={dense ? "space-y-2" : "space-y-4"}
              >
                <p className={cn("leading-relaxed text-subtle", dense ? "text-xs" : "text-sm")}>
                  Choose a range (1w–5y). The dashed line is your average cost when you hold a position.
                </p>
                <StockHistoricalChart
                  symbol={stock.symbol}
                  smaPeriod={stock.shortSMA}
                  averageCost={hasPosition && stock.averageCost > 0 ? stock.averageCost : null}
                  points={points}
                  loading={histLoading}
                  error={histError}
                  compact={dense}
                />
              </div>
            )}

            {detailTab === "snapshot" && (
              <div
                id="stock-detail-panel-snapshot"
                role="tabpanel"
                aria-labelledby="stock-detail-tab-snapshot"
                className={dense ? "space-y-2" : "space-y-4"}
              >
                <p className={cn("leading-relaxed text-subtle", dense ? "text-xs" : "text-sm")}>
                  Fundamentals and moving average from your latest quotes. If you also use the mobile app, numbers stay in step after a refresh.
                </p>
                <ul className={cn("grid grid-cols-1 sm:grid-cols-2", dense ? "gap-x-4 gap-y-2" : "gap-x-8 gap-y-4")}>
                  <SnapshotRow compact={dense} label="Beta" value={stock.beta != null ? stock.beta.toFixed(2) : "—"} />
                  <SnapshotRow
                    compact={dense}
                    label="Market cap"
                    value={stock.marketCap != null ? `$${(stock.marketCap / 1_000_000_000).toFixed(1)}B` : "—"}
                  />
                  <SnapshotRow compact={dense} label="PEG ratio" value={stock.peg != null ? stock.peg.toFixed(2) : "—"} />
                  <SnapshotRow compact={dense} label="Analyst avg" value={stock.analystAvg?.trim() || "—"} />
                  <SnapshotRow
                    compact={dense}
                    label="Analyst target"
                    value={stock.analystTarget != null ? `$${stock.analystTarget.toFixed(2)}` : "—"}
                  />
                  <SnapshotRow
                    compact={dense}
                    label={`SMA(${stock.shortSMA})`}
                    value={smaForSnapshot != null ? `$${smaForSnapshot.toFixed(2)}` : "—"}
                    hint={
                      stock.movingAvg != null && Number.isFinite(stock.movingAvg)
                        ? "Saved moving average from your last refresh"
                        : "Estimated from recent daily closes in the chart range"
                    }
                  />
                  <SnapshotRow compact={dense} label="ETF" value={stock.isETF ? "Yes" : "No"} />
                </ul>
              </div>
            )}
          </div>
        </section>

        <SectionCard
          compact={dense}
          title="Record a trade"
          description="Enter a buy or sell to update cash, shares, average cost, and lots—same as the quick trade on the Portfolio page."
        >
          <div className={cn("flex flex-wrap items-end", dense ? "gap-2" : "gap-3")}>
            <label className={cn("flex flex-col font-medium text-foreground", dense ? "gap-1 text-xs" : "gap-1.5 text-sm")}>
              Side
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}
                className={cn(
                  "rounded-lg border border-border bg-background text-foreground dark:border-white/10",
                  dense ? "px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                )}
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </label>
            <label className={cn("flex flex-col font-medium text-foreground", dense ? "gap-1 text-xs" : "gap-1.5 text-sm")}>
              Quantity
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Qty"
                className={cn(
                  "w-20 border border-border bg-background tabular-nums text-foreground dark:border-white/10 sm:w-24",
                  dense ? "rounded-lg px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                )}
              />
            </label>
            <label
              className={cn(
                "flex min-w-[8rem] flex-1 flex-col font-medium text-foreground sm:min-w-[10rem]",
                dense ? "gap-1 text-xs" : "gap-1.5 text-sm"
              )}
            >
              Price (optional)
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`Default ${last.toFixed(2)}`}
                className={cn(
                  "border border-border bg-background tabular-nums text-foreground dark:border-white/10",
                  dense ? "rounded-lg px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                )}
              />
            </label>
            <button
              type="button"
              onClick={applyTrade}
              className={cn(
                appCtaButton("ui-hover-spotlight"),
                dense ? "rounded-lg px-3 py-1.5 text-xs" : "rounded-xl px-5 py-2.5 text-sm"
              )}
            >
              Apply trade
            </button>
          </div>
        </SectionCard>

        {(symbolJournal.length > 0 || (lots && (lots.open.length > 0 || lots.sold.length > 0))) && (
          <SectionCard
            compact={dense}
            title="Activity"
            description="Open tax lots and recent trades for this symbol."
          >
            {lots && lots.open.length > 0 && (
              <div>
                <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Open lots</p>
                <ul className={cn("mt-2 space-y-2", dense ? "text-xs" : "text-sm")}>
                  {lots.open.map((lot) => (
                    <li
                      key={lot.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.06] sm:px-3 sm:py-2"
                    >
                      <span className="tabular-nums text-foreground">
                        {lot.quantity} @ ${lot.costBasis.toFixed(2)}
                      </span>
                      <span className={cn("text-subtle", dense ? "text-[11px]" : "text-sm")}>{lot.purchaseDate}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {symbolJournal.length > 0 && (
              <div className={lots && lots.open.length > 0 ? (dense ? "mt-3" : "mt-6") : ""}>
                <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>
                  Recent trades ({symbol})
                </p>
                <ul
                  className={cn(
                    "mt-2 space-y-2 overflow-y-auto",
                    dense ? "max-h-36 text-xs" : "max-h-56 text-sm"
                  )}
                >
                  {symbolJournal.map((e) => (
                    <li
                      key={e.id}
                      className={cn(
                        "rounded-lg border border-border/60 bg-background/30 dark:border-white/[0.06]",
                        dense ? "px-2.5 py-1.5" : "px-3 py-2.5"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium tabular-nums text-foreground">
                          {e.side} {e.quantity} @ ${e.price.toFixed(2)}
                        </span>
                        <span className={cn("text-subtle", dense ? "text-[11px]" : "text-sm")}>{e.tradeDate}</span>
                      </div>
                      <p className={cn("mt-0.5 font-mono text-subtle", dense ? "text-[10px]" : "mt-1 text-xs")}>
                        Cash Δ ${fmtJournalCash(e).toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        )}
      </div>

      <StockStrategyModal
        open={strategyOpen}
        onClose={() => setStrategyOpen(false)}
        stock={stock}
        etfProfitTarget={etfProfitTarget}
        stockProfitTarget={stockProfitTarget}
        onSave={(patch) => updateStock(symbol, patch)}
      />
    </div>
  );
}

function RecMetric({ label, value, hint, compact }: { label: string; value: string; hint?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "border border-border/70 bg-background/50 dark:border-white/[0.07] dark:bg-white/[0.03]",
        compact ? "rounded-lg px-2.5 py-2" : "rounded-xl px-4 py-3"
      )}
    >
      <p className={cn("font-semibold uppercase tracking-wide text-subtle", compact ? "text-[10px]" : "text-xs")}>
        {label}
      </p>
      <p className={cn("font-semibold tabular-nums text-foreground", compact ? "mt-0.5 text-sm" : "mt-1 text-lg")}>
        {value}
      </p>
      {hint ? (
        <p className={cn("leading-snug text-subtle", compact ? "mt-0.5 text-[10px]" : "mt-1 text-xs")}>{hint}</p>
      ) : null}
    </div>
  );
}

function FactorFlagRow({
  label,
  detail,
  passes,
  compact,
}: {
  label: string;
  detail: string;
  passes: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border",
        passes
          ? "border-emerald-500/25 bg-emerald-500/10"
          : "border-amber-500/25 bg-amber-500/10",
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>{label}</p>
        <p className={cn("leading-snug text-subtle", compact ? "mt-0.5 text-[10px]" : "mt-1 text-xs")}>{detail}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-1 font-semibold uppercase tracking-[0.12em]",
          passes ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          compact ? "text-[9px]" : "text-[10px]"
        )}
      >
        {passes ? "Pass" : "Blocked"}
      </span>
    </div>
  );
}

function SnapshotRow({ label, value, hint, compact }: { label: string; value: string; hint?: string; compact?: boolean }) {
  return (
    <li
      className={cn(
        "border-b border-border/40 last:border-0 dark:border-white/[0.05]",
        compact ? "pb-2 last:pb-0" : "pb-3 last:pb-0"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn("font-medium text-foreground/80", compact ? "text-xs" : "text-sm")}>{label}</span>
        <span
          className={cn(
            "text-right font-semibold tabular-nums text-foreground",
            compact ? "text-sm" : "text-base"
          )}
        >
          {value}
        </span>
      </div>
      {hint ? (
        <p className={cn("text-subtle", compact ? "mt-1 text-[10px] leading-snug" : "mt-1.5 text-xs leading-relaxed")}>
          {hint}
        </p>
      ) : null}
    </li>
  );
}
