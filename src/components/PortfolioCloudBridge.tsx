"use client";

import { useEffect, useState } from "react";
import { snapshotIndicatesExistingAccount } from "@/lib/cloud-portfolio";
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
import { flushCurrentPortfolioSnapshotNow, pushPortfolioSnapshotSlice } from "@/lib/portfolio-snapshot-client";
import { usePortfolioStore } from "@/store/portfolioStore";

export type CloudSnapshotHydrationProps = {
  holdings: unknown;
  cash_balance: unknown;
  total_portfolio_value: unknown;
} | null;

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

      if (sessionStorage.getItem(key)) {
        setSyncReady(true);
        return;
      }
      const state = usePortfolioStore.getState();
      const hasLocalState =
        state.cashBalance > 0 ||
        state.stocks.length > 0 ||
        state.onboardingComplete ||
        Object.keys(state.lotsBySymbol).length > 0;
      const shouldApplySnapshotOnce =
        cloudSnapshot &&
        snapshotIndicatesExistingAccount(cloudSnapshot) &&
        !hasLocalState;
      if (shouldApplySnapshotOnce) {
        const parsedCloud = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });
        const draft = readPortfolioDraftForUser(dataUserId);

        const cloudLotCount = Object.values(parsedCloud.lotsBySymbol).reduce(
          (sum, bundle) => sum + bundle.open.length + bundle.sold.length,
          0
        );
        const draftLotCount = draft
          ? Object.values(draft.lotsBySymbol).reduce(
              (sum, bundle) => sum + bundle.open.length + bundle.sold.length,
              0
            )
          : 0;

        if (draft && draftLotCount > cloudLotCount) {
          usePortfolioStore.getState().replaceFromCloudSync(draft);
        } else {
          usePortfolioStore.getState().replaceFromCloudSync({
            ...parsedCloud,
            onboardingComplete: true,
          });
        }
        sessionStorage.setItem(key, "1");
        return;
      }

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

    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounceMs = 4500;

    const schedulePush = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const state = usePortfolioStore.getState();
        const slice = { cashBalance: state.cashBalance, stocks: state.stocks, lotsBySymbol: state.lotsBySymbol };
        await pushPortfolioSnapshotSlice(dataUserId, slice);
      }, debounceMs);
    };

    const flushNow = () => {
      void flushCurrentPortfolioSnapshotNow(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    };

    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const unsub = usePortfolioStore.subscribe((state, prev) => {
      const a = portfolioSyncFingerprint({ cashBalance: prev.cashBalance, stocks: prev.stocks, lotsBySymbol: prev.lotsBySymbol });
      const b = portfolioSyncFingerprint({ cashBalance: state.cashBalance, stocks: state.stocks, lotsBySymbol: state.lotsBySymbol });
      if (a === b) return;
      schedulePush();
    });

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsub();
    };
  }, [syncReady, dataUserId]);

  return null;
}
