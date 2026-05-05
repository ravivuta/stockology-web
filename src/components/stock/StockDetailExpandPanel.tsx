"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Pencil, PlusCircle, Settings, X, XCircle } from "lucide-react";
import {
  computeRecommendationFactors,
  scoreBreakdownRows,
  sentimentLabelForScore,
} from "@/lib/ios-recommendation";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { formatNewsRelativeDate, parseNewsPublishedAt, sentimentDotClass, type NewsSourceRow } from "@/lib/news-feed";
import { buildRecommendation } from "@/lib/recommendation";
import { formatCompactCurrency, formatCurrency, formatDecimal, formatNumberMax2, formatPercent } from "@/lib/numberFormat";
import { safeHttpUrlForHref } from "@/lib/safe-external-url";
import { createClient } from "@/lib/supabase/client";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSupabaseStockHistory } from "@/hooks/useSupabaseStockHistory";
import { lastSma } from "@/lib/stock-chart";
import { appCtaButton } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import { StockHistoricalChart } from "./StockHistoricalChart";
import { StockStrategyModal } from "./StockStrategyModal";

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

function isInsufficientHistoryComment(comment: string | undefined): boolean {
  return (comment ?? "").toLowerCase().startsWith("insufficient historical data");
}

function recommendationTone(action: string | undefined): string {
  const normalized = action?.toUpperCase() ?? "";
  if (normalized === "SELL") return "border-red-500/30 bg-red-500/14 text-red-700 dark:text-red-200";
  if (normalized === "REDUCE") return "border-amber-500/30 bg-amber-500/14 text-amber-800 dark:text-amber-200";
  if (normalized.startsWith("WAIT")) return "border-border/80 bg-background/75 text-subtle dark:border-white/[0.08] dark:bg-white/[0.05]";
  return "border-emerald-500/30 bg-emerald-500/14 text-emerald-700 dark:text-emerald-300";
}

function recommendationTextTone(action: string | undefined): string {
  const normalized = action?.toUpperCase() ?? "";
  if (normalized === "SELL") return "text-red-700 dark:text-red-200";
  if (normalized === "REDUCE") return "text-amber-800 dark:text-amber-200";
  if (normalized.startsWith("WAIT")) return "text-subtle";
  return "text-emerald-700 dark:text-emerald-300";
}

function valueTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-foreground";
  return value > 0 ? "text-primary" : "text-error";
}

function analystRatingTone(value: string | null | undefined): string {
  const rating = typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(rating)) return "text-foreground";
  if (rating >= 4.5) return "text-emerald-600 dark:text-emerald-400";
  if (rating >= 4.0) return "text-emerald-600/90 dark:text-emerald-300";
  if (rating >= 3.5) return "text-primary dark:text-primary";
  if (rating >= 3.0) return "text-amber-600 dark:text-amber-300";
  if (rating >= 2.5) return "text-red-600/85 dark:text-red-300";
  return "text-red-600 dark:text-red-400";
}

function scoreTone(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "text-foreground";
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 80) return "text-emerald-600/90 dark:text-emerald-300";
  if (score >= 70) return "text-primary dark:text-primary";
  if (score >= 60) return "text-amber-600 dark:text-amber-300";
  if (score >= 50) return "text-red-600/85 dark:text-red-300";
  return "text-red-600 dark:text-red-400";
}

function sentimentTone(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "text-foreground";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-primary dark:text-primary";
  if (score >= 45) return "text-foreground";
  if (score >= 30) return "text-amber-600 dark:text-amber-300";
  return "text-red-600 dark:text-red-400";
}

function sentimentFill(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "bg-border";
  if (score >= 70) return "bg-emerald-500";
  if (score >= 55) return "bg-primary";
  if (score >= 45) return "bg-slate-400 dark:bg-slate-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

type Props = {
  symbol: string;
  embedded?: boolean;
  onClose?: () => void;
  showBackLink?: boolean;
};

type StockSentimentNewsItem = {
  id: string;
  title: string;
  url: string | null;
  source: string;
  sentiment: string | null;
  publishedAtRaw: string;
  publishedAt: Date;
};

function normalizeAiNewsItems(raw: unknown): StockSentimentNewsItem[] {
  if (!Array.isArray(raw)) return [];

  const items = raw
    .filter((item): item is NewsSourceRow => item != null && typeof item === "object")
    .map((item, index) => {
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!title) return null;
      const publishedAtRaw = typeof item.published_at === "string" ? item.published_at : "";
      const url = safeHttpUrlForHref(typeof item.url === "string" ? item.url : null);
      const source = typeof item.source === "string" && item.source.trim() ? item.source.trim() : "News";
      const sentiment = typeof item.sentiment === "string" && item.sentiment.trim() ? item.sentiment.trim() : null;
      return {
        id: `${title}|${url ?? ""}|${publishedAtRaw}|${index}`.slice(0, 400),
        title,
        url,
        source,
        sentiment,
        publishedAtRaw,
        publishedAt: parseNewsPublishedAt(publishedAtRaw),
      } satisfies StockSentimentNewsItem;
    })
    .filter((item): item is StockSentimentNewsItem => item != null);

  items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return items.slice(0, 5);
}

function SectionCard({
  title,
  description,
  children,
  compact,
}: {
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "border border-border/80 bg-elevated shadow-sm dark:border-white/[0.08]",
        compact ? "rounded-xl p-3" : "rounded-[1.15rem] p-3"
      )}
    >
      <div className={cn("border-b border-border/60 dark:border-white/[0.06]", compact ? "pb-2" : "pb-2")}>
        <h3 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{title}</h3>
        {description ? (
          <p className={cn("mt-1 text-subtle", compact ? "line-clamp-2 text-xs leading-snug" : "text-xs leading-snug")}>
            {description}
          </p>
        ) : null}
      </div>
      <div className={compact ? "pt-3" : "pt-2.5"}>{children}</div>
    </section>
  );
}

type DetailField = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  valueClassName?: string;
  fullWidth?: boolean;
};

function DetailFieldGrid({
  items,
  compact,
  columns = 2,
}: {
  items: DetailField[];
  compact?: boolean;
  columns?: 2 | 3;
}) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-2", columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2")}>
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={cn(
            "border-b border-border/50 pb-2 last:border-b-0 dark:border-white/[0.06]",
            item.fullWidth && columns === 3 ? "sm:col-span-2 xl:col-span-3" : item.fullWidth ? "sm:col-span-2" : ""
          )}
        >
          <dt className={cn("font-semibold uppercase tracking-[0.12em] text-subtle", compact ? "text-[9px]" : "text-[11px]")}>
            {item.label}
          </dt>
          <dd className={cn("mt-1 font-medium tabular-nums text-foreground", compact ? "text-sm" : "text-base", item.valueClassName)}>
            {item.value}
          </dd>
          {item.detail ? (
            <p className={cn("mt-0.5 text-subtle", compact ? "text-[10px] leading-snug" : "text-xs leading-relaxed")}>
              {item.detail}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function StockDetailExpandPanel({ symbol, embedded, onClose, showBackLink }: Props) {
  const stocks = usePortfolioStore((s) => s.stocks);
  const recordTrade = usePortfolioStore((s) => s.recordTrade);
  const editOpenLot = usePortfolioStore((s) => s.editOpenLot);
  const updateStock = usePortfolioStore((s) => s.updateStock);
  const optimizeStock = usePortfolioStore((s) => s.optimizeStock);
  const optimizing = usePortfolioStore((s) => s.optimizing);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useAISentimentForRecommendations = usePortfolioStore((s) => s.useAISentimentForRecommendations);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);

  const stock = useMemo(() => stocks.find((s) => s.symbol === symbol), [stocks, symbol]);
  const { points, loading: histLoading, error: histError } = useSupabaseStockHistory(stock ? symbol : null);

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [lotsModalOpen, setLotsModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [tradeAccountName, setTradeAccountName] = useState("");
  const [tradeAccountType, setTradeAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");
  const [lotDate, setLotDate] = useState("");
  const [lotQuantity, setLotQuantity] = useState("");
  const [lotPrice, setLotPrice] = useState("");
  const [lotAccount, setLotAccount] = useState("");
  const [lotAccountType, setLotAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");
  const [aiNewsItems, setAiNewsItems] = useState<StockSentimentNewsItem[]>([]);
  const [aiNewsLoading, setAiNewsLoading] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);

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
      };
    }

    return {
      openLots,
      soldLots,
    };
  }, [lots, stock]);
  const editingLot = useMemo(
    () => lotSummary.openLots.find((lot) => lot.id === editingLotId) ?? null,
    [editingLotId, lotSummary.openLots]
  );
  const storedRec = stock?.recommendation;
  const rec = useMemo(() => {
    if (!stock) return undefined;
    if (closes.length <= 0 && !(stock.movingAvg != null && Number.isFinite(stock.movingAvg) && stock.movingAvg > 0)) {
      if (storedRec && histLoading && isInsufficientHistoryComment(storedRec.comments)) {
        return {
          ...storedRec,
          comments: "Loading historical data for recommendation…",
        };
      }
      return storedRec;
    }
    return buildRecommendation(stock, {
      closes,
      etfProfitTarget,
      stockProfitTarget,
      useAISentiment: useAISentimentForRecommendations,
      useRSIGating: useRSIGatingForRecommendations,
      sellOnlyLongTermQualified,
      openLots: lotSummary.openLots,
      soldLots: lotSummary.soldLots,
    });
  }, [
    closes,
    etfProfitTarget,
    histLoading,
    lotSummary.openLots,
    lotSummary.soldLots,
    sellOnlyLongTermQualified,
    stock,
    stockProfitTarget,
    storedRec,
    useAISentimentForRecommendations,
    useRSIGatingForRecommendations,
  ]);
  const recommendationFactors = useMemo(() => {
    if (!stock || !rec) return [];
    return computeRecommendationFactors(stock, rec, {
      useAISentiment: useAISentimentForRecommendations,
      useRSIGating: useRSIGatingForRecommendations,
      sellOnlyLongTermQualified,
      closes,
    });
  }, [closes, rec, sellOnlyLongTermQualified, stock, useAISentimentForRecommendations, useRSIGatingForRecommendations]);
  const scoreRows = useMemo(() => (stock ? scoreBreakdownRows(stock) : null), [stock]);
  const dense = Boolean(embedded);
  const stockSymbol = stock?.symbol ?? null;
  const stockIsEtf = stock?.isETF === true;
  const aiSentimentScore = stock?.aiSentimentScore;
  const hasAiSentiment = stockIsEtf !== true && aiSentimentScore != null && Number.isFinite(aiSentimentScore) && aiSentimentScore > 0;

  useEffect(() => {
    if (!stockSymbol || stockIsEtf) {
      setAiNewsItems([]);
      setAiNewsLoading(false);
      return;
    }

    let cancelled = false;

    const loadAiNews = async () => {
      setAiNewsLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("ai_sentiment_scores")
          .select("news_sources, last_updated")
          .eq("symbol", stockSymbol)
          .order("last_updated", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) {
          setAiNewsItems(normalizeAiNewsItems(data?.news_sources));
        }
      } catch (error) {
        console.warn("[stock ai sentiment news]", error);
        if (!cancelled) setAiNewsItems([]);
      } finally {
        if (!cancelled) setAiNewsLoading(false);
      }
    };

    void loadAiNews();

    return () => {
      cancelled = true;
    };
  }, [stockIsEtf, stockSymbol]);

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
  const positionValue = stock.quantity * last;
  const unrealized = positionValue - stock.quantity * stock.averageCost;
  const unrealizedPct = stock.quantity * stock.averageCost > 0 ? (unrealized / (stock.quantity * stock.averageCost)) * 100 : 0;

  function inputDateValue(value: string | undefined) {
    if (!value) return new Date().toISOString().slice(0, 10);
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return new Date().toISOString().slice(0, 10);
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function openLotEditor(lot: (typeof lotSummary.openLots)[number]) {
    setEditingLotId(lot.id);
    setLotDate(inputDateValue(lot.purchaseDate));
    setLotQuantity(String(formatNumberMax2(lot.quantity)));
    setLotPrice(String(lot.costBasis.toFixed(2)));
    setLotAccount(lot.account ?? "");
    setLotAccountType(
      lot.isRetirementAccount == null
        ? "unknown"
        : lot.isRetirementAccount
          ? "retirement"
          : "taxable"
    );
  }

  function closeLotEditor() {
    setEditingLotId(null);
    setLotDate("");
    setLotQuantity("");
    setLotPrice("");
    setLotAccount("");
    setLotAccountType("unknown");
  }

  function saveLotEdit() {
    if (!editingLot) return;
    const nextQty = Number.parseFloat(lotQuantity);
    const nextPrice = Number.parseFloat(lotPrice);
    if (!lotDate || !Number.isFinite(nextQty) || nextQty <= 0 || !Number.isFinite(nextPrice) || nextPrice <= 0) {
      return;
    }

    editOpenLot(symbol, editingLot.id, {
      purchaseDate: lotDate,
      quantity: nextQty,
      costBasis: nextPrice,
      account: lotAccount.trim() || "",
      isRetirementAccount:
        lotAccountType === "unknown" ? null : lotAccountType === "retirement",
    });
    void flushCurrentPortfolioSnapshotNow(true);
    closeLotEditor();
  }

  function applyTrade() {
    const q = parseFloat(qty) || 0;
    if (q <= 0 || !Number.isFinite(tradePrice) || tradePrice <= 0) return;
    recordTrade(symbol, side, q, tradePrice, new Date().toISOString().slice(0, 10), {
      account: tradeAccountName.trim() || undefined,
      isRetirementAccount:
        tradeAccountType === "unknown" ? null : tradeAccountType === "retirement",
    });
    void flushCurrentPortfolioSnapshotNow(true);
    setPrice("");
    setTradeModalOpen(false);
  }

  async function handleOptimize() {
    setOptimizationMessage(null);
    const result = await optimizeStock(symbol);
    if (!result.ok) {
      setOptimizationMessage(result.error ?? `Unable to optimize ${symbol}.`);
      return;
    }
    setOptimizationMessage("Parameters optimized from historical data.");
  }
  return (
    <div
      className={cn(
        "relative flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden text-foreground",
        embedded
          ? "border-t border-border/70 bg-transparent"
          : "rounded-[1.4rem] border border-border/80 bg-elevated shadow-[0_22px_60px_-46px_rgba(15,23,42,0.55)] dark:border-white/[0.08]"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "relative border-b border-border/70 dark:border-white/[0.08]",
          dense ? "px-3 py-3" : "px-4 py-3.5 sm:px-5 sm:py-4"
        )}
      >
        <div className={cn("grid items-start gap-3", dense ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.95fr)] lg:gap-3")}>
          <div className="min-w-0">
            {showBackLink && (
              <Link
                href="/portfolio"
                className={cn("mb-2 inline-block font-medium text-primary hover:underline", dense ? "text-xs" : "text-sm")}
              >
                ← Portfolio
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-subtle",
                  dense ? "text-[9px]" : "text-[10px]",
                  hasPosition ? "border-primary/20 bg-primary/10" : "border-border/70 bg-background/60 dark:border-white/[0.08] dark:bg-white/[0.04]"
                )}
              >
                {hasPosition ? "Holding" : "Watchlist"}
              </span>
              {rec ? (
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 font-bold tracking-[0.14em]",
                    dense ? "text-[9px]" : "text-[10px]",
                    recommendationTone(rec.action)
                  )}
                >
                  {rec.action.replace("_", " ")}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={cn("font-bold tracking-tight", dense ? "text-2xl" : "text-[2.4rem] leading-none")}>{stock.symbol}</h2>
              {stock.name ? (
                <span
                  className={cn("max-w-full truncate text-foreground/70", dense ? "max-w-[min(100%,16rem)] text-xs" : "text-lg")}
                  title={stock.name}
                >
                  {stock.name}
                </span>
              ) : null}
            </div>
            <div className={cn("mt-2 flex flex-wrap items-start gap-x-3 gap-y-1.5", dense ? "mt-2" : "sm:gap-x-4")}>
              <div className="space-y-0.5">
                <span
                  className={cn("block font-semibold tabular-nums tracking-tight text-foreground", dense ? "text-3xl" : "text-5xl leading-none")}
                >
                  {formatCurrency(last)}
                </span>
                {stock.dailyChangePercent != null ? (
                  <p className={cn("font-semibold tabular-nums", dense ? "text-sm" : "text-lg", valueTone(stock.dailyChangePercent))}>
                    {formatPercent(stock.dailyChangePercent, true)} today
                  </p>
                ) : null}
              </div>
              <div className="space-y-0.5">
                {hasPosition ? (
                  <div className={cn("space-y-0.5", dense ? "text-[11px]" : "text-sm")}>
                    <p className="tabular-nums text-foreground/88">
                      Position value {formatCurrency(positionValue)}
                    </p>
                    <p className={cn("tabular-nums", valueTone(unrealized))}>
                      P/L {formatCurrency(unrealized)} ({formatPercent(unrealizedPct, true)})
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLotsModalOpen(true)}
                    className={cn(
                      "ui-hover-pop inline-flex items-center rounded-full border border-border/80 bg-background/70 font-semibold text-foreground dark:border-white/[0.08] dark:bg-white/[0.04]",
                      dense ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
                    )}
                  >
                    Open lots
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeModalOpen(true)}
                    className={cn(
                      "ui-hover-pop inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 font-semibold text-primary",
                      dense ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
                    )}
                  >
                    <PlusCircle className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
                    Record trade
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/40 p-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div>
                  <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Price chart</p>
                  <p className={cn("text-subtle", dense ? "mt-0.5 text-[10px]" : "mt-0.5 text-[11px]")}>
                    Choose a range (1w–5y). The dashed line is your average cost when you hold a position.
                  </p>
                </div>
                {rec ? (
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 font-bold tracking-[0.14em]",
                      dense ? "text-[9px]" : "text-[10px]",
                      recommendationTone(rec.action)
                    )}
                  >
                    {rec.action.replace("_", " ")}
                  </span>
                ) : null}
              </div>
              <StockHistoricalChart
                symbol={stock.symbol}
                smaPeriod={stock.shortSMA}
                averageCost={hasPosition && stock.averageCost > 0 ? stock.averageCost : null}
                points={points}
                loading={histLoading}
                error={histError}
                compact
              />
          </div>
        </div>
        {onClose && embedded ? (
          <div className="mt-3 flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "rounded-xl border border-transparent bg-transparent text-subtle hover:border-border/80 hover:bg-white/55 hover:text-foreground dark:hover:border-white/[0.08] dark:hover:bg-white/[0.06]",
                dense ? "p-1.5" : "p-2.5"
              )}
              aria-label="Close stock details"
            >
              <X className={dense ? "h-4 w-4" : "h-5 w-5"} />
            </button>
          </div>
        ) : null}
      </div>

      <div
        style={{ scrollbarGutter: "stable" }}
        className={cn(
          dense ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 pr-2" : "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 pr-3 sm:px-5 sm:py-4"
        )}
      >
        <div className={dense ? "space-y-3" : "space-y-3"}>
          <div className={cn("grid items-start", dense ? "gap-3" : "gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.15fr)]")}>
            <div className={dense ? "space-y-3" : "space-y-3"}>
              <SectionCard
                compact={dense}
                title="Snapshot"
                description="Latest quote context and core fundamentals."
              >
                <div className="rounded-xl border border-border/60 bg-background/35 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
                  <DetailFieldGrid
                    compact={dense}
                    columns={2}
                    items={[
                      { label: "Beta", value: stock.beta != null ? formatDecimal(stock.beta) : "—" },
                      { label: "Market cap", value: stock.marketCap != null ? formatCompactCurrency(stock.marketCap) : "—" },
                      { label: "PEG ratio", value: stock.peg != null ? formatDecimal(stock.peg) : "—" },
                      {
                        label: "Analyst avg",
                        value: stock.analystAvg?.trim() || "—",
                        valueClassName: analystRatingTone(stock.analystAvg),
                      },
                      {
                        label: "Analyst target",
                        value: stock.analystTarget != null ? formatCurrency(stock.analystTarget) : "—",
                        detail: formatUpsidePct(analystTargetUpsidePct(stock.lastPrice, stock.analystTarget)),
                        valueClassName: valueTone(analystTargetUpsidePct(stock.lastPrice, stock.analystTarget)),
                      },
                      {
                        label: `SMA(${stock.shortSMA})`,
                        value: smaForSnapshot != null ? formatCurrency(smaForSnapshot) : "—",
                        detail: stock.isETF ? "ETF" : "Stock",
                      },
                    ]}
                  />
                </div>
              </SectionCard>

              <SectionCard
                compact={dense}
                title={
                  <span className="flex items-center justify-between gap-3">
                    <span>AI Sentiment</span>
                    {hasAiSentiment ? (
                      <span className={cn("tabular-nums", dense ? "text-sm" : "text-base", sentimentTone(aiSentimentScore))}>
                        {Math.round(aiSentimentScore)}/100
                      </span>
                    ) : null}
                  </span>
                }
              >
                {stock.isETF === true ? (
                  <p className={cn("text-subtle", dense ? "text-xs" : "text-sm")}>AI sentiment is not shown for ETFs.</p>
                ) : hasAiSentiment ? (
                  <div className={dense ? "space-y-3" : "space-y-3"}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn("font-semibold", dense ? "text-sm" : "text-base", sentimentTone(aiSentimentScore))}>
                        {sentimentLabelForScore(aiSentimentScore)}
                      </span>
                      <span className={cn("tabular-nums text-subtle", dense ? "text-[11px]" : "text-xs")}>
                        {Math.round(aiSentimentScore)}/100
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border/80 dark:bg-white/[0.08]">
                      <div
                        className={cn("h-full rounded-full transition-[width]", sentimentFill(aiSentimentScore))}
                        style={{ width: `${Math.max(0, Math.min(100, aiSentimentScore))}%` }}
                      />
                    </div>
                    <div className={cn("border-t border-border/60 pt-3 dark:border-white/[0.06]", dense ? "space-y-2.5" : "space-y-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Latest news</p>
                        {aiNewsLoading ? (
                          <span className={cn("text-subtle", dense ? "text-[10px]" : "text-xs")}>Loading…</span>
                        ) : null}
                      </div>
                      {aiNewsItems.length > 0 ? (
                        <div className={dense ? "space-y-2" : "space-y-2.5"}>
                          {aiNewsItems.map((item) => (
                            <div key={item.id} className="border-b border-border/50 pb-2 last:border-b-0 last:pb-0 dark:border-white/[0.06]">
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    "line-clamp-2 font-medium text-foreground hover:text-primary",
                                    dense ? "text-xs" : "text-sm"
                                  )}
                                >
                                  {item.title}
                                </a>
                              ) : (
                                <p className={cn("line-clamp-2 font-medium text-foreground", dense ? "text-xs" : "text-sm")}>
                                  {item.title}
                                </p>
                              )}
                              <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-subtle", dense ? "text-[10px]" : "text-xs")}>
                                <span>{item.source}</span>
                                {item.publishedAtRaw ? <span>{formatNewsRelativeDate(item.publishedAt)}</span> : null}
                                {item.sentiment ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", sentimentDotClass(item.sentiment))} />
                                    {item.sentiment}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : aiNewsLoading ? null : (
                        <p className={cn("text-subtle", dense ? "text-xs" : "text-sm")}>
                          No stock-specific AI news items are available yet.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className={cn("text-subtle", dense ? "text-xs" : "text-sm")}>
                    No AI sentiment score is available for this stock yet.
                  </p>
                )}
              </SectionCard>
            </div>

            <SectionCard
              compact={dense}
              title={
                <span className="flex items-center justify-between gap-3">
                  <span>Score</span>
                  <span className={cn("tabular-nums", dense ? "text-sm" : "text-base", scoreTone(stock.score))}>
                    {formatScoreDisplay(stock.score)}
                  </span>
                </span>
              }
            >
              <div className={dense ? "space-y-3" : "space-y-3"}>
                <div>
                  <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Score inputs</p>
                  {scoreRows ? (
                    <div className={dense ? "mt-3 space-y-2" : "mt-3 space-y-2"}>
                      <SnapshotRow
                        compact={dense}
                        label="Analyst rating"
                        value={scoreRows.analystLine}
                        hint={scoreRows.analystPoints}
                        valueClassName={analystRatingTone(stock.analystAvg)}
                      />
                      <SnapshotRow
                        compact={dense}
                        label="Potential Upside to target"
                        value={scoreRows.upsideLine}
                        hint={scoreRows.upsidePoints}
                        valueClassName={valueTone(analystTargetUpsidePct(stock.lastPrice, stock.analystTarget))}
                      />
                      <SnapshotRow compact={dense} label="Market cap" value={scoreRows.capLine} hint={scoreRows.capPoints} />
                      <SnapshotRow compact={dense} label="PEG ratio" value={scoreRows.pegLine} hint={scoreRows.pegPoints} />
                    </div>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              compact={dense}
              title={
                <span className="flex items-center justify-between gap-3">
                <span>Recommendation</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOptimize}
                    disabled={optimizing || !stock.pendingOptimization}
                    className={cn(
                      "ui-hover-pop inline-flex items-center gap-1.5 border font-semibold shadow-sm backdrop-blur-lg sm:gap-2 disabled:cursor-not-allowed disabled:opacity-60",
                      stock.pendingOptimization
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      dense ? "rounded-lg px-2 py-1 text-[10px]" : "rounded-lg px-2.5 py-1.5 text-xs"
                    )}
                    aria-label="Optimize parameters"
                  >
                    {optimizing ? "Optimizing…" : stock.pendingOptimization ? "Optimize" : "Optimized"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategyOpen(true)}
                    className={cn(
                        "ui-hover-pop inline-flex items-center gap-1.5 border border-white/45 bg-white/75 font-semibold text-foreground shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/[0.06] sm:gap-2",
                        dense ? "rounded-lg px-2 py-1 text-[10px]" : "rounded-lg px-2.5 py-1.5 text-xs"
                      )}
                      aria-label="Strategy parameters"
                    >
                      <Settings className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
                      Parameters
                    </button>
                  </span>
                </span>
              }
            >
              {rec ? (
                <div className={dense ? "space-y-3" : "space-y-3"}>
                  {optimizationMessage ? (
                    <p className={cn("text-subtle", dense ? "text-[11px]" : "text-xs")}>{optimizationMessage}</p>
                  ) : null}
                  <p
                    className={cn(
                      "inline-flex rounded-lg border font-bold tracking-tight",
                      recommendationTone(rec.action),
                      dense ? "px-2.5 py-1 text-sm" : "px-3 py-1.5 text-lg"
                    )}
                  >
                    {rec.action}
                  </p>
                  <p className={cn("leading-snug", recommendationTextTone(rec.action), dense ? "text-sm" : "text-sm")}>{rec.comments}</p>

                  <div className={cn("border-t border-border/60 dark:border-white/[0.06]", dense ? "pt-3" : "pt-3")}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Factors considered</p>
                      </div>
                      <span className={cn("font-medium text-subtle", dense ? "text-[10px]" : "text-xs")}>
                        {recommendationFactors.filter((factor) => factor.passes).length}/{recommendationFactors.length} passed
                      </span>
                    </div>
                    <div className={cn(dense ? "mt-3 space-y-1.5" : "mt-3 space-y-1.5")}>
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

                </div>
              ) : (
                <p className={cn("text-subtle", dense ? "text-sm" : "text-base")}>
                  No recommendation yet — refresh quotes from Portfolio or Dashboard.
                </p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      <AppModal open={tradeModalOpen} onClose={() => setTradeModalOpen(false)} size="md" titleId="trade-modal-title">
        <ModalSection className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <div>
            <h3 id="trade-modal-title" className="text-base font-semibold tracking-tight text-foreground">
              Record Trade
            </h3>
            <p className="mt-0.5 text-xs text-subtle">
              Update cash, shares, average cost, and lots for {stock.symbol}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTradeModalOpen(false)}
            className="rounded-lg border border-transparent p-2 text-subtle hover:border-border/80 hover:bg-white/55 hover:text-foreground dark:hover:border-white/[0.08] dark:hover:bg-white/[0.06]"
            aria-label="Close trade dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </ModalSection>
        <ModalSection className="min-h-0 flex-1 px-4 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Side
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Quantity
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Qty"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground dark:border-white/10"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Price (optional)
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`Default ${formatDecimal(last)}`}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground dark:border-white/10"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Account name
              <input
                value={tradeAccountName}
                onChange={(e) => setTradeAccountName(e.target.value)}
                placeholder="Brokerage / IRA"
                disabled={side === "SELL"}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60 dark:border-white/10"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
              Account type
              <select
                value={tradeAccountType}
                onChange={(e) => setTradeAccountType(e.target.value as "unknown" | "retirement" | "taxable")}
                disabled={side === "SELL"}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60 dark:border-white/10"
              >
                <option value="unknown">Unknown</option>
                <option value="retirement">Retirement</option>
                <option value="taxable">Taxable</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-subtle">
            Account fields are stored on new buy lots and carried into CSV export and stock-detail lot history.
          </p>
        </ModalSection>
        <ModalSection className="flex justify-end gap-2 border-t border-border px-4 py-4 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setTradeModalOpen(false)}
            className="ui-hover-pop rounded-xl border border-border px-4 py-2 text-sm text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyTrade}
            className={cn(appCtaButton("ui-hover-spotlight justify-center"), "rounded-xl px-4 py-2 text-sm")}
          >
            Apply trade
          </button>
        </ModalSection>
      </AppModal>

      <AppModal open={lotsModalOpen} onClose={() => setLotsModalOpen(false)} size="xl" titleId="lots-modal-title">
        <ModalSection className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <div>
            <h3 id="lots-modal-title" className="text-base font-semibold tracking-tight text-foreground">
              Open Lots
            </h3>
            <p className="mt-0.5 text-xs text-subtle">
              Active lots for {stock.symbol}. Account type shows whether each lot is taxable or retirement.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLotsModalOpen(false)}
            className="rounded-lg border border-transparent p-2 text-subtle hover:border-border/80 hover:bg-white/55 hover:text-foreground dark:hover:border-white/[0.08] dark:hover:bg-white/[0.06]"
            aria-label="Close open lots dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </ModalSection>
        <ModalSection className="min-h-0 flex-1 px-4 py-4">
          {lotSummary.openLots.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left">
                <thead className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-subtle dark:border-white/[0.06]">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Bought</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Qty</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Cost/share</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Basis</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Value</th>
                    <th className="pb-2 pr-3 text-right font-semibold">P/L</th>
                    <th className="pb-2 pr-3 font-semibold">Account type</th>
                    <th className="pb-2 text-right font-semibold">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {lotSummary.openLots.map((lot) => {
                    const lotMarketValue = lot.quantity * last;
                    const lotCostBasis = lot.quantity * lot.costBasis;
                    const lotUnrealized = lotMarketValue - lotCostBasis;

                    return (
                      <tr key={lot.id} className="border-b border-border/50 text-foreground last:border-b-0 dark:border-white/[0.06]">
                        <td className="py-2 pr-3 text-sm">{formatDateLabel(lot.purchaseDate)}</td>
                        <td className="py-2 pr-3 text-right text-sm tabular-nums">{formatNumberMax2(lot.quantity)}</td>
                        <td className="py-2 pr-3 text-right text-sm tabular-nums">{formatCurrency(lot.costBasis)}</td>
                        <td className="py-2 pr-3 text-right text-sm tabular-nums">{formatCurrency(lotCostBasis)}</td>
                        <td className="py-2 pr-3 text-right text-sm tabular-nums">{formatCurrency(lotMarketValue)}</td>
                        <td className={cn("py-2 pr-3 text-right text-sm tabular-nums", lotUnrealized >= 0 ? "text-primary" : "text-error")}>
                          {formatCurrency(lotUnrealized)}
                        </td>
                        <td className="py-2 pr-3 text-sm">{formatAccountType(lot.isRetirementAccount)}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openLotEditor(lot)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-xs text-foreground hover:bg-background/70 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-subtle">No open lot records are available for this symbol yet.</p>
          )}
        </ModalSection>
      </AppModal>

      <AppModal open={editingLot != null} onClose={closeLotEditor} size="md" titleId="edit-lot-modal-title">
        <ModalSection className="border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <h3 id="edit-lot-modal-title" className="text-base font-semibold tracking-tight text-foreground">
            Edit Lot
          </h3>
        </ModalSection>
        <ModalSection className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-foreground">
              <span>Bought</span>
              <input
                type="date"
                value={lotDate}
                onChange={(e) => setLotDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>Quantity</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={lotQuantity}
                onChange={(e) => setLotQuantity(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>Price per share</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lotPrice}
                onChange={(e) => setLotPrice(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>Account</span>
              <input
                type="text"
                value={lotAccount}
                onChange={(e) => setLotAccount(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm text-foreground">
            <span>Account type</span>
            <select
              value={lotAccountType}
              onChange={(e) => setLotAccountType(e.target.value as "unknown" | "retirement" | "taxable")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="unknown">Unknown</option>
              <option value="retirement">Retirement</option>
              <option value="taxable">Taxable</option>
            </select>
          </label>
          {Number.isFinite(Number.parseFloat(lotQuantity)) && Number.isFinite(Number.parseFloat(lotPrice)) ? (
            <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-sm text-subtle">
              Total cost {formatCurrency((Number.parseFloat(lotQuantity) || 0) * (Number.parseFloat(lotPrice) || 0))}
            </div>
          ) : null}
        </ModalSection>
        <ModalSection className="flex items-center justify-end gap-2 border-t border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <button
            type="button"
            onClick={closeLotEditor}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-background/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveLotEdit}
            disabled={!lotDate || (Number.parseFloat(lotQuantity) || 0) <= 0 || (Number.parseFloat(lotPrice) || 0) <= 0}
            className={cn(appCtaButton("ui-hover-spotlight rounded-lg px-3 py-2 text-sm"), "disabled:opacity-50")}
          >
            Save
          </button>
        </ModalSection>
      </AppModal>

      <StockStrategyModal
        open={strategyOpen}
        onClose={() => setStrategyOpen(false)}
        stock={stock}
        etfProfitTarget={etfProfitTarget}
        stockProfitTarget={stockProfitTarget}
        onSave={(patch) => {
          updateStock(symbol, patch);
          void flushCurrentPortfolioSnapshotNow(true);
        }}
      />
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
    <div className={cn("flex items-start gap-2", compact ? "py-1" : "py-1.5")}>
      {passes ? (
        <CheckCircle2 className={cn("mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      ) : (
        <XCircle className={cn("mt-0.5 shrink-0 text-red-600 dark:text-red-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      )}
      <p className={cn("min-w-0 flex-1 text-foreground/88", compact ? "text-xs" : "text-sm")}>{label}</p>
      <p
        className={cn(
          "shrink-0 text-right leading-snug",
          passes ? "text-subtle" : "text-red-600 dark:text-red-300",
          compact ? "max-w-[45%] text-[10px]" : "max-w-[48%] text-xs"
        )}
      >
        {detail}
      </p>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  hint,
  compact,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  compact?: boolean;
  valueClassName?: string;
}) {
  return (
    <li
      className={cn(
        compact ? "pb-1.5 last:pb-0" : "pb-2 last:pb-0"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn("font-medium text-foreground/80", compact ? "text-xs" : "text-sm")}>{label}</span>
        <span
          className={cn(
            "text-right font-semibold tabular-nums text-foreground",
            compact ? "text-sm" : "text-base",
            valueClassName
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
