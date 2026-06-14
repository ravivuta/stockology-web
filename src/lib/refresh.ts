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
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { portfolioSyncFingerprint } from "@/lib/portfolio-cloud-sync";
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
      const storeState = usePortfolioStore.getState();
      const localMutationAt = storeState.lastLocalMutationAt
        ? Date.parse(storeState.lastLocalMutationAt)
        : Number.NaN;
      const snapshotUpdatedAt = data.snapshot.updated_at
        ? Date.parse(data.snapshot.updated_at)
        : Number.NaN;
      const snapshotIsStaleVsLocal =
        Number.isFinite(localMutationAt) &&
        (!Number.isFinite(snapshotUpdatedAt) || snapshotUpdatedAt < localMutationAt);

      if (!snapshotIsStaleVsLocal) {
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

    usePortfolioStore.setState({
      lastRefreshAt: data.refreshed_at ?? new Date().toISOString(),
    });

    if (options?.includeSnapshot === true) {
      const saveResult = await flushCurrentPortfolioSnapshotNow(true);
      if (saveResult.error) {
        console.warn("[runRefreshPipeline]", saveResult.error.message);
      }
    }

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
