"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Settings, X } from "lucide-react";
import {
  computeRecommendationFactors,
  getOldestOpenLotDate,
  getWashSaleInfo,
  isUnknownPurchaseDate,
  scoreBreakdownRows,
} from "@/lib/ios-recommendation";
import { formatCompactCurrency, formatCurrency, formatDecimal, formatNumberMax2, formatPercent, formatSignedCurrency } from "@/lib/numberFormat";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSupabaseStockHistory } from "@/hooks/useSupabaseStockHistory";
import { lastSma } from "@/lib/stock-chart";
import { appCtaButton } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";
import { StockHistoricalChart } from "./StockHistoricalChart";
import { StockStrategyModal } from "./StockStrategyModal";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateLabel(value: string | undefined): string {
  if (!value) return "Unknown";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function lotHoldingStatus(purchaseDate: string | undefined): {
  label: string;
  className: string;
} {
  const ms = purchaseDate ? Date.parse(purchaseDate) : Number.NaN;
  const parsed = Number.isFinite(ms) ? new Date(ms) : null;
  if (parsed == null || isUnknownPurchaseDate(parsed)) {
    return {
      label: "Unknown term",
      className: "bg-muted/80 text-subtle dark:bg-white/[0.08]",
    };
  }

  if (Date.now() - parsed.getTime() > 365 * DAY_MS) {
    return {
      label: "Long-term",
      className: "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200",
    };
  }

  return {
    label: "Short-term",
    className: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
  };
}

function lotStatusTone(status: string): string {
  if (status === "washSaleRestricted") return "bg-red-500/15 text-red-700 dark:bg-red-400/20 dark:text-red-200";
  if (status === "partiallySold") return "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200";
  return "bg-muted/80 text-subtle dark:bg-white/[0.08]";
}

function formatLotStatus(status: string): string {
  if (status === "partiallySold") return "Partially sold";
  if (status === "fullySold") return "Fully sold";
  if (status === "washSaleRestricted") return "Wash sale";
  return "Open";
}

function formatAccountType(isRetirementAccount: boolean | null | undefined): string {
  if (isRetirementAccount === true) return "Retirement";
  if (isRetirementAccount === false) return "Taxable";
  return "Unknown type";
}

/** Human-readable score (avoid long float noise). */
function formatScoreDisplay(score: number | undefined | null): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return formatDecimal(score);
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
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);

  const stock = useMemo(() => stocks.find((s) => s.symbol === symbol), [stocks, symbol]);
  const { points, loading: histLoading, error: histError } = useSupabaseStockHistory(stock ? symbol : null);

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [tradeAccountName, setTradeAccountName] = useState("");
  const [tradeAccountType, setTradeAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");

  const smaFromHistory = useMemo(() => {
    if (!points || !stock) return null;
    const p = Math.min(stock.shortSMA, points.length);
    return lastSma(points, p);
  }, [points, stock]);

  const smaForSnapshot =
    stock != null && stock.movingAvg != null && Number.isFinite(stock.movingAvg) && stock.movingAvg > 0
      ? stock.movingAvg
      : smaFromHistory;

  const lots = lotsBySymbol[symbol];
  const closes = useMemo(
    () => (points ?? []).map((point) => point.close).filter((value) => Number.isFinite(value)),
    [points]
  );
  const lotSummary = useMemo(() => {
    const openLots = [...(lots?.open ?? [])].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
    const soldLots = [...(lots?.sold ?? [])].sort((a, b) => b.saleDate.localeCompare(a.saleDate));
    if (!stock) {
      return {
        openLots,
        soldLots,
        washSale: null,
        oldestOpenLotDate: null,
        oldestOpenLotQualified: false,
        openCostBasis: openLots.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0),
        realizedGainLoss: soldLots.reduce((sum, lot) => sum + lot.realizedGainLoss, 0),
      };
    }

    const stockWithLots = {
      ...stock,
      openLots: openLots.map((lot) => ({
        purchaseDate: lot.purchaseDate,
        quantity: lot.quantity,
        costBasis: lot.costBasis,
        status: lot.status,
      })),
      soldLots: soldLots.map((lot) => ({
        saleDate: lot.saleDate,
        quantity: lot.quantity,
        salePrice: lot.salePrice,
        realizedGainLoss: lot.realizedGainLoss,
      })),
    };
    const washSale = getWashSaleInfo(stockWithLots);
    const oldestOpenLotDate = getOldestOpenLotDate(stockWithLots);
    const oldestOpenLotQualified =
      oldestOpenLotDate != null &&
      !isUnknownPurchaseDate(oldestOpenLotDate) &&
      Date.now() - oldestOpenLotDate.getTime() > 365 * DAY_MS;

    return {
      openLots,
      soldLots,
      washSale,
      oldestOpenLotDate,
      oldestOpenLotQualified,
      openCostBasis: openLots.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0),
      realizedGainLoss: soldLots.reduce((sum, lot) => sum + lot.realizedGainLoss, 0),
    };
  }, [lots, stock]);
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
    recordTrade(symbol, side, q, tradePrice, new Date().toISOString().slice(0, 10), {
      account: tradeAccountName.trim() || undefined,
      isRetirementAccount:
        tradeAccountType === "unknown" ? null : tradeAccountType === "retirement",
    });
    setPrice("");
  }

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
              {formatCurrency(last)}
            </span>
            {stock.dailyChangePercent != null && (
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  dense ? "text-sm" : "text-base",
                  stock.dailyChangePercent >= 0 ? "text-primary" : "text-error"
                )}
              >
                {formatPercent(stock.dailyChangePercent, true)} today
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
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={cn("rounded-lg text-subtle hover:bg-border/40 hover:text-foreground sm:rounded-xl", dense ? "p-1.5" : "p-2.5")}
              aria-label="Close stock details"
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
              <StatTile compact={dense} label="Quantity" value={formatNumberMax2(stock.quantity)} />
              <StatTile compact={dense} label="Avg cost" value={formatCurrency(stock.averageCost)} />
              <StatTile compact={dense} label="Last" value={formatCurrency(last)} />
              <StatTile compact={dense} label="Market value" value={formatCurrency(positionValue)} />
              <StatTile
                compact={dense}
                label="Unrealized P/L"
                value={`${formatCurrency(unrealized)} (${formatPercent(unrealizedPct, true)})`}
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
              <StatTile compact={dense} label="Last price" value={formatCurrency(last)} />
              <StatTile
                compact={dense}
                label="Day change"
                value={
                  stock.dailyChangePercent != null
                    ? formatPercent(stock.dailyChangePercent, true)
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
                value={stock.analystTarget != null ? formatCurrency(stock.analystTarget) : "—"}
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

        <div className={cn("grid items-start", dense ? "gap-3" : "gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.95fr)]")}>
          <div className={dense ? "space-y-3" : "space-y-5"}>
            <SectionCard
              compact={dense}
              title="Recommendation"
              description="Rules-based signal from your holdings, limits, and moving averages using the same logic as the Stocks PM mobile app."
            >
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

                  <div className={cn("grid sm:grid-cols-2 2xl:grid-cols-3", dense ? "gap-2" : "gap-3")}>
                    <RecMetric compact={dense} label="Next buy near" value={formatCurrency(rec.nextBuyPrice)} />
                    <RecMetric compact={dense} label={`MA (${stock.shortSMA})`} value={formatCurrency(rec.movingAvg)} />
                    <RecMetric compact={dense} label="Expected return" value={formatPercent(rec.expectedReturnPct, true)} />
                    {stock.score != null ? (
                      <RecMetric
                        compact={dense}
                        label="Score"
                        value={formatScoreDisplay(stock.score)}
                        hint="Risk–return composite"
                      />
                    ) : null}
                    {stock.aiSentimentScore != null ? (
                      <RecMetric
                        compact={dense}
                        label="AI sentiment"
                        value={String(stock.aiSentimentScore)}
                        hint="Scaled headline sentiment"
                      />
                    ) : null}
                  </div>

                  <div className={cn("grid items-start", dense ? "gap-3" : "gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]")}>
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
            </SectionCard>

            <SectionCard
              compact={dense}
              title="Price chart"
              description="Choose a range (1w–5y). The dashed line is your average cost when you hold a position."
            >
              <StockHistoricalChart
                symbol={stock.symbol}
                smaPeriod={stock.shortSMA}
                averageCost={hasPosition && stock.averageCost > 0 ? stock.averageCost : null}
                points={points}
                loading={histLoading}
                error={histError}
                compact={dense}
              />
            </SectionCard>
          </div>

          <div className={dense ? "space-y-3" : "space-y-5"}>
            <SectionCard
              compact={dense}
              title="Snapshot"
              description="Fundamentals and moving average from your latest quotes. If you also use the mobile app, numbers stay in step after a refresh."
            >
              <ul className={cn("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1", dense ? "gap-x-4 gap-y-2" : "gap-x-8 gap-y-4")}>
                <SnapshotRow compact={dense} label="Beta" value={stock.beta != null ? formatDecimal(stock.beta) : "—"} />
                <SnapshotRow
                  compact={dense}
                  label="Market cap"
                  value={stock.marketCap != null ? formatCompactCurrency(stock.marketCap) : "—"}
                />
                <SnapshotRow compact={dense} label="PEG ratio" value={stock.peg != null ? formatDecimal(stock.peg) : "—"} />
                <SnapshotRow compact={dense} label="Analyst avg" value={stock.analystAvg?.trim() || "—"} />
                <SnapshotRow
                  compact={dense}
                  label="Analyst target"
                  value={stock.analystTarget != null ? formatCurrency(stock.analystTarget) : "—"}
                />
                <SnapshotRow
                  compact={dense}
                  label={`SMA(${stock.shortSMA})`}
                  value={smaForSnapshot != null ? formatCurrency(smaForSnapshot) : "—"}
                  hint={
                    stock.movingAvg != null && Number.isFinite(stock.movingAvg)
                      ? "Saved moving average from your last refresh"
                      : "Estimated from recent daily closes in the chart range"
                  }
                />
                <SnapshotRow compact={dense} label="ETF" value={stock.isETF ? "Yes" : "No"} />
              </ul>
            </SectionCard>

            <SectionCard
              compact={dense}
              title="Record a trade"
              description="Enter a buy or sell to update cash, shares, average cost, and lots for this symbol."
            >
              <div className={cn("grid", dense ? "gap-2" : "gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2")}>
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
                      "border border-border bg-background tabular-nums text-foreground dark:border-white/10",
                      dense ? "rounded-lg px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                    )}
                  />
                </label>
                <label className={cn("flex flex-col font-medium text-foreground", dense ? "gap-1 text-xs" : "gap-1.5 text-sm")}>
                  Price (optional)
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={`Default ${formatDecimal(last)}`}
                    className={cn(
                      "border border-border bg-background tabular-nums text-foreground dark:border-white/10",
                      dense ? "rounded-lg px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                    )}
                  />
                </label>
                <label className={cn("flex flex-col font-medium text-foreground", dense ? "gap-1 text-xs" : "gap-1.5 text-sm")}>
                  Account name
                  <input
                    value={tradeAccountName}
                    onChange={(e) => setTradeAccountName(e.target.value)}
                    placeholder="Brokerage / IRA"
                    disabled={side === "SELL"}
                    className={cn(
                      "border border-border bg-background text-foreground disabled:opacity-60 dark:border-white/10",
                      dense ? "rounded-lg px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                    )}
                  />
                </label>
                <label className={cn("flex flex-col font-medium text-foreground", dense ? "gap-1 text-xs" : "gap-1.5 text-sm")}>
                  Account type
                  <select
                    value={tradeAccountType}
                    onChange={(e) => setTradeAccountType(e.target.value as "unknown" | "retirement" | "taxable")}
                    disabled={side === "SELL"}
                    className={cn(
                      "rounded-lg border border-border bg-background text-foreground disabled:opacity-60 dark:border-white/10",
                      dense ? "px-2 py-1.5 text-xs" : "rounded-xl px-3 py-2.5 text-sm"
                    )}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="retirement">Retirement</option>
                    <option value="taxable">Taxable</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={applyTrade}
                  className={cn(
                    appCtaButton("ui-hover-spotlight justify-center"),
                    dense ? "rounded-lg px-3 py-1.5 text-xs" : "rounded-xl px-5 py-2.5 text-sm sm:self-end"
                  )}
                >
                  Apply trade
                </button>
              </div>
              <p className={cn("text-subtle", dense ? "mt-2 text-[11px]" : "mt-3 text-xs")}>
                Account fields are stored on new buy lots and carried into CSV export and stock-detail lot history.
              </p>
            </SectionCard>
          </div>
        </div>

        {(hasPosition || lotSummary.openLots.length > 0 || lotSummary.soldLots.length > 0) && (
          <SectionCard
            compact={dense}
            title="Tax lots"
            description="Lot-level holding data for this symbol, including wash-sale status and long-term eligibility using the same rules as the iOS app."
          >
            <div className={cn("grid sm:grid-cols-2 xl:grid-cols-4", dense ? "gap-2" : "gap-3")}>
              <StatTile compact={dense} label="Open lots" value={String(lotSummary.openLots.length)} />
              <StatTile compact={dense} label="Open basis" value={formatCurrency(lotSummary.openCostBasis)} />
              <StatTile
                compact={dense}
                label="Realized P/L"
                value={formatSignedCurrency(lotSummary.realizedGainLoss)}
                valueClassName={lotSummary.realizedGainLoss >= 0 ? "text-primary" : "text-error"}
              />
              <StatTile
                compact={dense}
                label="Wash sale"
                value={
                  lotSummary.washSale == null
                    ? "—"
                    : lotSummary.washSale.canBuy
                      ? "Clear"
                      : `${lotSummary.washSale.daysRemaining}d left`
                }
                valueClassName={lotSummary.washSale?.canBuy === false ? "text-error" : undefined}
              />
            </div>

            <div className={dense ? "mt-3 space-y-3" : "mt-4 space-y-4"}>
              <div className="rounded-xl border border-border/70 bg-background/40 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Tax rule status</p>
                    <p className={cn("text-subtle", dense ? "mt-1 text-[11px]" : "mt-1 text-xs")}>
                      {lotSummary.washSale?.displayText ?? "No lot-level rule data available yet."}
                    </p>
                  </div>
                  {sellOnlyLongTermQualified && hasPosition ? (
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-1 font-semibold",
                        dense ? "text-[10px]" : "text-xs",
                        lotSummary.oldestOpenLotQualified
                          ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200"
                          : "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200"
                      )}
                    >
                      {lotSummary.oldestOpenLotQualified ? "Sell gate satisfied" : "Sell gate blocked"}
                    </span>
                  ) : null}
                </div>
                {sellOnlyLongTermQualified && hasPosition ? (
                  <p className={cn("text-subtle", dense ? "mt-2 text-[11px]" : "mt-2 text-xs")}>
                    {lotSummary.oldestOpenLotDate == null || isUnknownPurchaseDate(lotSummary.oldestOpenLotDate)
                      ? "Long-term sales are enabled in settings, but no dated open lot is available."
                      : lotSummary.oldestOpenLotQualified
                        ? `Oldest open lot qualifies for long-term treatment since ${formatDateLabel(lotSummary.oldestOpenLotDate.toISOString())}.`
                        : `Oldest open lot has not reached the 365-day threshold yet (${formatDateLabel(lotSummary.oldestOpenLotDate.toISOString())}).`}
                  </p>
                ) : null}
              </div>

              {lotSummary.openLots.length > 0 ? (
                <div>
                  <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Open lots</p>
                  <ul className={cn("mt-2 space-y-2", dense ? "text-xs" : "text-sm")}>
                    {lotSummary.openLots.map((lot) => {
                      const holdingStatus = lotHoldingStatus(lot.purchaseDate);
                      const lotMarketValue = lot.quantity * last;
                      const lotCostBasis = lot.quantity * lot.costBasis;
                      const lotUnrealized = lotMarketValue - lotCostBasis;

                      return (
                        <li
                          key={lot.id}
                          className="rounded-xl border border-border/60 bg-background/40 p-3 dark:border-white/[0.06]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium tabular-nums text-foreground">
                                {formatNumberMax2(lot.quantity)} shares @ {formatCurrency(lot.costBasis)}
                              </p>
                              <p className={cn("text-subtle", dense ? "mt-1 text-[11px]" : "mt-1 text-xs")}>
                                Bought {formatDateLabel(lot.purchaseDate)}
                              </p>
                              {(lot.account || lot.isRetirementAccount != null) && (
                                <p className={cn("text-subtle", dense ? "mt-1 text-[11px]" : "mt-1 text-xs")}>
                                  {lot.account?.trim() ? lot.account : "No account name"} · {formatAccountType(lot.isRetirementAccount)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className={cn("inline-flex rounded-md px-2 py-1 font-semibold", dense ? "text-[10px]" : "text-xs", holdingStatus.className)}>
                                {holdingStatus.label}
                              </span>
                              <span className={cn("inline-flex rounded-md px-2 py-1 font-semibold", dense ? "text-[10px]" : "text-xs", lotStatusTone(lot.status))}>
                                {formatLotStatus(lot.status)}
                              </span>
                            </div>
                          </div>
                          <div className={cn("mt-2 grid grid-cols-2 sm:grid-cols-3", dense ? "gap-2" : "gap-3")}>
                            <SnapshotRow compact={dense} label="Lot basis" value={formatCurrency(lotCostBasis)} />
                            <SnapshotRow compact={dense} label="Market value" value={formatCurrency(lotMarketValue)} />
                            <SnapshotRow
                              compact={dense}
                              label="Unrealized P/L"
                              value={formatSignedCurrency(lotUnrealized)}
                              hint={last > 0 ? `Last price ${formatCurrency(last)}` : undefined}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className={cn("text-subtle", dense ? "text-xs" : "text-sm")}>
                  No open lot records are available for this symbol yet.
                </p>
              )}

              {lotSummary.soldLots.length > 0 ? (
                <div>
                  <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Closed lots</p>
                  <ul className={cn("mt-2 space-y-2", dense ? "text-xs" : "text-sm")}>
                    {lotSummary.soldLots.map((lot, index) => (
                      <li
                        key={`${lot.saleDate}-${lot.quantity}-${lot.salePrice}-${index}`}
                        className="rounded-xl border border-border/60 bg-background/40 p-3 dark:border-white/[0.06]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium tabular-nums text-foreground">
                              Sold {formatNumberMax2(lot.quantity)} shares @ {formatCurrency(lot.salePrice)}
                            </p>
                            <p className={cn("text-subtle", dense ? "mt-1 text-[11px]" : "mt-1 text-xs")}>
                              Sale date {formatDateLabel(lot.saleDate)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-1 font-semibold",
                              dense ? "text-[10px]" : "text-xs",
                              lot.realizedGainLoss >= 0
                                ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200"
                                : "bg-red-500/15 text-red-700 dark:bg-red-400/20 dark:text-red-200"
                            )}
                          >
                            {lot.realizedGainLoss >= 0 ? "Realized gain" : "Realized loss"}
                          </span>
                        </div>
                        <div className={cn("mt-2 grid grid-cols-2", dense ? "gap-2" : "gap-3")}>
                          <SnapshotRow compact={dense} label="Proceeds" value={formatCurrency(lot.quantity * lot.salePrice)} />
                          <SnapshotRow
                            compact={dense}
                            label="Realized P/L"
                            value={formatSignedCurrency(lot.realizedGainLoss)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {lotSummary.openLots.length === 0 && lotSummary.soldLots.length === 0 ? (
              <p className={cn("mt-3 text-subtle", dense ? "text-xs" : "text-sm")}>
                Record trades here or sync from the iOS app to populate tax lots for this symbol.
              </p>
            ) : null}
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
