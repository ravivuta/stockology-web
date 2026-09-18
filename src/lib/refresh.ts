"use client";

import {
  mapTickerHydrationPriceRowToPatch,
  type TickerHydrationPriceRow,
  type TickerHydrationSentimentRow,
} from "@/lib/ticker-direct-hydration";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import type { PortfolioSnapshotRow } from "@/lib/cloud-portfolio";
import {
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

    if (
      options?.includeSnapshot === true &&
      data.snapshot
    ) {
      const parsed = parseCloudSnapshotForStore(data.snapshot);
      usePortfolioStore.getState().replaceFromCloudSync({
        ...parsed,
        onboardingComplete: true,
      });
      if (dataUserId) {
        markLastPushedPortfolioFingerprint(
          dataUserId,
          portfolioSyncFingerprint({
            cashBalance: parsed.cashBalance,
            stocks: parsed.stocks,
            lotsBySymbol: parsed.lotsBySymbol,
          })
        );
      }
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
      usePortfolioStore.getState().bulkUpdateStocks(patches);
    }

    if (options?.optimizePending !== false) {
      await usePortfolioStore.getState().optimizePendingStocks();
    }
    if (settingsChanged) {
      usePortfolioStore.getState().recalcMetrics();
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
