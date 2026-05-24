"use client";

import { useEffect, useState } from "react";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import {
  portfolioSyncFingerprint,
  loadGlobalSettingsForUser,
} from "@/lib/portfolio-cloud-sync";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVE_AUTH_USER_KEY,
  ACTIVE_DATA_USER_KEY,
  clearPortfolioSessionStorageFlags,
  readPortfolioDraftForUser,
  saveCurrentPortfolioDraftForUser,
} from "@/lib/clear-portfolio-client-state";
import {
  flushCurrentPortfolioSnapshotNow,
  pushPortfolioSnapshotSlice,
  retryPendingPortfolioSnapshot,
} from "@/lib/portfolio-snapshot-client";
import { usePortfolioStore } from "@/store/portfolioStore";

export type CloudSnapshotHydrationProps = {
  holdings: unknown;
  cash_balance: unknown;
  total_portfolio_value: unknown;
} | null;

function sliceIsEmpty(slice: {
  cashBalance: number;
  stocks: unknown[];
  lotsBySymbol: Record<string, unknown>;
}) {
  return (
    Math.abs(slice.cashBalance) < 0.005 &&
    slice.stocks.length === 0 &&
    Object.keys(slice.lotsBySymbol).length === 0
  );
}

function hasMeaningfulSlice(slice: {
  cashBalance: number;
  stocks: unknown[];
  lotsBySymbol: Record<string, unknown>;
  onboardingComplete?: boolean;
}) {
  return (
    Math.abs(slice.cashBalance) >= 0.005 ||
    slice.stocks.length > 0 ||
    Object.keys(slice.lotsBySymbol).length > 0 ||
    slice.onboardingComplete === true
  );
}

/**
 * One-time hydrate from Supabase snapshot into the persisted Zustand store, and debounced push-back for iOS.
 */
export function PortfolioCloudBridge({
  authUserId,
  dataUserId,
  cloudSnapshot,
}: {
  authUserId: string;
  dataUserId: string;
  cloudSnapshot: CloudSnapshotHydrationProps;
}) {
  const [syncReady, setSyncReady] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(() => usePortfolioStore.persist.hasHydrated());

  useEffect(() => {
    if (usePortfolioStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return;
    }
    const unsub = usePortfolioStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storeHydrated) return;
    // Bump suffix when client-side identity or restore logic changes so clients re-apply once.
    const key = `stocks-pm-cloud-hydrated:v4:${dataUserId}`;
    try {
      const prevActive = sessionStorage.getItem(ACTIVE_DATA_USER_KEY);
      const prevAuthUserId = sessionStorage.getItem(ACTIVE_AUTH_USER_KEY);
      const authUserChanged = !!prevAuthUserId && prevAuthUserId !== authUserId;
      const dataUserChanged = !!prevActive && prevActive !== dataUserId;

      if (dataUserChanged) {
        if (authUserChanged) {
          saveCurrentPortfolioDraftForUser(prevActive);
          usePortfolioStore.getState().resetAll();
        }
        clearPortfolioSessionStorageFlags();
      }
      sessionStorage.setItem(ACTIVE_DATA_USER_KEY, dataUserId);
      sessionStorage.setItem(ACTIVE_AUTH_USER_KEY, authUserId);

      const state = usePortfolioStore.getState();
      const hasLocalState =
        state.cashBalance > 0 ||
        state.stocks.length > 0 ||
        state.onboardingComplete ||
        Object.keys(state.lotsBySymbol).length > 0;

      const draftForDataUser = readPortfolioDraftForUser(dataUserId);
      const draftForAuthUser = authUserId !== dataUserId ? readPortfolioDraftForUser(authUserId) : null;
      const preferredDraft = draftForDataUser ?? draftForAuthUser;
      
      if (cloudSnapshot) {
        const parsedCloud = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });

        // Preserve local watchlist-only stocks (quantity === 0, no open lots) when merging
        // cloud snapshot, since cloud snapshot might not include metadata for all watchlist items.
        const localState = usePortfolioStore.getState();
        const cloudSymbolSet = new Set(parsedCloud.stocks.map((s) => s.symbol));
        const preservedWatchlistStocks = localState.stocks.filter((s) => {
          if (cloudSymbolSet.has(s.symbol)) return false; // Cloud has this symbol
          if (s.quantity > 0) return false; // Only preserve watchlist (qty === 0)
          const lots = localState.lotsBySymbol[s.symbol];
          return !lots || lots.open.length === 0; // Only if no open lots
        });

        // Merge watchlist back in with cloud payload
        const mergedStocks = [...parsedCloud.stocks, ...preservedWatchlistStocks];
        const mergedLots = {
          ...parsedCloud.lotsBySymbol,
          ...Object.fromEntries(
            preservedWatchlistStocks.map((s) => [s.symbol, localState.lotsBySymbol[s.symbol] ?? { open: [], sold: [] }])
          ),
        };

        const cloudSlice = {
          cashBalance: parsedCloud.cashBalance,
          stocks: mergedStocks,
          lotsBySymbol: mergedLots,
        };
        const cloudLooksEmpty = !hasMeaningfulSlice(cloudSlice);

        if (cloudLooksEmpty && preferredDraft && hasMeaningfulSlice(preferredDraft)) {
          // Safety: if cloud payload is empty but we have a meaningful local draft for
          // this signed-in identity, restore the draft instead of wiping the portfolio.
          usePortfolioStore.getState().replaceFromCloudSync(preferredDraft);
          sessionStorage.setItem(key, "1");
          setSyncReady(true);
          return;
        }

        usePortfolioStore.getState().replaceFromCloudSync({
          cashBalance: cloudSlice.cashBalance,
          stocks: mergedStocks,
          lotsBySymbol: mergedLots,
          onboardingComplete: parsedCloud.cashBalance > 0 || mergedStocks.length > 0,
        });
        sessionStorage.setItem(key, "1");
        setSyncReady(true);
        return;
      }
      
      // Only apply draft if no cloud snapshot
      if (!hasLocalState) {
        const draft = preferredDraft;
        if (draft) {
          usePortfolioStore.getState().replaceFromCloudSync(draft);
          sessionStorage.setItem(key, "1");
        }
      }
    } finally {
      setSyncReady(true);
    }
  }, [authUserId, dataUserId, cloudSnapshot, storeHydrated]);

  useEffect(() => {
    if (!syncReady || !dataUserId) return;

    retryPendingPortfolioSnapshot(dataUserId);

    const pushCurrentSnapshot = () => {
      const state = usePortfolioStore.getState();
      const slice = { cashBalance: state.cashBalance, stocks: state.stocks, lotsBySymbol: state.lotsBySymbol };
      void pushPortfolioSnapshotSlice(dataUserId, slice);
    };

    const flushNow = () => {
      void flushCurrentPortfolioSnapshotNow(true);
    };

    const handleOnline = () => {
      retryPendingPortfolioSnapshot(dataUserId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      } else {
        retryPendingPortfolioSnapshot(dataUserId);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const unsub = usePortfolioStore.subscribe((state, prev) => {
      const prevSlice = { cashBalance: prev.cashBalance, stocks: prev.stocks, lotsBySymbol: prev.lotsBySymbol };
      const nextSlice = { cashBalance: state.cashBalance, stocks: state.stocks, lotsBySymbol: state.lotsBySymbol };
      const a = portfolioSyncFingerprint(prevSlice);
      const b = portfolioSyncFingerprint(nextSlice);
      if (a === b) return;
      const intentionalClear = !sliceIsEmpty(prevSlice) && sliceIsEmpty(nextSlice);
      if (intentionalClear) {
        void pushPortfolioSnapshotSlice(dataUserId, nextSlice, {
          force: true,
          allowEmptyHoldings: true,
        });
        return;
      }
      pushCurrentSnapshot();
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsub();
    };
  }, [syncReady, dataUserId]);

  // Load cloud settings on every app mount so recommendation filter settings
  // (RSI gating, AI sentiment, etc.) stay in sync across iOS and web.
  // IMPORTANT: Use usePortfolioStore.setState() directly (not setSettings()) so that
  // only the primitive settings fields are written. setSettings() runs derivePortfolioState
  // which updates the stocks array, changing the fingerprint and triggering a Supabase push
  // — creating a circular Supabase-read → Supabase-write loop. Direct setState() sets
  // settings in the persisted store without touching stocks, so no push fires.
  useEffect(() => {
    if (!syncReady || !dataUserId) return;
    const supabase = createClient();
    loadGlobalSettingsForUser(supabase, dataUserId).then((settings) => {
      if (!settings) return;
      usePortfolioStore.setState({
        ...(settings.etfProfitTarget != null && settings.etfProfitTarget > 0 ? { etfProfitTarget: settings.etfProfitTarget } : {}),
        ...(settings.stockProfitTarget != null && settings.stockProfitTarget > 0 ? { stockProfitTarget: settings.stockProfitTarget } : {}),
        ...(settings.riskAppetite != null ? { riskAppetite: settings.riskAppetite } : {}),
        ...(settings.enableRiskFilter != null ? { enableRiskFilter: settings.enableRiskFilter } : {}),
        ...(settings.useAISentiment != null ? { useAISentimentForRecommendations: settings.useAISentiment } : {}),
        ...(settings.useRSIGating != null ? { useRSIGatingForRecommendations: settings.useRSIGating } : {}),
        ...(settings.sellOnlyLongTerm != null ? { sellOnlyLongTermQualified: settings.sellOnlyLongTerm } : {}),
        ...(settings.limitWatchlistSize != null ? { limitWatchlistSize: settings.limitWatchlistSize } : {}),
        ...(settings.timezone ? { timezone: settings.timezone } : {}),
        ...(settings.region ? { region: settings.region } : {}),
      });
      // Recompute recommendations so the UI immediately reflects the loaded settings.
      // stocks[].recommendation is stored in the Zustand store (not computed on-the-fly),
      // so setState alone leaves stale recommendations until the next user interaction.
      // recalcMetrics reruns derivePortfolioState with the new settings.
      // The fingerprint subscriber only pushes to Supabase if shortlist/movingAvg
      // actually changed — a legitimate write, not a loop.
      usePortfolioStore.getState().recalcMetrics();
    });
  }, [syncReady, dataUserId]);

  return null;
}
