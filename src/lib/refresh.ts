"use client";

import {
  mapTickerHydrationPriceRowToPatch,
  type TickerHydrationPriceRow,
  type TickerHydrationSentimentRow,
} from "@/lib/ticker-direct-hydration";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import type { PortfolioSnapshotRow } from "@/lib/cloud-portfolio";
import {
  localPortfolioMutationIsUnsaved,
  markLastPushedPortfolioFingerprint,
} from "@/lib/portfolio-snapshot-client";
import { portfolioSyncFingerprint, loadGlobalSettingsForUser, patchFromCloudGlobalSettings } from "@/lib/portfolio-cloud-sync";
import { createClient } from "@/lib/supabase/client";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import type { StockHolding } from "@/store/portfolioStore";
import { usePortfolioStore } from "@/store/portfolioStore";

const MAX_REFRESH_SYMBOLS = 250;
const MAX_SYMBOL_LEN = 16;
type RefreshPipelineResponse = {
  ok: boolean;
  message?: string;
  refreshed_at?: string;
  data_user_id?: string;
  prices?: Record<string, TickerHydrationPriceRow>;
  sentiment?: Record<string, TickerHydrationSentimentRow>;
  snapshot?: (PortfolioSnapshotRow & { updated_at?: string | null }) | null;
  fresh_symbols?: string[];
  stale_symbols?: string[];
};

export type RefreshPipelineResult = {
  ok: boolean;
  message?: string;
  refreshedAt?: string;
  hydratedSymbols: string[];
  freshSymbols: string[];
  staleSymbols: string[];
};

function currentStoreSettings() {
  const store = usePortfolioStore.getState();
  return {
    etfProfitTarget: store.etfProfitTarget,
    stockProfitTarget: store.stockProfitTarget,
    riskAppetite: store.riskAppetite,
    enableRiskFilter: store.enableRiskFilter,
    useAISentimentForRecommendations: store.useAISentimentForRecommendations,
    useRSIGatingForRecommendations: store.useRSIGatingForRecommendations,
    rsiPeriodForRecommendations: store.rsiPeriodForRecommendations,
    rsiOversoldThresholdForRecommendations: store.rsiOversoldThresholdForRecommendations,
    rsiOverboughtThresholdForRecommendations: store.rsiOverboughtThresholdForRecommendations,
    rsiHysteresisPointsForRecommendations: store.rsiHysteresisPointsForRecommendations,
    rsiMinRisingDaysForRecommendations: store.rsiMinRisingDaysForRecommendations,
    sellOnlyLongTermQualified: store.sellOnlyLongTermQualified,
    traderModeEnabled: store.traderModeEnabled,
    limitWatchlistSize: store.limitWatchlistSize,
    timezone: store.timezone,
    region: store.region,
  };
}

async function syncCloudSettingsIfChanged(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return false;
    const dataUserId = await syncStocksPmAuthUser(supabase, uid);
    const cloud = await loadGlobalSettingsForUser(supabase, dataUserId);
    if (!cloud) return false;
    const patch = patchFromCloudGlobalSettings(currentStoreSettings(), cloud);
    if (Object.keys(patch).length === 0) return false;
    usePortfolioStore.setState(patch);
    return true;
  } catch (error) {
    console.warn("[refresh settings sync]", error);
    return false;
  }
}

function keepLocalMarketFields(local: StockHolding, incoming: StockHolding): StockHolding {
  const next: StockHolding = { ...incoming };
  if ((next.lastPrice ?? 0) <= 0 && (local.lastPrice ?? 0) > 0) {
    next.lastPrice = local.lastPrice;
    next.dailyChangePercent = local.dailyChangePercent;
  }
  if (next.analystTarget == null && local.analystTarget != null) next.analystTarget = local.analystTarget;
  if (next.analystAvg == null && local.analystAvg != null) next.analystAvg = local.analystAvg;
  if (next.marketCap == null && local.marketCap != null) next.marketCap = local.marketCap;
  if (next.peg == null && local.peg != null) next.peg = local.peg;
  if (next.beta == null && local.beta != null) next.beta = local.beta;
  if (next.returnOnEquity == null && local.returnOnEquity != null) next.returnOnEquity = local.returnOnEquity;
  if (next.profitMargin == null && local.profitMargin != null) next.profitMargin = local.profitMargin;
  if (next.trailingPE == null && local.trailingPE != null) next.trailingPE = local.trailingPE;
  if (next.debtToEquity == null && local.debtToEquity != null) next.debtToEquity = local.debtToEquity;
  if (next.dividendYield == null && local.dividendYield != null) next.dividendYield = local.dividendYield;
  if (next.payoutRatio == null && local.payoutRatio != null) next.payoutRatio = local.payoutRatio;
  if (next.aiSentimentScore == null && local.aiSentimentScore != null) {
    next.aiSentimentScore = local.aiSentimentScore;
    next.aiSentimentLastUpdated = local.aiSentimentLastUpdated;
  }
  if (!next.name && local.name) next.name = local.name;
  if (next.isETF == null && local.isETF != null) next.isETF = local.isETF;
  return next;
}

function sanitizeSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of symbols) {
    if (typeof s !== "string") continue;
    const u = s.trim().toUpperCase();
    if (!u || u.length > MAX_SYMBOL_LEN) continue;
    if (!/^[A-Z0-9.\-]+$/.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= MAX_REFRESH_SYMBOLS) break;
  }
  return out;
}

export async function runRefreshPipeline(
  symbols: string[],
  options?: {
    optimizePending?: boolean;
    includeSnapshot?: boolean;
  }
): Promise<RefreshPipelineResult> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  try {
    const settingsChanged = await syncCloudSettingsIfChanged();
    const clean = sanitizeSymbols(symbols);
    const res = await fetch(`${basePath}/api/python/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: clean,
        include_snapshot: options?.includeSnapshot === true,
      }),
    });
    const data = (await res.json().catch(() => null)) as RefreshPipelineResponse | null;

    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message ?? "Refresh failed",
        hydratedSymbols: [],
        freshSymbols: [],
        staleSymbols: [],
      };
    }

    const dataUserId = data.data_user_id?.trim() ?? "";

    const stateBeforeSnapshot = usePortfolioStore.getState();
    let snapshotApplied = false;
    let snapshotWritten = false;
    if (options?.includeSnapshot === true && data.snapshot && !stateBeforeSnapshot.optimizing) {
      const localMutationAt = Date.parse(stateBeforeSnapshot.lastLocalMutationAt ?? "");
      const snapshotUpdatedAt = Date.parse(data.snapshot.updated_at ?? "");
      // A missing timestamp is not proof the cloud row is newer. Applying it
      // put deleted holdings back and the follow-up sync saved that old book.
      const snapshotIsNewerThanLocal =
        Number.isFinite(snapshotUpdatedAt) &&
        (!Number.isFinite(localMutationAt) || snapshotUpdatedAt >= localMutationAt);
      const unsavedLocalEdit =
        !!dataUserId &&
        localPortfolioMutationIsUnsaved(dataUserId, stateBeforeSnapshot.lastLocalMutationAt);
      const skipStaleSnapshot =
        unsavedLocalEdit || (!snapshotIsNewerThanLocal && Number.isFinite(localMutationAt));

      if (!skipStaleSnapshot) {
        const parsed = parseCloudSnapshotForStore(data.snapshot);
        const localBySymbol = new Map(
          stateBeforeSnapshot.stocks.map((stock) => [stock.symbol.toUpperCase(), stock])
        );
        const stocks = parsed.stocks.map((stock) => {
          const local = localBySymbol.get(stock.symbol.toUpperCase());
          return local ? keepLocalMarketFields(local, stock) : stock;
        });
        usePortfolioStore.getState().replaceFromCloudSync({
          ...parsed,
          stocks,
          onboardingComplete: true,
        });
        if (dataUserId) {
          const applied = usePortfolioStore.getState();
          markLastPushedPortfolioFingerprint(
            dataUserId,
            portfolioSyncFingerprint({
              cashBalance: applied.cashBalance,
              fixedIncomeByAccount: applied.fixedIncomeByAccount,
              stocks: applied.stocks,
              lotsBySymbol: applied.lotsBySymbol,
            })
          );
        }
        snapshotWritten = true;
      }
      snapshotApplied = true;
    }

    const portfolioSizeAfter = usePortfolioStore.getState().portfolioSize;
    const portfolioSizeBefore = stateBeforeSnapshot.portfolioSize;
    let recalculateLimits = !snapshotApplied;
    if (
      snapshotApplied &&
      portfolioSizeBefore > 0 &&
      portfolioSizeAfter > 0 &&
      Math.abs(portfolioSizeAfter - portfolioSizeBefore) / portfolioSizeBefore > 0.1
    ) {
      recalculateLimits = true;
    }

    const prices = data.prices ?? {};
    const sentiment = data.sentiment ?? {};
    const patches: Array<{ symbol: string; patch: Partial<StockHolding> }> = [];

    for (const [symbol, row] of Object.entries(prices)) {
      const patch = mapTickerHydrationPriceRowToPatch(row, sentiment[symbol]);
      if (Object.keys(patch).length > 0) {
        patches.push({ symbol, patch });
      }
    }

    if (patches.length > 0) {
      usePortfolioStore.getState().bulkUpdateStocks(patches, { shouldRecalculateLimits: recalculateLimits });
    } else if (!snapshotWritten || recalculateLimits || settingsChanged) {
      usePortfolioStore.getState().recalcMetrics({
        shouldRecalculateLimits: recalculateLimits,
        recordMutation: false,
      });
    }

    if (options?.optimizePending !== false) {
      await usePortfolioStore.getState().optimizePendingStocks();
    }

    usePortfolioStore.setState({
      lastRefreshAt: data.refreshed_at ?? new Date().toISOString(),
    });

    // Refresh is pull-only. Optimize/import/settings persist via their own mutation flush.
    // Do not rewrite today's snapshot from a price hydrate.

    return {
      ok: true,
      message: data.message,
      refreshedAt: data.refreshed_at,
      hydratedSymbols: patches.map((item) => item.symbol),
      freshSymbols: data.fresh_symbols ?? [],
      staleSymbols: data.stale_symbols ?? [],
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      hydratedSymbols: [],
      freshSymbols: [],
      staleSymbols: [],
    };
  }
}
