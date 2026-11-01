"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Info, Pencil, PlusCircle, RefreshCw, Settings, Trash2, X, XCircle } from "lucide-react";
import {
  analystTargetSourceLabel,
  computeRecommendationFactors,
  dividendYieldPercent,
  payoutRatioDecimal,
  rankInWatchlistScoreUniverse,
  recommendedWatchlistSize,
  selectedAnalystTarget,
  scoreBreakdownRows,
  sentimentLabelForScore,
  offloadHoldingOutsideShortlistIfNeeded,
  raiseCashForMarketOutlookIfNeeded,
} from "@/lib/ios-recommendation";
import { analystTargetUpsidePct, formatScore, formatUpsidePct } from "@/lib/marketFormat";
import { effectiveOutlookCashTargetPct } from "@/lib/market-outlook";
import { formatNewsRelativeDate, parseNewsPublishedAt, sentimentDotClass, type NewsSourceRow } from "@/lib/news-feed";
import { buildRecommendation } from "@/lib/recommendation";
import { formatCompactCurrency, formatCurrency, formatDecimal, formatNumberMax2, formatPercent } from "@/lib/numberFormat";
import { safeHttpUrlForHref } from "@/lib/safe-external-url";
import { postgrestEqValue } from "@/lib/postgrest-symbol";
import { createClient } from "@/lib/supabase/client";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { parseSuggestedQuantity, suggestedTradeType } from "@/lib/tradePrefill";
import { usePortfolioStore, type StockHolding } from "@/store/portfolioStore";
import { useSupabaseStockHistory } from "@/hooks/useSupabaseStockHistory";
import { lastSma } from "@/lib/stock-chart";
import { appCtaButton } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import { StockHistoricalChart } from "./StockHistoricalChart";
import { StockStrategyModal } from "./StockStrategyModal";

function formatDateLabel(value: string | undefined): string {
  if (!value) return "Unknown";

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const middayUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
    const offsetMinutes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(middayUtc)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const offsetMatch = offsetMinutes.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    const sign = offsetMatch?.[1] === "-" ? -1 : 1;
    const hours = Number(offsetMatch?.[2] ?? 0);
    const minutes = Number(offsetMatch?.[3] ?? 0);
    const etDate = new Date(middayUtc - sign * (hours * 60 + minutes) * 60 * 1000);
    return etDate.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return value;

  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
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

function formatScoreDisplay(score: number | undefined | null): string {
  return formatScore(score);
}

function isInsufficientHistoryComment(comment: string | undefined): boolean {
  return (comment ?? "").toLowerCase().startsWith("insufficient historical data");
}

function recommendationTone(action: string | undefined): string {
  const normalized = action?.toUpperCase() ?? "";
  if (normalized === "SELL") return "border-red-600/25 bg-red-600/12 text-red-700 dark:border-red-300/30 dark:bg-red-400/18 dark:text-red-200";
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

type SavedTradeAccountProfile = {
  name: string;
  isRetirementAccount: boolean | null;
};

const CSV_MAPPING_PRESETS_KEY = "stocks-pm-csv-mapping-presets:v1";
const NEW_PROFILE_VALUE = "__new__";
const SHARE_FRACTION_TOLERANCE = 0.000001;

function loadSavedTradeAccountProfiles(): SavedTradeAccountProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CSV_MAPPING_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const unique = new Map<string, SavedTradeAccountProfile>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const name = typeof item.defaultAccountName === "string" ? item.defaultAccountName.trim() : "";
      if (!name || unique.has(name)) continue;
      const selection = typeof item.defaultRetirementAccount === "string" ? item.defaultRetirementAccount.toLowerCase() : "";
      unique.set(name, {
        name,
        isRetirementAccount: selection === "yes" ? true : selection === "no" ? false : null,
      });
    }

    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function formatShareQuantity(value: number): string {
  const isWhole = Math.abs(Math.round(value) - value) < SHARE_FRACTION_TOLERANCE;
  if (isWhole) return String(Math.round(value));

  let text = value.toFixed(4);
  while (text.includes(".") && text.endsWith("0")) text = text.slice(0, -1);
  if (text.endsWith(".")) text = text.slice(0, -1);
  return text;
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
        "border border-border/80 bg-background/70 shadow-sm backdrop-blur-[1px] dark:border-white/[0.08] dark:bg-white/[0.04]",
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
  const recordSellFromLot = usePortfolioStore((s) => s.recordSellFromLot);
  const editOpenLot = usePortfolioStore((s) => s.editOpenLot);
  const removeOpenLot = usePortfolioStore((s) => s.removeOpenLot);
  const updateStock = usePortfolioStore((s) => s.updateStock);
  const optimizeStock = usePortfolioStore((s) => s.optimizeStock);
  const optimizing = usePortfolioStore((s) => s.optimizing);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useAISentimentForRecommendations = usePortfolioStore((s) => s.useAISentimentForRecommendations);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const rsiPeriodForRecommendations = usePortfolioStore((s) => s.rsiPeriodForRecommendations);
  const rsiOversoldThresholdForRecommendations = usePortfolioStore((s) => s.rsiOversoldThresholdForRecommendations);
  const rsiOverboughtThresholdForRecommendations = usePortfolioStore((s) => s.rsiOverboughtThresholdForRecommendations);
  const rsiHysteresisPointsForRecommendations = usePortfolioStore((s) => s.rsiHysteresisPointsForRecommendations);
  const rsiMinRisingDaysForRecommendations = usePortfolioStore((s) => s.rsiMinRisingDaysForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const cashBalance = usePortfolioStore((s) => s.cashBalance);
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const useMarketRegimeCashTilt = usePortfolioStore((s) => s.useMarketRegimeCashTilt);
  const marketOutlook = usePortfolioStore((s) => s.marketOutlook);
  const marketOutlookCashTargetRiskOn = usePortfolioStore((s) => s.marketOutlookCashTargetRiskOn);
  const marketOutlookCashTargetNeutral = usePortfolioStore((s) => s.marketOutlookCashTargetNeutral);
  const marketOutlookCashTargetElevated = usePortfolioStore((s) => s.marketOutlookCashTargetElevated);
  const marketOutlookCashTargetRiskOff = usePortfolioStore((s) => s.marketOutlookCashTargetRiskOff);
  const marketOutlookCashTargetSevere = usePortfolioStore((s) => s.marketOutlookCashTargetSevere);
  const traderModeEnabled = usePortfolioStore((s) => s.traderModeEnabled);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);

  const stock = useMemo(() => stocks.find((s) => s.symbol === symbol), [stocks, symbol]);
  const selectedTarget = useMemo(
    () => (stock ? selectedAnalystTarget(stock) : { value: undefined, tier: "fallback" as const }),
    [stock]
  );
  const { points, loading: histLoading, error: histError } = useSupabaseStockHistory(stock ? symbol : null);

  // Append today's live price as the last data point when it differs from the last historical close
  const pointsWithToday = useMemo(() => {
    if (!points || points.length === 0) return points;
    const livePrice = stock?.lastPrice ?? 0;
    if (livePrice <= 0) return points;
    const lastClose = points[points.length - 1]!.close;
    if (Math.abs(livePrice - lastClose) <= 0.001) return points;
    const todayStr = new Date().toISOString().slice(0, 10);
    return [...points, { date: todayStr, close: livePrice }];
  }, [points, stock?.lastPrice]);

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [lotsModalOpen, setLotsModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [savedTradeProfiles, setSavedTradeProfiles] = useState<SavedTradeAccountProfile[]>([]);
  const [selectedTradeProfile, setSelectedTradeProfile] = useState(NEW_PROFILE_VALUE);
  const [tradeAccountName, setTradeAccountName] = useState("");
  const [tradeAccountType, setTradeAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");
  const [lotDate, setLotDate] = useState("");
  const [lotQuantity, setLotQuantity] = useState("");
  const [lotPrice, setLotPrice] = useState("");
  const [lotAccount, setLotAccount] = useState("");
  const [lotAccountType, setLotAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");
  const [sellingLotId, setSellingLotId] = useState<string | null>(null);
  const [sellLotQty, setSellLotQty] = useState("");
  const [sellLotPrice, setSellLotPrice] = useState("");
  const [sellLotDate, setSellLotDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellLotError, setSellLotError] = useState<string | null>(null);
  const [lotPendingDeleteId, setLotPendingDeleteId] = useState<string | null>(null);
  const [aiNewsItems, setAiNewsItems] = useState<StockSentimentNewsItem[]>([]);
  const [aiNewsLoading, setAiNewsLoading] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [decisionMapOpen, setDecisionMapOpen] = useState(false);
  const [flowChartOpen, setFlowChartOpen] = useState(false);

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
  const isShortlistedForPortfolio = stock?.isShortlisted ?? ((stock?.quantity ?? 0) > 0 || stock?.isETF === true);
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
  const sellingLot = useMemo(
    () => lotSummary.openLots.find((lot) => lot.id === sellingLotId) ?? null,
    [lotSummary.openLots, sellingLotId]
  );
  const lotPendingDelete = useMemo(
    () => lotSummary.openLots.find((lot) => lot.id === lotPendingDeleteId) ?? null,
    [lotPendingDeleteId, lotSummary.openLots]
  );
  const storedRec = stock?.recommendation;
  const fixedIncomeTotal = useMemo(
    () => Object.values(fixedIncomeByAccount ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0), 0),
    [fixedIncomeByAccount]
  );
  const cashEquivalentBalance = cashBalance + fixedIncomeTotal;
  const marketOutlookCashTargetPct = useMemo(() => {
    if (!marketOutlook) return undefined;
    return effectiveOutlookCashTargetPct(marketOutlook, {
      riskOn: marketOutlookCashTargetRiskOn,
      neutral: marketOutlookCashTargetNeutral,
      elevated: marketOutlookCashTargetElevated,
      riskOff: marketOutlookCashTargetRiskOff,
      severe: marketOutlookCashTargetSevere,
    });
  }, [
    marketOutlook,
    marketOutlookCashTargetElevated,
    marketOutlookCashTargetNeutral,
    marketOutlookCashTargetRiskOff,
    marketOutlookCashTargetRiskOn,
    marketOutlookCashTargetSevere,
  ]);
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
    const baseRec = buildRecommendation(stock, {
      closes,
      etfProfitTarget,
      stockProfitTarget,
      useTraderMode: traderModeEnabled,
      useAISentiment: traderModeEnabled ? useAISentimentForRecommendations : false,
      useRSIGating: traderModeEnabled ? useRSIGatingForRecommendations : false,
      rsiPeriod: rsiPeriodForRecommendations,
      rsiOversoldThreshold: rsiOversoldThresholdForRecommendations,
      rsiOverboughtThreshold: rsiOverboughtThresholdForRecommendations,
      rsiHysteresisPoints: rsiHysteresisPointsForRecommendations,
      rsiMinRisingDays: rsiMinRisingDaysForRecommendations,
      sellOnlyLongTermQualified,
      openLots: lotSummary.openLots,
      soldLots: lotSummary.soldLots,
    });
    const gateCtx = {
      enableRiskFilter,
      limitWatchlistSize,
      riskAppetite,
      portfolioSize,
      cashBalance: cashEquivalentBalance,
      cashSharePct: portfolioSize > 0 ? (cashEquivalentBalance / portfolioSize) * 100 : 100,
      useMarketRegimeCashTilt: useMarketRegimeCashTilt && marketOutlook?.preferCash === true,
      marketOutlookCashTargetPct,
      marketOutlookLabel: marketOutlook?.label,
      allStocks: stocks,
    };
    const outsideShortlistAdjusted = offloadHoldingOutsideShortlistIfNeeded(
      baseRec,
      stock,
      gateCtx,
      { sellOnlyLongTermQualified }
    );
    return raiseCashForMarketOutlookIfNeeded(
      outsideShortlistAdjusted,
      stock,
      gateCtx,
      { sellOnlyLongTermQualified }
    );
  }, [
    cashEquivalentBalance,
    closes,
    etfProfitTarget,
    marketOutlook?.label,
    marketOutlook?.preferCash,
    marketOutlookCashTargetPct,
    histLoading,
    lotSummary.openLots,
    lotSummary.soldLots,
    sellOnlyLongTermQualified,
    stock,
    stockProfitTarget,
    storedRec,
    useAISentimentForRecommendations,
    useRSIGatingForRecommendations,
    traderModeEnabled,
    rsiPeriodForRecommendations,
    rsiOversoldThresholdForRecommendations,
    rsiOverboughtThresholdForRecommendations,
    rsiHysteresisPointsForRecommendations,
    rsiMinRisingDaysForRecommendations,
    enableRiskFilter,
    limitWatchlistSize,
    riskAppetite,
    portfolioSize,
    useMarketRegimeCashTilt,
    stocks,
  ]);
  const recommendationFactors = useMemo(() => {
    if (!stock || !rec) return [];
    return computeRecommendationFactors(stock, rec, {
      useAISentiment: traderModeEnabled ? useAISentimentForRecommendations : false,
      useRSIGating: traderModeEnabled ? useRSIGatingForRecommendations : false,
      rsiPeriod: rsiPeriodForRecommendations,
      rsiOversoldThreshold: rsiOversoldThresholdForRecommendations,
      rsiOverboughtThreshold: rsiOverboughtThresholdForRecommendations,
      rsiHysteresisPoints: rsiHysteresisPointsForRecommendations,
      rsiMinRisingDays: rsiMinRisingDaysForRecommendations,
      sellOnlyLongTermQualified,
      closes,
    });
  }, [
    closes,
    rec,
    rsiHysteresisPointsForRecommendations,
    rsiMinRisingDaysForRecommendations,
    rsiOverboughtThresholdForRecommendations,
    rsiOversoldThresholdForRecommendations,
    rsiPeriodForRecommendations,
    sellOnlyLongTermQualified,
    stock,
    useAISentimentForRecommendations,
    useRSIGatingForRecommendations,
    traderModeEnabled,
  ]);
  const recommendationActionFactors = useMemo(
    () =>
      recommendationFactors.filter(
        (factor) =>
          factor.label !== "Shortlisted" &&
          factor.label !== "User override: Excluded from Shortlist"
      ),
    [recommendationFactors]
  );
  const recommendationDecisionGroups = useMemo(
    () =>
      recommendationFactorGroups(
        rec?.action ?? "",
        recommendationActionFactors,
        {
          hasPosition: (stock?.quantity ?? 0) > 0,
          hasOversizePosition:
            (stock?.quantity ?? 0) * (stock?.averageCost ?? 0) > (stock?.stockLimit ?? Number.POSITIVE_INFINITY),
          recComments: rec?.comments ?? "",
          sellFromWaitFactors: sellFromWaitFactors({
            stock,
            rec,
            limitWatchlistSize,
            enableRiskFilter,
            useMarketRegimeCashTilt,
            marketOutlookPrefersCash: marketOutlook?.preferCash === true,
            marketOutlookCashTargetPct,
            cashEquivalentBalance,
            portfolioSize,
          }),
        }
      ),
    [
      rec,
      recommendationActionFactors,
      stock,
      limitWatchlistSize,
      enableRiskFilter,
      useMarketRegimeCashTilt,
      marketOutlook?.preferCash,
      marketOutlookCashTargetPct,
      cashEquivalentBalance,
      portfolioSize,
    ]
  );
  const shortlistFactors = useMemo(() => {
    if (!stock) return [];

    if (stock.isETF === true) {
      const rows = [
        {
          label: "Because, either you are holding a position of this stock",
          detail: stock.quantity > 0 ? "Yes" : "No",
          passes: stock.quantity > 0,
        },
        {
          label: "ETF handling",
          detail: "ETFs are always included for recommendations regardless of filters",
          passes: true,
        },
      ];

      if (stock.excludeFromShortlist === true) {
        rows.push({
          label: "User override: Excluded from shortlist",
          detail: "You excluded this stock — no recommendations generated",
          passes: false,
        });
      }

      return rows;
    }

    const riskPasses = stock.isVisibleInRisk === true;
    const rows = [
      {
        label: "Because, either you are holding a position of this stock",
        detail: stock.quantity > 0 ? "Yes" : "No",
        passes: stock.quantity > 0,
      },
      {
        label: `${riskAppetite} Risk Appetite Filter`,
        detail: riskPasses ? "Passes" : "Filtered",
        passes: riskPasses,
      },
    ];
    if (riskPasses) {
      const topN = recommendedWatchlistSize(portfolioSize);
      const rank = rankInWatchlistScoreUniverse(stocks, stock.symbol, {
        enableRiskFilter,
        riskAppetite,
      });
      const rankLabel =
        rank != null ? `Ranked ${rank} in top ${topN}` : `Not ranked in top ${topN}`;
      rows.push({
        label: `Score-Driven Top ${topN} Watchlist`,
        detail: limitWatchlistSize ? rankLabel : "Limit disabled",
        passes: limitWatchlistSize ? stock.isInWatchlistSize === true : true,
      });
    }

    if (stock.excludeFromShortlist === true) {
      rows.push({
        label: "User override: Excluded from shortlist",
        detail: "You excluded this stock — no recommendations generated",
        passes: false,
      });
    }

    return rows;
  }, [enableRiskFilter, limitWatchlistSize, portfolioSize, riskAppetite, stock, stocks]);
  const shortlistReasons = useMemo(() => {
    if (!stock || isShortlistedForPortfolio) return [];

    const reasons: string[] = [];
    if (stock.excludeFromShortlist === true) {
      reasons.push("Excluded by your per-stock shortlist override.");
    }
    if (!stock.isETF && stock.isVisibleInRisk === false) {
      reasons.push("Does not meet the current risk appetite criteria.");
    } else if (!stock.isETF && limitWatchlistSize && stock.isInWatchlistSize === false) {
      const topN = recommendedWatchlistSize(portfolioSize);
      const rank = rankInWatchlistScoreUniverse(stocks, stock.symbol, {
        enableRiskFilter,
        riskAppetite,
      });
      reasons.push(
        rank != null
          ? `Ranked ${rank} in top ${topN} watchlist.`
          : `Score ranks below the top ${topN} watchlist limit.`
      );
    }
    return reasons;
  }, [enableRiskFilter, isShortlistedForPortfolio, limitWatchlistSize, portfolioSize, riskAppetite, stock, stocks]);
  const scoreRows = useMemo(() => (stock ? scoreBreakdownRows(stock) : null), [stock]);
  const dense = Boolean(embedded);
  const stockSymbol = stock?.symbol ?? null;
  const stockIsEtf = stock?.isETF === true;
  const aiSentimentScore = stock?.aiSentimentScore;
  const hasAiSentiment = stockIsEtf !== true && aiSentimentScore != null && Number.isFinite(aiSentimentScore) && aiSentimentScore > 0;
  const suppressTradeActions = stock?.suppressTradeActions ?? false;
  const excludeFromShortlist = stock?.excludeFromShortlist ?? false;
  const includeInShortlist = stock?.includeInShortlist ?? false;
  const showIncludeToggle =
    (stock?.quantity ?? 0) <= 0 &&
    stock?.isETF !== true &&
    (isShortlistedForPortfolio === false || includeInShortlist === true);
  const canToggleShortlistExclusion = (stock?.quantity ?? 0) <= 0 || excludeFromShortlist;

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

        // Trigger a smart one-symbol refresh first so this panel can show newer headlines.
        // The edge function internally skips heavy work when cached sentiment is still fresh.
        try {
          await supabase.functions.invoke("refresh-ai-sentiment", {
            body: { symbols: [stockSymbol], limit: 1 },
          });
        } catch (refreshError) {
          console.warn("[stock ai sentiment refresh]", refreshError);
        }

        const { data, error } = await supabase
          .from("ai_sentiment_scores")
          .select("news_sources, last_updated")
          .filter("symbol", "eq", postgrestEqValue(stockSymbol))
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

  useEffect(() => {
    if (!tradeModalOpen || !stock) return;

    const nextProfiles = loadSavedTradeAccountProfiles();
    setSavedTradeProfiles(nextProfiles);
    setSelectedTradeProfile(NEW_PROFILE_VALUE);
    setTradeAccountName("");
    setTradeAccountType("unknown");
    setTradeDate(new Date().toISOString().slice(0, 10));
    setQty("");
    setPrice("");

    const lastPrice = stock.lastPrice ?? 0;

    if (lastPrice > 0) {
      setPrice(lastPrice.toFixed(2));
    }

    if (rec && suggestedTradeType(rec.action) === "BUY") {
      const suggestedQty = parseSuggestedQuantity(rec?.comments ?? "");
      if (suggestedQty && suggestedQty > 0) {
        setQty(formatShareQuantity(suggestedQty));
      }
    }
  }, [rec, stock, tradeModalOpen]);

  useEffect(() => {
    if (selectedTradeProfile === NEW_PROFILE_VALUE) return;
    const profile = savedTradeProfiles.find((item) => item.name === selectedTradeProfile);
    if (!profile) return;
    setTradeAccountName(profile.name);
    setTradeAccountType(
      profile.isRetirementAccount == null
        ? "unknown"
        : profile.isRetirementAccount
          ? "retirement"
          : "taxable"
    );
  }, [savedTradeProfiles, selectedTradeProfile]);

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

  function openLotSellDialog(lot: (typeof lotSummary.openLots)[number]) {
    setSellingLotId(lot.id);
    setSellLotQty("");
    setSellLotPrice(last > 0 ? last.toFixed(2) : "");
    setSellLotDate(new Date().toISOString().slice(0, 10));
    setSellLotError(null);
  }

  function closeLotSellDialog() {
    setSellingLotId(null);
    setSellLotQty("");
    setSellLotPrice("");
    setSellLotDate(new Date().toISOString().slice(0, 10));
    setSellLotError(null);
  }

  function requestLotDelete(lotId: string) {
    setLotPendingDeleteId(lotId);
  }

  function cancelLotDelete() {
    setLotPendingDeleteId(null);
  }

  function confirmLotDelete() {
    if (!lotPendingDelete) return;
    removeOpenLot(symbol, lotPendingDelete.id);
    void flushCurrentPortfolioSnapshotNow(true);
    if (editingLot?.id === lotPendingDelete.id) {
      closeLotEditor();
    }
    setLotPendingDeleteId(null);
  }

  function saveLotSell() {
    if (!sellingLot) return;

    const enteredQty = Number.parseFloat(sellLotQty);
    const enteredPrice = Number.parseFloat(sellLotPrice);

    if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
      setSellLotError("Enter a valid sell quantity.");
      return;
    }
    if (!Number.isFinite(enteredPrice) || enteredPrice <= 0) {
      setSellLotError("Enter a valid sell price.");
      return;
    }
    if (!sellLotDate) {
      setSellLotError("Choose a sell date.");
      return;
    }
    if (enteredQty - sellingLot.quantity > SHARE_FRACTION_TOLERANCE) {
      setSellLotError(`Sell quantity cannot exceed available lot quantity (${formatNumberMax2(sellingLot.quantity)}).`);
      return;
    }

    recordSellFromLot(symbol, sellingLot.id, enteredQty, enteredPrice, sellLotDate);
    void flushCurrentPortfolioSnapshotNow(true);
    closeLotSellDialog();
    closeLotEditor();
  }

  function saveLotEdit() {
    if (!editingLot) return;
    const nextQty = Number.parseFloat(lotQuantity);
    const nextPrice = Number.parseFloat(lotPrice);
    if (!lotDate || !Number.isFinite(nextQty) || nextQty <= 0 || !Number.isFinite(nextPrice) || nextPrice <= 0) {
      return;
    }
    if (editingLot.quantity - nextQty > SHARE_FRACTION_TOLERANCE) {
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
    if (!stock) return;

    const enteredQty = Number.parseFloat(qty);
    const enteredPrice = Number.parseFloat(price);
    if (!Number.isFinite(enteredQty) || enteredQty <= 0 || !Number.isFinite(enteredPrice) || enteredPrice <= 0 || !tradeDate) {
      return;
    }

    const normalizedQty = Math.abs(enteredQty);

    if (normalizedQty <= 0) return;

    recordTrade(symbol, "BUY", normalizedQty, enteredPrice, tradeDate, {
      account: tradeAccountName.trim() || undefined,
      isRetirementAccount:
        tradeAccountType === "unknown"
          ? null
          : tradeAccountType === "retirement",
    });
    void flushCurrentPortfolioSnapshotNow(true);
    setTradeModalOpen(false);
    setQty("");
    setPrice("");
    setTradeDate(new Date().toISOString().slice(0, 10));
    setSelectedTradeProfile(NEW_PROFILE_VALUE);
    setTradeAccountName("");
    setTradeAccountType("unknown");
  }

  async function handleOptimize() {
    setOptimizationMessage(null);
    const result = await optimizeStock(symbol);
    if (!result.ok) {
      setOptimizationMessage(result.error ?? `Unable to optimize ${symbol}.`);
      return;
    }
    const latest = usePortfolioStore.getState().stocks.find((item) => item.symbol === symbol.toUpperCase());
    const confirmationMessage = latest
      ? `Optimization completed for ${symbol.toUpperCase()}.\nSMA: ${latest.shortSMA} days • Rebuy factor: ${Math.round(latest.dynamicFactor)}%`
      : `Optimization completed for ${symbol.toUpperCase()}.`;
    setOptimizationMessage("Parameters optimized from historical data.");
    window.alert(confirmationMessage);
    await flushCurrentPortfolioSnapshotNow(true);
  }

  function handleSuppressTradeActionsChange(nextValue: boolean) {
    updateStock(symbol, { suppressTradeActions: nextValue });
    void flushCurrentPortfolioSnapshotNow(true);
  }

  function handleExcludeFromShortlistChange(nextValue: boolean) {
    updateStock(symbol, { excludeFromShortlist: nextValue, includeInShortlist: nextValue ? false : includeInShortlist });
    void flushCurrentPortfolioSnapshotNow(true);
  }

  function handleIncludeInShortlistChange(nextValue: boolean) {
    updateStock(symbol, { includeInShortlist: nextValue, excludeFromShortlist: nextValue ? false : excludeFromShortlist });
    void flushCurrentPortfolioSnapshotNow(true);
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
                    Record Buy Trade
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/72 p-2 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div>
                  <p className={cn("font-semibold text-foreground", dense ? "text-xs" : "text-sm")}>Price chart</p>
                  <p className={cn("text-subtle", dense ? "mt-0.5 text-[10px]" : "mt-0.5 text-[11px]")}>
                    Choose a range (1w–5y). The dashed line is your average cost when you hold a position.
                  </p>
                </div>
              </div>
              <StockHistoricalChart
                symbol={stock.symbol}
                smaPeriod={stock.shortSMA}
                averageCost={hasPosition && stock.averageCost > 0 ? stock.averageCost : null}
                points={pointsWithToday}
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
          <div className={cn("grid items-start", dense ? "gap-3" : "gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1.15fr)]")}>
            <div className={dense ? "space-y-3" : "space-y-3"}>
              <div className={cn(dense ? "space-y-3" : "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]")}>
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
                          label: "ROE",
                          value: stock.returnOnEquity != null ? formatPercent(stock.returnOnEquity * 100) : "—",
                        },
                        {
                          label: "Profit margin",
                          value: stock.profitMargin != null ? formatPercent(stock.profitMargin * 100) : "—",
                        },
                        { label: "P/E ratio", value: stock.trailingPE != null ? formatNumberMax2(stock.trailingPE) : "—" },
                        {
                          label: "Debt/Equity",
                          value: stock.debtToEquity != null ? formatNumberMax2(stock.debtToEquity) : "—",
                        },
                        {
                          label: "Dividend yield",
                          value: stock.dividendYield != null ? formatPercent(dividendYieldPercent(stock.dividendYield)) : "—",
                        },
                        {
                          label: "Payout ratio",
                          value: stock.payoutRatio != null ? formatPercent(payoutRatioDecimal(stock.payoutRatio) * 100) : "—",
                        },
                        {
                          label: "Analyst avg",
                          value: stock.analystAvg?.trim() || "—",
                          valueClassName: analystRatingTone(stock.analystAvg),
                        },
                        {
                          label: selectedTarget.value != null ? analystTargetSourceLabel(selectedTarget.tier) : "Analyst target",
                          value: selectedTarget.value != null ? formatCurrency(selectedTarget.value) : "—",
                          detail: formatUpsidePct(analystTargetUpsidePct(stock.lastPrice, selectedTarget.value)),
                          valueClassName: valueTone(analystTargetUpsidePct(stock.lastPrice, selectedTarget.value)),
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
                      <span>Score:</span>
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
                          <SnapshotRow compact={dense} label="Market cap" value={scoreRows.capLine} hint={scoreRows.capPoints} />
                          {scoreRows.qualityMetrics.length > 0 ? (
                            <>
                              <SnapshotRow compact={dense} label="Quality" hint={scoreRows.qualityPoints} />
                              {scoreRows.qualityMetrics.map((metric) => (
                                <SnapshotRow
                                  key={metric.label}
                                  compact={dense}
                                  indent
                                  nested
                                  label={metric.label}
                                  value={metric.value}
                                  hint={metric.points}
                                />
                              ))}
                            </>
                          ) : null}
                          {scoreRows.dividendBonusLine && scoreRows.dividendBonusPoints ? (
                            <SnapshotRow
                              compact={dense}
                              label="Dividend bonus"
                              value={scoreRows.dividendBonusLine}
                              hint={scoreRows.dividendBonusPoints}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>
              </div>

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

            <div className={dense ? "space-y-3" : "space-y-3"}>
              <SectionCard
                compact={dense}
                title={
                  <span className="flex items-center justify-between gap-3">
                  <span>Recommendation</span>
                  <span className="flex items-center gap-2">
                    {stock.pendingOptimization ? (
                      <button
                        type="button"
                        onClick={handleOptimize}
                        disabled={optimizing}
                        className={cn(
                          "ui-hover-pop inline-flex items-center gap-1.5 border font-semibold shadow-sm backdrop-blur-lg sm:gap-2 disabled:cursor-not-allowed disabled:opacity-60",
                          "border-primary/25 bg-primary/10 text-primary",
                          dense ? "rounded-lg px-2 py-1 text-[10px]" : "rounded-lg px-2.5 py-1.5 text-xs"
                        )}
                        aria-label="Optimize parameters"
                      >
                        {optimizing ? "Optimizing…" : "Optimize"}
                      </button>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 border border-emerald-500/25 bg-emerald-500/10 font-semibold text-emerald-700 shadow-sm backdrop-blur-lg dark:text-emerald-300 sm:gap-2",
                            dense ? "rounded-lg px-2 py-1 text-[10px]" : "rounded-lg px-2.5 py-1.5 text-xs"
                          )}
                          aria-label="Stock is optimized"
                        >
                          Optimized
                        </span>
                        <button
                          type="button"
                          onClick={handleOptimize}
                          disabled={optimizing}
                          className={cn(
                            "ui-hover-pop inline-flex items-center justify-center border border-primary/25 bg-primary/10 font-semibold text-primary shadow-sm backdrop-blur-lg disabled:cursor-not-allowed disabled:opacity-60",
                            dense ? "h-6 w-6 rounded-lg" : "h-7 w-7 rounded-lg"
                          )}
                          aria-label="Re-optimize parameters"
                          title={optimizing ? "Optimizing…" : "Re-optimize"}
                        >
                          <RefreshCw className={cn(dense ? "h-3.5 w-3.5" : "h-4 w-4", optimizing ? "animate-spin" : "")} />
                          <span className="sr-only">{optimizing ? "Optimizing…" : "Re-optimize"}</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setStrategyOpen(true)}
                      className={cn(
                          "ui-hover-pop inline-flex items-center gap-1.5 border border-white/45 bg-white/75 font-semibold text-foreground shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/[0.06] sm:gap-2",
                          dense ? "rounded-lg px-2 py-1 text-[10px]" : "rounded-lg px-2.5 py-1.5 text-xs"
                        )}
                        aria-label="Strategy"
                      >
                        <Settings className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        Strategy
                      </button>
                    </span>
                  </span>
                }
              >
                <div className={dense ? "space-y-3" : "space-y-3"}>
                  {optimizationMessage ? (
                    <p className={cn("text-subtle", dense ? "text-[11px]" : "text-xs")}>{optimizationMessage}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    {rec ? (
                      <p
                        className={cn(
                          "inline-flex rounded-lg border font-bold tracking-tight",
                          recommendationTone(rec.action),
                          dense ? "px-2.5 py-1 text-sm" : "px-3 py-1.5 text-lg"
                        )}
                      >
                        {rec.action}
                      </p>
                    ) : null}
                    {rec ? (
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        <input
                          type="checkbox"
                          checked={suppressTradeActions}
                          onChange={(e) => handleSuppressTradeActionsChange(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                          aria-label="Supress recommendation actions for this stock"
                        />
                        <span>
                          <span className={cn("block font-medium text-foreground", dense ? "text-[11px]" : "text-xs")}>
                            Supress recommendation actions for this stock
                          </span>
                          <span className="mt-0.5 block text-[11px] text-subtle">
                            Keeps the signal in WAIT while preserving targets and metrics.
                          </span>
                        </span>
                      </label>
                    ) : null}
                  </div>
                  {rec ? (
                    <>
                      <p className={cn("leading-snug", recommendationTextTone(rec.action), dense ? "text-sm" : "text-sm")}>{rec.comments}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setFlowChartOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-subtle hover:text-foreground",
                            dense ? "text-[11px]" : "text-xs"
                          )}
                        >
                          <Info className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
                          Flow chart
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecisionMapOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-subtle hover:text-foreground",
                            dense ? "text-[11px]" : "text-xs"
                          )}
                        >
                          <Info className={dense ? "h-3.5 w-3.5" : "h-4 w-4"} />
                          Decision map
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className={cn("text-subtle", dense ? "text-sm" : "text-base")}>
                      {excludeFromShortlist
                        ? "This stock is excluded from your shortlist, so no recommendation is generated."
                        : "No recommendation yet — refresh quotes from Portfolio or Dashboard."}
                    </p>
                  )}
                  {recommendationActionFactors.length > 0 ? (
                    <div className={cn("border-t border-border/60 dark:border-white/[0.06]", dense ? "pt-3" : "pt-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={cn("font-semibold text-foreground", dense ? "text-sm" : "text-base")}>Factors considered</p>
                        </div>
                        <span className={cn("font-medium text-subtle", dense ? "text-[10px]" : "text-xs")}>
                          {recommendationActionFactors.filter((factor) => factor.passes).length}/{recommendationActionFactors.length} passed
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {recommendationDecisionGroups.map((group) => (
                          <details key={group.title} className="rounded-md border border-border/70 px-2 py-1 dark:border-white/[0.08]">
                            <summary className="cursor-pointer text-xs font-semibold text-subtle">{group.title}</summary>
                            {group.description ? <p className="mt-1 text-[11px] text-subtle">{group.description}</p> : null}
                            <div className="mt-2 space-y-1.5">
                              {group.factors.map((factor) => (
                                <FactorFlagRow
                                  key={`${group.title}-${factor.label}-${factor.detail}`}
                                  compact={dense}
                                  label={factor.label}
                                  detail={factor.detail}
                                  passes={factor.passes}
                                />
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                compact={dense}
                title={
                  <span className="flex items-center justify-between gap-3">
                    <span>Generating Recommendations</span>
                    <span
                      className={cn(
                        "inline-flex rounded-lg border px-2.5 py-1 font-semibold tracking-tight",
                        isShortlistedForPortfolio
                          ? "border-emerald-500/30 bg-emerald-500/14 text-emerald-700 dark:text-emerald-300"
                          : "border-red-500/30 bg-red-500/14 text-red-700 dark:text-red-200",
                        dense ? "text-[10px]" : "text-xs"
                      )}
                    >
                      {isShortlistedForPortfolio ? "YES" : "NO"}
                    </span>
                  </span>
                }
              >
                <div className={dense ? "space-y-3" : "space-y-3"}>
                  <div>
                    <div className={cn(dense ? "space-y-1.5" : "space-y-1.5")}>
                      {shortlistFactors.map((factor, index) => (
                        <div key={`${factor.label}-${factor.detail}`}>
                          <FactorFlagRow
                            compact={dense}
                            label={factor.label}
                            detail={factor.detail}
                            passes={factor.passes}
                          />
                          {index === 0 && stock?.isETF !== true && shortlistFactors.length > 1 ? (
                            <p className={cn("py-0.5 text-center font-semibold tracking-wide text-subtle", dense ? "text-[10px]" : "text-xs")}>
                              OR
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  {shortlistReasons.length > 0 ? (
                    <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      {shortlistReasons.map((reason) => (
                        <p key={reason} className={cn("text-subtle", dense ? "text-[11px]" : "text-xs")}>
                          {reason}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {showIncludeToggle ? (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        checked={includeInShortlist}
                        onChange={(e) => handleIncludeInShortlistChange(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-emerald-600"
                        aria-label="Include in shortlist"
                      />
                      <span>
                        <span className={cn("block font-medium text-foreground", dense ? "text-[11px]" : "text-xs")}>
                          Include in shortlist
                        </span>
                        <span className="mt-0.5 block text-[11px] text-subtle">
                          Force include this stock in Top N shortlisting.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {canToggleShortlistExclusion ? (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        checked={excludeFromShortlist}
                        onChange={(e) => handleExcludeFromShortlistChange(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                        aria-label="Exclude from shortlist"
                      />
                      <span>
                        <span className={cn("block font-medium text-foreground", dense ? "text-[11px]" : "text-xs")}>
                          Exclude from shortlist
                        </span>
                        <span className="mt-0.5 block text-[11px] text-subtle">
                          Remove this stock from shortlisting and recommendations.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </div>

      <AppModal open={tradeModalOpen} onClose={() => setTradeModalOpen(false)} size="md" titleId="trade-modal-title">
        <ModalSection className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <div>
            <h3 id="trade-modal-title" className="text-base font-semibold tracking-tight text-foreground">
              Record Buy
            </h3>
            <p className="mt-0.5 text-xs text-subtle">
              Add a buy transaction for {stock.symbol}. Sell transactions are recorded from open lots.
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
        <ModalSection className="min-h-0 flex-1 space-y-4 px-4 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Quantity
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Quantity"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground dark:border-white/10"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Price
              <div className="flex gap-2">
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Price"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground dark:border-white/10"
                />
                <button
                  type="button"
                  onClick={() => setPrice(last > 0 ? last.toFixed(2) : "")}
                  disabled={last <= 0}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
                >
                  Current
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
              Trade Date
              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
              />
            </label>
          </div>

          <section className="rounded-2xl border border-border/80 bg-background/45 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h4 className="text-sm font-semibold text-foreground">Lot Details</h4>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                Use Existing Profile
                <select
                  value={selectedTradeProfile}
                  onChange={(e) => setSelectedTradeProfile(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
                >
                  <option value={NEW_PROFILE_VALUE}>Add New Account/Profile</option>
                  {savedTradeProfiles.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTradeProfile === NEW_PROFILE_VALUE ? (
                <>
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                    Account/Profile (optional)
                    <input
                      value={tradeAccountName}
                      onChange={(e) => setTradeAccountName(e.target.value)}
                      placeholder="Brokerage / IRA"
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                    Account Type
                    <select
                      value={tradeAccountType}
                      onChange={(e) => setTradeAccountType(e.target.value as "unknown" | "retirement" | "taxable")}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="retirement">Retirement</option>
                      <option value="taxable">Taxable</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Account/Profile</span>
                    <p className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10">
                      {selectedTradeProfile}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Account Type</span>
                    <p className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10">
                      {tradeAccountType === "unknown" ? "Unknown" : tradeAccountType === "retirement" ? "Retirement" : "Taxable"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
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
            disabled={qty.trim().length === 0 || price.trim().length === 0}
          >
            Save
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
              <table className="min-w-[820px] w-full text-left">
                <thead className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-subtle dark:border-white/[0.06]">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Bought</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Qty</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Cost/share</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Basis</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Value</th>
                    <th className="pb-2 pr-3 text-right font-semibold">P/L</th>
                    <th className="pb-2 pr-3 font-semibold">Account type</th>
                    <th className="pb-2 pr-3 font-semibold">Account</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Action</th>
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
                        <td className="py-2 pr-3 text-sm text-subtle">{lot.account?.trim() || "—"}</td>
                        <td className="py-2 pr-3 text-right">
                          <button
                            type="button"
                            onClick={() => openLotSellDialog(lot)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-300/30 dark:text-red-200 dark:hover:bg-red-500/10"
                          >
                            Sell
                          </button>
                        </td>
                        <td className="py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openLotEditor(lot)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-xs text-foreground hover:bg-background/70 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestLotDelete(lot.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-300/30 dark:text-red-200 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
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

      <AppModal open={lotPendingDelete != null} onClose={cancelLotDelete} size="md" titleId="delete-lot-modal-title">
        <ModalSection className="border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <h3 id="delete-lot-modal-title" className="text-base font-semibold tracking-tight text-foreground">
            Delete Lot
          </h3>
        </ModalSection>
        <ModalSection className="space-y-3 px-4 py-4 text-sm text-foreground">
          <p>
            {lotPendingDelete
              ? `Delete ${formatNumberMax2(lotPendingDelete.quantity)} shares from ${formatDateLabel(lotPendingDelete.purchaseDate)} @ ${formatCurrency(lotPendingDelete.costBasis)}?`
              : "Delete this lot?"}
          </p>
          <div className="rounded-lg border border-red-300/50 bg-red-50/60 px-3 py-3 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
            Deleting a lot does not add cash to cash balance. If this is a real sale, use Sell from this lot instead. Delete only for intentional data correction.
          </div>
        </ModalSection>
        <ModalSection className="flex items-center justify-end gap-2 border-t border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <button
            type="button"
            onClick={cancelLotDelete}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-background/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmLotDelete}
            className="rounded-lg border border-red-500/40 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Delete lot
          </button>
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
          <div className="rounded-lg border border-red-300/50 bg-red-50/60 px-3 py-3 dark:border-red-400/20 dark:bg-red-500/10">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-red-700 dark:text-red-200">Lot sell action</p>
            <p className="mt-1 text-xs text-red-700/90 dark:text-red-200/90">
              Record a SELL from this lot only. Quantity is validated against this lot&apos;s available shares.
            </p>
            <button
              type="button"
              onClick={() => editingLot && openLotSellDialog(editingLot)}
              className="mt-3 inline-flex items-center rounded-lg border border-red-300/70 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-300/30 dark:text-red-200 dark:hover:bg-red-500/20"
            >
              Sell from this lot
            </button>
          </div>
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

      <AppModal open={sellingLot != null} onClose={closeLotSellDialog} size="md" titleId="sell-lot-modal-title">
        <ModalSection className="border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <h3 id="sell-lot-modal-title" className="text-base font-semibold tracking-tight text-foreground">
            Sell From Open Lot
          </h3>
          {sellingLot ? (
            <p className="mt-1 text-xs text-subtle">
              Available: {formatNumberMax2(sellingLot.quantity)} shares from {formatDateLabel(sellingLot.purchaseDate)} @ {formatCurrency(sellingLot.costBasis)}
            </p>
          ) : null}
        </ModalSection>
        <ModalSection className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-foreground">
              <span>Sell quantity</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={sellLotQty}
                onChange={(e) => {
                  setSellLotQty(e.target.value);
                  setSellLotError(null);
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="space-y-1 text-sm text-foreground">
              <span>Sell price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellLotPrice}
                onChange={(e) => {
                  setSellLotPrice(e.target.value);
                  setSellLotError(null);
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm text-foreground">
            <span>Sell date</span>
            <input
              type="date"
              value={sellLotDate}
              onChange={(e) => {
                setSellLotDate(e.target.value);
                setSellLotError(null);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          {sellLotError ? (
            <div className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-300/25 dark:bg-red-500/10 dark:text-red-200">
              {sellLotError}
            </div>
          ) : null}
        </ModalSection>
        <ModalSection className="flex items-center justify-end gap-2 border-t border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <button
            type="button"
            onClick={closeLotSellDialog}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-background/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveLotSell}
            className={cn(appCtaButton("ui-hover-spotlight rounded-lg px-3 py-2 text-sm"), "disabled:opacity-50")}
            disabled={(Number.parseFloat(sellLotQty) || 0) <= 0 || (Number.parseFloat(sellLotPrice) || 0) <= 0}
          >
            Save Sell
          </button>
        </ModalSection>
      </AppModal>

      <AppModal open={decisionMapOpen} onClose={() => setDecisionMapOpen(false)} size="md" titleId="decision-map-modal-title">
        <ModalSection className="border-b border-border bg-elevated px-4 py-3 dark:border-foreground/10">
          <h3 id="decision-map-modal-title" className="text-base font-semibold tracking-tight text-foreground">
            Decision Map
          </h3>
          <p className="mt-1 text-xs text-subtle">Color shows what is supporting or blocking this stock&apos;s current recommendation.</p>
        </ModalSection>
        <ModalSection className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-subtle"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Supporting</span>
            <span className="inline-flex items-center gap-1 text-subtle"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Blocking</span>
          </div>
          <div className="space-y-2">
            {recommendationDecisionGroups.map((group) => {
              const blocking = group.factors.some((factor) => !factor.passes);
              return (
                <div key={`decision-map-${group.title}`} className="rounded-lg border border-border/70 px-3 py-2 dark:border-white/[0.08]">
                  <div className="mb-1 inline-flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", blocking ? "bg-red-500" : "bg-emerald-500")} />
                    <p className="text-xs font-semibold text-foreground">{group.title}</p>
                  </div>
                  <div className="space-y-1">
                    {group.factors.map((factor) => (
                      <p
                        key={`decision-map-factor-${group.title}-${factor.label}-${factor.detail}`}
                        className={cn("text-[11px]", factor.passes ? "text-subtle" : "text-red-400")}
                      >
                        • {factor.label}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ModalSection>
      </AppModal>

      <AppModal
        open={flowChartOpen}
        onClose={() => setFlowChartOpen(false)}
        size="xl"
        panelClassName="h-[94vh] max-w-[min(98vw,1320px)]"
        shellClassName="sm:p-2"
        titleId="flowchart-modal-title"
      >
        <ModalSection className="border-b border-border bg-elevated px-4 py-3 sm:px-5 sm:py-3.5 dark:border-foreground/10">
          <h3 id="flowchart-modal-title" className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Recommendation Flow
          </h3>
          <p className="mt-1 text-xs text-subtle sm:text-sm">Schematic flow for how this stock reaches its current recommendation.</p>
        </ModalSection>
        <ModalSection className="min-h-0 flex-1 space-y-2 px-3 py-3 sm:px-5 sm:py-4">
          <RecommendationFlowSvgDiagram stock={stock} recommendation={rec} />
        </ModalSection>
      </AppModal>

      <StockStrategyModal
        open={strategyOpen}
        onClose={() => setStrategyOpen(false)}
        stock={stock}
        etfProfitTarget={etfProfitTarget}
        stockProfitTarget={stockProfitTarget}
        portfolioSize={portfolioSize}
        limitWatchlistSize={limitWatchlistSize}
        activeStockCount={Math.max(
          stocks.filter((s) => s.excludeFromShortlist !== true && (s.quantity > 0 || s.isETF === true || true)).length,
          1
        )}
        onSave={(patch) => {
          updateStock(symbol, patch);
        }}
      />
    </div>
  );
}

const ADD_FACTOR_LABELS = new Set([
  "Price below",
  "Min Score > 50",
  "Expected return > 25%",
  "AI sentiment",
  "RSI gate",
  "RSI reversal",
  "RSI overbought",
  "RSI not blocking",
  "Holding size within limits",
  "Wash sale clear",
  "Eligible to ADD",
  "Cash for at least 1 share",
]);

const REDUCE_FACTOR_LABELS = new Set([
  "Cost basis above limit",
  "Excess investment is significant (> Transaction limit)?",
  "Unrealized gain sufficient to reduce",
  "Score < 70",
]);

function labelIn(set: Set<string>, label: string): boolean {
  for (const prefix of set) {
    if (label === prefix || label.startsWith(prefix)) return true;
  }
  return false;
}

type RecFactor = { label: string; detail: string; passes: boolean };

function selectiveWaitFactors(
  factors: RecFactor[],
  includePassingLabels: Set<string> = new Set()
): RecFactor[] {
  const selected: RecFactor[] = [];
  const seen = new Set<string>();

  for (const factor of factors) {
    if (!factor.passes && !seen.has(factor.label)) {
      selected.push(factor);
      seen.add(factor.label);
    }
  }

  for (const factor of factors) {
    if (factor.passes && includePassingLabels.has(factor.label) && !seen.has(factor.label)) {
      selected.push(factor);
      seen.add(factor.label);
    }
  }

  if (selected.length === 0) return factors.slice(0, 3);
  return selected;
}

function sellFromWaitFactors({
  stock,
  rec,
  limitWatchlistSize,
  enableRiskFilter,
  useMarketRegimeCashTilt,
  marketOutlookPrefersCash,
  marketOutlookCashTargetPct,
  cashEquivalentBalance,
  portfolioSize,
}: {
  stock:
    | {
        symbol: string;
        quantity: number;
        averageCost: number;
        lastPrice?: number;
    shortSMA: number;
    score?: number;
    isETF?: boolean;
    analystTarget?: number;
    analystTargetLow?: number;
    analystTargetMedian?: number;
    analystTargetHigh?: number;
    analystTargetMean?: number;
    isInWatchlistSize?: boolean;
    excludeFromShortlist?: boolean;
  }
    | undefined;
  rec: { movingAvg: number } | undefined;
  limitWatchlistSize: boolean;
  enableRiskFilter: boolean;
  useMarketRegimeCashTilt: boolean;
  marketOutlookPrefersCash: boolean;
  marketOutlookCashTargetPct?: number;
  cashEquivalentBalance: number;
  portfolioSize: number;
}): RecFactor[] {
  if (!stock || !rec) return [];
  if (stock.quantity <= 0 || stock.isETF === true) return [];

  const filtersOn = limitWatchlistSize && enableRiskFilter;
  const outlookRaiseCashEnabled = useMarketRegimeCashTilt && marketOutlookPrefersCash;
  if (!filtersOn && !outlookRaiseCashEnabled) return [];

  const currentPrice = stock.lastPrice ?? 0;
  const avgPrice = stock.averageCost ?? 0;
  const gainPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
  const selectedTarget = selectedAnalystTarget(stock);
  const upside =
    selectedTarget.value != null && currentPrice > 0
      ? ((selectedTarget.value - currentPrice) / currentPrice) * 100
      : 0;
  const outside =
    filtersOn &&
    stock.excludeFromShortlist !== true &&
    stock.isInWatchlistSize === false;
  const aboveSMA = rec.movingAvg > 0 && currentPrice > rec.movingAvg;
  const cashShare = portfolioSize > 0 ? cashEquivalentBalance / portfolioSize : 1;
  const cashFloor = outlookRaiseCashEnabled ? Math.max(0.2, (marketOutlookCashTargetPct ?? 20) / 100) : 0.2;
  const cashNeedsRaise = cashShare < cashFloor;

  const factors: RecFactor[] = [];

  if (outside) {
    factors.push({
      label: "Outside shortlist and risk gates",
      detail: "Not in the current shortlist",
      passes: true,
    });
    factors.push({
      label: `Price above ${stock.shortSMA}-day SMA`,
      detail: rec.movingAvg > 0 ? `${formatCurrency(currentPrice)} vs ${formatCurrency(rec.movingAvg)}` : "SMA unavailable",
      passes: aboveSMA,
    });
    factors.push({
      label: "Gain beats leftover upside",
      detail: `${gainPct.toFixed(1)}% vs ${upside.toFixed(1)}%`,
      passes: gainPct > upside,
    });
  }

  if (outlookRaiseCashEnabled && cashNeedsRaise) {
    factors.push({
      label: "Need to increase cash per market outlook",
      detail: `Have ${(cashShare * 100).toFixed(1)}%, need ${(cashFloor * 100).toFixed(0)}%`,
      passes: true,
    });
  }

  return factors;
}

function recommendationFactorGroups(
  action: string,
  factors: RecFactor[],
  context: {
    hasPosition: boolean;
    hasOversizePosition: boolean;
    recComments: string;
    sellFromWaitFactors: RecFactor[];
  }
) {
  const normalized = action.toUpperCase();
  if (normalized === "BUY" || normalized === "ADD" || normalized === "SELL" || normalized === "REDUCE") {
    const title = normalized === "BUY" ? "Buy path" : normalized === "ADD" ? "Add path" : normalized === "SELL" ? "Sell path" : "Reduce path";
    return [{ title, description: null as string | null, factors }];
  }
  if (normalized === "WAIT_ADD" || normalized === "WAIT_REDUCE") {
    const groups: Array<{ title: string; description: string | null; factors: RecFactor[] }> = [];
    const common = factors.filter((factor) => !labelIn(ADD_FACTOR_LABELS, factor.label) && !REDUCE_FACTOR_LABELS.has(factor.label));
    const addPath = factors.filter((factor) => labelIn(ADD_FACTOR_LABELS, factor.label));
    const reducePath = context.hasPosition ? factors.filter((factor) => REDUCE_FACTOR_LABELS.has(factor.label)) : [];
    const showReduceGroup = context.hasPosition && (context.hasOversizePosition || normalized === "WAIT_REDUCE" || context.recComments.includes("REDUCE"));
    const commonForWait = selectiveWaitFactors(common, new Set([
      "User override: Excluded from Shortlist",
      "Trade actions enabled",
      "Long-term sale qualified",
    ]));
    if (commonForWait.length > 0) {
      groups.push({ title: "Common gates", description: "Shared checks that apply regardless of price direction.", factors: commonForWait });
    }
    const addForWait = selectiveWaitFactors(addPath, new Set([
      "Price below next buy target",
      "Holding limit OK",
      "Wash sale clear",
    ]));
    if (addForWait.length > 0) {
      groups.push({
        title: "For Adding more stocks (price weakness)",
        description: "Averaging-down checks used when price pulls back to your buy zone.",
        factors: addForWait,
      });
    }
    const reduceForWait = selectiveWaitFactors(reducePath, new Set([
      "Cost basis above limit",
      "Unrealized gain sufficient to reduce",
    ]));
    if (showReduceGroup && reduceForWait.length > 0) {
      groups.push({
        title: "For reducing holding size (oversize + profit)",
        description: "Trim checks used when position size is high and gains are sufficient.",
        factors: reduceForWait,
      });
    }
    const sellForWait = selectiveWaitFactors(context.sellFromWaitFactors, new Set([
      "Outside shortlist and risk gates",
      "Need to increase cash per market outlook",
    ]));
    if (sellForWait.length > 0) {
      groups.push({
        title: "For selling the position",
        description:
          "A WAIT holding can become a full sale when it is outside the shortlist, price is above the moving average, and gain beats leftover upside, or when cash is below the floor in cash-first regimes.",
        factors: sellForWait,
      });
    }
    return groups;
  }
  return [{ title: "Active path", description: null as string | null, factors }];
}

type FlowHighlightData = {
  activeNodes: Set<string>;
  activeEdges: Set<string>;
  finalNode: string;
  shortlistOverlayTriggered: boolean;
  marketOverlayTriggered: boolean;
};

function buildRecommendationFlowHighlight(
  stock: StockHolding | undefined,
  recommendation: { action?: string; comments?: string } | undefined
): FlowHighlightData {
  const activeNodes = new Set<string>(["start_a", "decision_b", "overlay_p", "overlay_q", "final_r"]);
  const activeEdges = new Set<string>(["a_to_b", "p_to_q", "q_to_r"]);
  const action = (recommendation?.action ?? "").toUpperCase();
  const lowerComment = (recommendation?.comments ?? "").toLowerCase();
  const shortlistOverlayTriggered = lowerComment.includes("outside shortlist") || lowerComment.includes("shortlist/risk");
  const marketOverlayTriggered = lowerComment.includes("market outlook is") || lowerComment.includes("need to increase cash");

  if (stock?.suppressTradeActions === true) {
    activeNodes.add("wait_override");
    activeEdges.add("b_yes_to_wait_override");
    activeEdges.add("wait_override_to_p");
    return {
      activeNodes,
      activeEdges,
      finalNode: "wait_override",
      shortlistOverlayTriggered,
      marketOverlayTriggered,
    };
  }

  if (lowerComment.includes("insufficient historical data") || lowerComment.includes("loading historical data")) {
    activeNodes.add("decision_c");
    activeNodes.add("wait_history");
    activeEdges.add("b_no_to_c");
    activeEdges.add("c_no_to_wait_history");
    activeEdges.add("wait_history_to_p");
    return {
      activeNodes,
      activeEdges,
      finalNode: "wait_history",
      shortlistOverlayTriggered,
      marketOverlayTriggered,
    };
  }

  activeNodes.add("decision_c");
  activeNodes.add("levels_d");
  activeNodes.add("decision_e");
  activeEdges.add("b_no_to_c");
  activeEdges.add("c_yes_to_d");
  activeEdges.add("d_to_e");

  const hasPosition = (stock?.quantity ?? 0) > 0;

  if (!hasPosition) {
    activeNodes.add("decision_f");
    activeEdges.add("e_no_to_f");
    if (action === "BUY") {
      activeNodes.add("buy");
      activeEdges.add("f_yes_to_buy");
      activeEdges.add("buy_to_p");
      return { activeNodes, activeEdges, finalNode: "buy", shortlistOverlayTriggered, marketOverlayTriggered };
    }
    activeNodes.add("wait_buy");
    activeEdges.add("f_no_to_wait_buy");
    activeEdges.add("wait_buy_to_p");
    return { activeNodes, activeEdges, finalNode: "wait_buy", shortlistOverlayTriggered, marketOverlayTriggered };
  }

  activeNodes.add("decision_i");
  activeEdges.add("e_yes_to_i");

  if (action === "SELL") {
    activeNodes.add("sell_reduce");
    activeEdges.add("i_yes_to_sell_reduce");
    activeEdges.add("sell_reduce_to_p");
    return { activeNodes, activeEdges, finalNode: "sell_reduce", shortlistOverlayTriggered, marketOverlayTriggered };
  }

  if (action === "REDUCE") {
    const reduceFromSizePath =
      lowerComment.includes("consider diversifying") ||
      lowerComment.includes("trim") ||
      lowerComment.includes("position is above stock limit");
    if (reduceFromSizePath) {
      activeNodes.add("decision_k");
      activeNodes.add("decision_m");
      activeNodes.add("reduce");
      activeEdges.add("i_no_to_k");
      activeEdges.add("k_no_to_m");
      activeEdges.add("m_yes_to_reduce");
      activeEdges.add("reduce_to_p");
      return { activeNodes, activeEdges, finalNode: "reduce", shortlistOverlayTriggered, marketOverlayTriggered };
    }
    activeNodes.add("sell_reduce");
    activeEdges.add("i_yes_to_sell_reduce");
    activeEdges.add("sell_reduce_to_p");
    return { activeNodes, activeEdges, finalNode: "sell_reduce", shortlistOverlayTriggered, marketOverlayTriggered };
  }

  if (action === "ADD") {
    activeNodes.add("decision_k");
    activeNodes.add("add");
    activeEdges.add("i_no_to_k");
    activeEdges.add("k_yes_to_add");
    activeEdges.add("add_to_p");
    return { activeNodes, activeEdges, finalNode: "add", shortlistOverlayTriggered, marketOverlayTriggered };
  }

  activeNodes.add("decision_k");
  activeNodes.add("decision_m");
  activeNodes.add("wait_hold");
  activeEdges.add("i_no_to_k");
  activeEdges.add("k_no_to_m");
  activeEdges.add("m_no_to_wait_hold");
  activeEdges.add("wait_hold_to_p");
  return { activeNodes, activeEdges, finalNode: "wait_hold", shortlistOverlayTriggered, marketOverlayTriggered };
}

function RecommendationFlowSvgDiagram({
  stock,
  recommendation,
}: {
  stock: StockHolding | undefined;
  recommendation: { action?: string; comments?: string } | undefined;
}) {
  const flow = buildRecommendationFlowHighlight(stock, recommendation);
  const ACTIVE = "#60a5fa";
  const OVERLAY = "#f59e0b";
  const FINAL_GO = "#10b981";
  const FINAL_WAIT = "#f87171";

  const isWaitFinal = flow.finalNode === "wait_buy" || flow.finalNode === "wait_hold" || flow.finalNode === "wait_override" || flow.finalNode === "wait_history";
  const finalColor = isWaitFinal ? FINAL_WAIT : FINAL_GO;
  const isNodeVisible = (nodeId: string) => flow.activeNodes.has(nodeId);
  const edgeColor = (edgeId: string) => {
    if (!flow.activeEdges.has(edgeId)) return "transparent";
    if (flow.marketOverlayTriggered && (edgeId === "p_to_q" || edgeId === "q_to_r")) return OVERLAY;
    if (flow.shortlistOverlayTriggered && edgeId.endsWith("_to_p")) return OVERLAY;
    return ACTIVE;
  };
  const edgeWidth = (edgeId: string) => (flow.activeEdges.has(edgeId) ? 2 : 1);
  const nodeStroke = (nodeId: string) => {
    if (nodeId === flow.finalNode) return finalColor;
    if (nodeId === "overlay_p" && flow.shortlistOverlayTriggered) return OVERLAY;
    if (nodeId === "overlay_q" && flow.marketOverlayTriggered) return OVERLAY;
    if (flow.activeNodes.has(nodeId)) return ACTIVE;
    return "transparent";
  };
  const nodeStrokeWidth = (nodeId: string) => (nodeStroke(nodeId) ? 2 : 1);
  const nodeFill = (nodeId: string, defaultFill: string) => {
    if (!isNodeVisible(nodeId)) return "transparent";
    if (nodeId === flow.finalNode) return isWaitFinal ? "rgba(248,113,113,0.16)" : "rgba(16,185,129,0.18)";
    if (nodeId === "overlay_p" && flow.shortlistOverlayTriggered) return "rgba(245,158,11,0.14)";
    if (nodeId === "overlay_q" && flow.marketOverlayTriggered) return "rgba(245,158,11,0.14)";
    if (flow.activeNodes.has(nodeId)) return "rgba(96,165,250,0.14)";
    return defaultFill;
  };
  const textFill = (nodeId: string, fill: string) => (isNodeVisible(nodeId) ? fill : "transparent");

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2 dark:border-white/[0.08]">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-subtle sm:text-xs">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Active path</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Final action</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Final wait</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Overlay trigger</span>
      </div>
      <div className="h-[70vh] overflow-auto rounded-md border border-border/50 bg-background/30 p-1.5 sm:h-[74vh] sm:p-2 dark:border-white/[0.08]">
      <svg viewBox="0 0 740 1020" className="mx-auto h-auto w-full max-w-[980px]">
        <defs>
          <marker id="arrowHeadRec" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
          </marker>
        </defs>

        <rect x="220" y="12" width="260" height="42" rx="8" fill={nodeFill("start_a", "rgba(148,163,184,0.10)")} stroke={nodeStroke("start_a") ?? "#94a3b8"} strokeWidth={nodeStrokeWidth("start_a")} />
        <text x="232" y="30" fontSize="11" fill={textFill("start_a", "currentColor")} fontWeight="600">A. Start</text>
        <text x="232" y="44" fontSize="10" fill={textFill("start_a", "#94a3b8")}>Live price + latest data loaded</text>
        <line x1="350" y1="54" x2="350" y2="82" stroke={edgeColor("a_to_b")} strokeWidth={edgeWidth("a_to_b")} markerEnd="url(#arrowHeadRec)" />

        <polygon points="350,86 410,112 350,138 290,112" fill={nodeFill("decision_b", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_b") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_b")} />
        <text x="350" y="110" textAnchor="middle" fontSize="10" fill={textFill("decision_b", "currentColor")} fontWeight="600">B. Excluded or suppressed?</text>
        <line x1="294" y1="112" x2="150" y2="140" stroke={edgeColor("b_yes_to_wait_override")} strokeWidth={edgeWidth("b_yes_to_wait_override")} markerEnd="url(#arrowHeadRec)" />
        <text x="210" y="118" fontSize="9" fill={flow.activeEdges.has("b_yes_to_wait_override") ? "#94a3b8" : "transparent"}>Yes</text>
        <line x1="350" y1="138" x2="350" y2="162" stroke={edgeColor("b_no_to_c")} strokeWidth={edgeWidth("b_no_to_c")} markerEnd="url(#arrowHeadRec)" />
        <text x="358" y="154" fontSize="9" fill={flow.activeEdges.has("b_no_to_c") ? "#94a3b8" : "transparent"}>No</text>

        <rect x="48" y="142" width="204" height="44" rx="8" fill={nodeFill("wait_override", "rgba(239,68,68,0.12)")} stroke={nodeStroke("wait_override") ?? "#f87171"} strokeWidth={nodeStrokeWidth("wait_override")} />
        <text x="60" y="160" fontSize="11" fill={textFill("wait_override", "#f87171")} fontWeight="700">WAIT</text>
        <text x="60" y="174" fontSize="10" fill={textFill("wait_override", "currentColor")}>No action due to your override</text>

        <polygon points="350,166 410,192 350,218 290,192" fill={nodeFill("decision_c", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_c") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_c")} />
        <text x="350" y="196" textAnchor="middle" fontSize="10" fill={textFill("decision_c", "currentColor")} fontWeight="600">C. Enough price history?</text>
        <line x1="294" y1="192" x2="150" y2="220" stroke={edgeColor("c_no_to_wait_history")} strokeWidth={edgeWidth("c_no_to_wait_history")} markerEnd="url(#arrowHeadRec)" />
        <text x="212" y="198" fontSize="9" fill={flow.activeEdges.has("c_no_to_wait_history") ? "#94a3b8" : "transparent"}>No</text>
        <line x1="350" y1="218" x2="350" y2="244" stroke={edgeColor("c_yes_to_d")} strokeWidth={edgeWidth("c_yes_to_d")} markerEnd="url(#arrowHeadRec)" />
        <text x="358" y="236" fontSize="9" fill={flow.activeEdges.has("c_yes_to_d") ? "#94a3b8" : "transparent"}>Yes</text>

        <rect x="48" y="222" width="204" height="44" rx="8" fill={nodeFill("wait_history", "rgba(239,68,68,0.12)")} stroke={nodeStroke("wait_history") ?? "#f87171"} strokeWidth={nodeStrokeWidth("wait_history")} />
        <text x="60" y="240" fontSize="11" fill={textFill("wait_history", "#f87171")} fontWeight="700">WAIT</text>
        <text x="60" y="254" fontSize="10" fill={textFill("wait_history", "currentColor")}>Need more historical data</text>

        <rect x="200" y="248" width="300" height="52" rx="8" fill={nodeFill("levels_d", "rgba(148,163,184,0.10)")} stroke={nodeStroke("levels_d") ?? "#94a3b8"} strokeWidth={nodeStrokeWidth("levels_d")} />
        <text x="212" y="268" fontSize="11" fill={textFill("levels_d", "currentColor")} fontWeight="600">D. Compute key levels</text>
        <text x="212" y="282" fontSize="10" fill={textFill("levels_d", "#94a3b8")}>SMA, next buy, selected target, upside %</text>
        <line x1="350" y1="300" x2="350" y2="326" stroke={edgeColor("d_to_e")} strokeWidth={edgeWidth("d_to_e")} markerEnd="url(#arrowHeadRec)" />

        <polygon points="350,330 410,356 350,382 290,356" fill={nodeFill("decision_e", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_e") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_e")} />
        <text x="350" y="360" textAnchor="middle" fontSize="10" fill={textFill("decision_e", "currentColor")} fontWeight="600">E. Holding shares now?</text>

        <line x1="294" y1="356" x2="210" y2="384" stroke={edgeColor("e_no_to_f")} strokeWidth={edgeWidth("e_no_to_f")} markerEnd="url(#arrowHeadRec)" />
        <text x="246" y="352" fontSize="9" fill={flow.activeEdges.has("e_no_to_f") ? "#94a3b8" : "transparent"}>No</text>
        <line x1="406" y1="356" x2="490" y2="384" stroke={edgeColor("e_yes_to_i")} strokeWidth={edgeWidth("e_yes_to_i")} markerEnd="url(#arrowHeadRec)" />
        <text x="430" y="352" fontSize="9" fill={flow.activeEdges.has("e_yes_to_i") ? "#94a3b8" : "transparent"}>Yes</text>

        <polygon points="210,388 270,414 210,440 150,414" fill={nodeFill("decision_f", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_f") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_f")} />
        <text x="210" y="412" textAnchor="middle" fontSize="10" fill={textFill("decision_f", "currentColor")} fontWeight="600">F. Price ≤ SMA + entry gates?</text>
        <line x1="154" y1="414" x2="112" y2="444" stroke={edgeColor("f_yes_to_buy")} strokeWidth={edgeWidth("f_yes_to_buy")} markerEnd="url(#arrowHeadRec)" />
        <text x="134" y="422" fontSize="9" fill={flow.activeEdges.has("f_yes_to_buy") ? "#94a3b8" : "transparent"}>Yes</text>
        <line x1="266" y1="414" x2="310" y2="444" stroke={edgeColor("f_no_to_wait_buy")} strokeWidth={edgeWidth("f_no_to_wait_buy")} markerEnd="url(#arrowHeadRec)" />
        <text x="270" y="422" fontSize="9" fill={flow.activeEdges.has("f_no_to_wait_buy") ? "#94a3b8" : "transparent"}>No</text>

        <rect x="34" y="448" width="156" height="44" rx="8" fill={nodeFill("buy", "rgba(16,185,129,0.16)")} stroke={nodeStroke("buy") ?? "#10b981"} strokeWidth={nodeStrokeWidth("buy")} />
        <text x="46" y="466" fontSize="11" fill={textFill("buy", "#10b981")} fontWeight="700">BUY</text>
        <text x="46" y="480" fontSize="10" fill={textFill("buy", "currentColor")}>Entry gates passed</text>
        <rect x="232" y="448" width="156" height="44" rx="8" fill={nodeFill("wait_buy", "rgba(239,68,68,0.12)")} stroke={nodeStroke("wait_buy") ?? "#f87171"} strokeWidth={nodeStrokeWidth("wait_buy")} />
        <text x="244" y="466" fontSize="11" fill={textFill("wait_buy", "#f87171")} fontWeight="700">WAIT_BUY</text>
        <text x="244" y="480" fontSize="10" fill={textFill("wait_buy", "currentColor")}>Entry conditions pending</text>

        <polygon points="490,388 550,414 490,440 430,414" fill={nodeFill("decision_i", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_i") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_i")} />
        <text x="490" y="412" textAnchor="middle" fontSize="10" fill={textFill("decision_i", "currentColor")} fontWeight="600">I. RSI sell / target-hit sell?</text>
        <line x1="434" y1="414" x2="410" y2="444" stroke={edgeColor("i_yes_to_sell_reduce")} strokeWidth={edgeWidth("i_yes_to_sell_reduce")} markerEnd="url(#arrowHeadRec)" />
        <text x="422" y="422" fontSize="9" fill={flow.activeEdges.has("i_yes_to_sell_reduce") ? "#94a3b8" : "transparent"}>Yes</text>
        <line x1="546" y1="414" x2="570" y2="444" stroke={edgeColor("i_no_to_k")} strokeWidth={edgeWidth("i_no_to_k")} markerEnd="url(#arrowHeadRec)" />
        <text x="548" y="422" fontSize="9" fill={flow.activeEdges.has("i_no_to_k") ? "#94a3b8" : "transparent"}>No</text>

        <rect x="330" y="448" width="160" height="44" rx="8" fill={nodeFill("sell_reduce", "rgba(16,185,129,0.16)")} stroke={nodeStroke("sell_reduce") ?? "#10b981"} strokeWidth={nodeStrokeWidth("sell_reduce")} />
        <text x="342" y="466" fontSize="11" fill={textFill("sell_reduce", "#10b981")} fontWeight="700">SELL / REDUCE</text>
        <text x="342" y="480" fontSize="10" fill={textFill("sell_reduce", "currentColor")}>Profit-taking condition hit</text>

        <polygon points="570,448 630,474 570,500 510,474" fill={nodeFill("decision_k", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_k") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_k")} />
        <text x="570" y="472" textAnchor="middle" fontSize="10" fill={textFill("decision_k", "currentColor")} fontWeight="600">K. Price ≤ next buy + add gates?</text>
        <line x1="514" y1="474" x2="490" y2="504" stroke={edgeColor("k_yes_to_add")} strokeWidth={edgeWidth("k_yes_to_add")} markerEnd="url(#arrowHeadRec)" />
        <text x="500" y="482" fontSize="9" fill={flow.activeEdges.has("k_yes_to_add") ? "#94a3b8" : "transparent"}>Yes</text>
        <line x1="626" y1="474" x2="650" y2="504" stroke={edgeColor("k_no_to_m")} strokeWidth={edgeWidth("k_no_to_m")} markerEnd="url(#arrowHeadRec)" />
        <text x="626" y="482" fontSize="9" fill={flow.activeEdges.has("k_no_to_m") ? "#94a3b8" : "transparent"}>No</text>

        <rect x="412" y="508" width="156" height="44" rx="8" fill={nodeFill("add", "rgba(16,185,129,0.16)")} stroke={nodeStroke("add") ?? "#10b981"} strokeWidth={nodeStrokeWidth("add")} />
        <text x="424" y="526" fontSize="11" fill={textFill("add", "#10b981")} fontWeight="700">ADD</text>
        <text x="424" y="540" fontSize="10" fill={textFill("add", "currentColor")}>Averaging-down entry</text>

        <polygon points="650,508 710,534 650,560 590,534" fill={nodeFill("decision_m", "rgba(245,158,11,0.14)")} stroke={nodeStroke("decision_m") ?? "#f59e0b"} strokeWidth={nodeStrokeWidth("decision_m")} />
        <text x="650" y="532" textAnchor="middle" fontSize="10" fill={textFill("decision_m", "currentColor")} fontWeight="600">M. Oversize + trim gates pass?</text>
        <line x1="594" y1="534" x2="560" y2="564" stroke={edgeColor("m_yes_to_reduce")} strokeWidth={edgeWidth("m_yes_to_reduce")} markerEnd="url(#arrowHeadRec)" />
        <text x="576" y="542" fontSize="9" fill={flow.activeEdges.has("m_yes_to_reduce") ? "#94a3b8" : "transparent"}>Yes</text>
        <line x1="706" y1="534" x2="710" y2="564" stroke={edgeColor("m_no_to_wait_hold")} strokeWidth={edgeWidth("m_no_to_wait_hold")} markerEnd="url(#arrowHeadRec)" />
        <text x="704" y="542" fontSize="9" fill={flow.activeEdges.has("m_no_to_wait_hold") ? "#94a3b8" : "transparent"}>No</text>

        <rect x="482" y="568" width="156" height="44" rx="8" fill={nodeFill("reduce", "rgba(16,185,129,0.16)")} stroke={nodeStroke("reduce") ?? "#10b981"} strokeWidth={nodeStrokeWidth("reduce")} />
        <text x="494" y="586" fontSize="11" fill={textFill("reduce", "#10b981")} fontWeight="700">REDUCE</text>
        <text x="494" y="600" fontSize="10" fill={textFill("reduce", "currentColor")}>Trim oversized holding</text>
        <rect x="620" y="568" width="112" height="58" rx="8" fill={nodeFill("wait_hold", "rgba(239,68,68,0.12)")} stroke={nodeStroke("wait_hold") ?? "#f87171"} strokeWidth={nodeStrokeWidth("wait_hold")} />
        <text x="632" y="586" fontSize="10" fill={textFill("wait_hold", "#f87171")} fontWeight="700">WAIT_ADD</text>
        <text x="632" y="599" fontSize="10" fill={textFill("wait_hold", "#f87171")} fontWeight="700">/ WAIT_REDUCE</text>
        <text x="632" y="612" fontSize="9" fill={textFill("wait_hold", "currentColor")}>Holding, conditions pending</text>

        <line x1="140" y1="186" x2="350" y2="666" stroke={edgeColor("wait_override_to_p")} strokeWidth={edgeWidth("wait_override_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="140" y1="266" x2="350" y2="666" stroke={edgeColor("wait_history_to_p")} strokeWidth={edgeWidth("wait_history_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="112" y1="492" x2="350" y2="666" stroke={edgeColor("buy_to_p")} strokeWidth={edgeWidth("buy_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="310" y1="492" x2="350" y2="666" stroke={edgeColor("wait_buy_to_p")} strokeWidth={edgeWidth("wait_buy_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="410" y1="492" x2="350" y2="666" stroke={edgeColor("sell_reduce_to_p")} strokeWidth={edgeWidth("sell_reduce_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="490" y1="552" x2="350" y2="666" stroke={edgeColor("add_to_p")} strokeWidth={edgeWidth("add_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="560" y1="612" x2="350" y2="666" stroke={edgeColor("reduce_to_p")} strokeWidth={edgeWidth("reduce_to_p")} markerEnd="url(#arrowHeadRec)" />
        <line x1="676" y1="626" x2="350" y2="666" stroke={edgeColor("wait_hold_to_p")} strokeWidth={edgeWidth("wait_hold_to_p")} markerEnd="url(#arrowHeadRec)" />

        <rect x="190" y="670" width="320" height="50" rx="8" fill={nodeFill("overlay_p", "rgba(148,163,184,0.10)")} stroke={nodeStroke("overlay_p") ?? "#94a3b8"} strokeWidth={nodeStrokeWidth("overlay_p")} />
        <text x="202" y="690" fontSize="11" fill={textFill("overlay_p", "currentColor")} fontWeight="600">P. Apply shortlist / risk rules</text>
        <text x="202" y="705" fontSize="10" fill={textFill("overlay_p", "#94a3b8")}>Post-process BUY/WAIT/ADD/SELL actions against portfolio shortlist gates</text>
        <line x1="350" y1="720" x2="350" y2="746" stroke={edgeColor("p_to_q")} strokeWidth={edgeWidth("p_to_q")} markerEnd="url(#arrowHeadRec)" />

        <rect x="190" y="750" width="320" height="50" rx="8" fill={nodeFill("overlay_q", "rgba(148,163,184,0.10)")} stroke={nodeStroke("overlay_q") ?? "#94a3b8"} strokeWidth={nodeStrokeWidth("overlay_q")} />
        <text x="202" y="770" fontSize="11" fill={textFill("overlay_q", "currentColor")} fontWeight="600">Q. Apply market outlook cash-raise rules</text>
        <text x="202" y="785" fontSize="10" fill={textFill("overlay_q", "#94a3b8")}>Escalate to SELL/REDUCE when cash is below the target floor</text>
        <line x1="350" y1="800" x2="350" y2="826" stroke={edgeColor("q_to_r")} strokeWidth={edgeWidth("q_to_r")} markerEnd="url(#arrowHeadRec)" />

        <rect x="190" y="830" width="320" height="50" rx="8" fill={nodeFill("final_r", "rgba(59,130,246,0.12)")} stroke={nodeStroke("final_r") ?? "#60a5fa"} strokeWidth={nodeStrokeWidth("final_r")} />
        <text x="202" y="850" fontSize="11" fill={textFill("final_r", "currentColor")} fontWeight="600">R. Final recommendation shown in app</text>
        <text x="202" y="865" fontSize="10" fill={textFill("final_r", "#94a3b8")}>Action + comments + color-coded decision factors in Recommendation tab</text>
      </svg>
      </div>
      <div className="mt-1 rounded-md border border-border/70 bg-background/30 px-2 py-1 dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold text-foreground sm:text-xs">Active decision path only</p>
        <p className="text-[10px] text-subtle sm:text-[11px]">Only the highlighted branch that produced this stock&apos;s current recommendation is shown.</p>
      </div>
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
  const statusPrefix = (() => {
    const lower = label.toLowerCase();
    const useBoolean = lower.includes("user override") || lower.includes("enabled") || lower.includes("suppressed");
    if (useBoolean) return passes ? "True" : "False";
    return passes ? "Yes" : "No";
  })();
  const questionLabel = label.trim().endsWith("?") ? label.trim() : `${label.trim()}?`;
  const normalizedDetail = detail.trim();
  const prefixedDetail = `${statusPrefix}${normalizedDetail.length > 0 ? ` — ${normalizedDetail}` : ""}`;

  return (
    <div className={cn("flex items-start gap-2", compact ? "py-1" : "py-1.5")}>
      {passes ? (
        <CheckCircle2 className={cn("mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      ) : (
        <XCircle className={cn("mt-0.5 shrink-0 text-red-600 dark:text-red-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      )}
      <p className={cn("min-w-0 flex-1 text-foreground/88", compact ? "text-xs" : "text-sm")}>{questionLabel}</p>
      <p
        className={cn(
          "shrink-0 text-right leading-snug",
          passes ? "text-subtle" : "text-red-600 dark:text-red-300",
          compact ? "max-w-[45%] text-[10px]" : "max-w-[48%] text-xs"
        )}
      >
        {prefixedDetail}
      </p>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  hint,
  compact,
  indent,
  nested,
  valueClassName,
}: {
  label: string;
  value?: string;
  hint?: string;
  compact?: boolean;
  indent?: boolean;
  nested?: boolean;
  valueClassName?: string;
}) {
  const labelSize = nested ? (compact ? "text-[10px]" : "text-xs") : compact ? "text-xs" : "text-sm";
  const valueSize = nested ? (compact ? "text-[10px]" : "text-xs") : compact ? "text-xs" : "text-sm";
  const hintSize = nested ? (compact ? "text-[9px]" : "text-[10px]") : compact ? "text-[10px]" : "text-xs";
  return (
    <li
      className={cn(
        compact ? "pb-1.5 last:pb-0" : "pb-2 last:pb-0",
        indent && "pl-4"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className={cn(nested ? "font-normal text-subtle" : "font-medium text-foreground/80", labelSize)}>{label}</span>
          {value ? (
            <span
              className={cn(
                "tabular-nums",
                nested ? "font-medium text-subtle" : "font-semibold text-foreground",
                valueSize,
                valueClassName
              )}
            >
              {value}
            </span>
          ) : null}
        </div>
        {hint ? (
          <span className={cn("shrink-0 text-subtle", hintSize)}>
            {hint}
          </span>
        ) : null}
      </div>
    </li>
  );
}
