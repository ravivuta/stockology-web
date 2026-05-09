"use client";

import { useEffect, useState } from "react";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import {
  portfolioSyncFingerprint,
} from "@/lib/portfolio-cloud-sync";
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
    const key = `stocks-pm-cloud-hydrated:v3:${dataUserId}`;
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
      
      if (cloudSnapshot) {
        const parsedCloud = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });
        usePortfolioStore.getState().replaceFromCloudSync({
          ...parsedCloud,
          onboardingComplete: parsedCloud.cashBalance > 0 || parsedCloud.stocks.length > 0,
        });
        sessionStorage.setItem(key, "1");
        setSyncReady(true);
        return;
      }
      
      // Only apply draft if no cloud snapshot
      if (!hasLocalState) {
        const draft = readPortfolioDraftForUser(dataUserId);
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

  return null;
}
