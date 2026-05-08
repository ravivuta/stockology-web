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

      const alreadyHydrated = sessionStorage.getItem(key) === "1";
      const state = usePortfolioStore.getState();
      const hasLocalState =
        state.cashBalance > 0 ||
        state.stocks.length > 0 ||
        state.onboardingComplete ||
        Object.keys(state.lotsBySymbol).length > 0;
      
      // Always apply snapshot if it's newer/better, even if local state exists
      // This prevents stale snapshots from overwriting fresh lots during page refresh
      if (cloudSnapshot && snapshotIndicatesExistingAccount(cloudSnapshot)) {
        const parsedCloud = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });
        
        // Compare lot counts: prefer snapshot with MORE lots (more recent/complete)
        const cloudLotCount = Object.values(parsedCloud.lotsBySymbol).reduce(
          (sum, bundle) => sum + bundle.open.length + bundle.sold.length,
          0
        );
        const localLotCount = Object.values(state.lotsBySymbol).reduce(
          (sum, bundle) => sum + bundle.open.length + bundle.sold.length,
          0
        );
        
        // If cloud has more lots, it's fresher - apply it
        // If local has more or equal lots, keep local (prefer local richness)
        if (cloudLotCount > localLotCount) {
          console.log(`[PortfolioCloudBridge] ✅ Cloud snapshot has more lots (${cloudLotCount} vs ${localLotCount}), applying cloud snapshot`);
          usePortfolioStore.getState().replaceFromCloudSync({
            ...parsedCloud,
            onboardingComplete: true,
          });
        } else if (!alreadyHydrated && cloudLotCount === localLotCount && cloudLotCount > 0) {
          // First hydrate of this session: allow equivalent lot-count cloud apply to sync non-lot fields.
          usePortfolioStore.getState().replaceFromCloudSync({
            ...parsedCloud,
            onboardingComplete: true,
          });
        } else if (cloudLotCount > 0 && localLotCount === 0) {
          console.log(`[PortfolioCloudBridge] ✅ Cloud has lots (${cloudLotCount}), local is empty, applying cloud snapshot`);
          usePortfolioStore.getState().replaceFromCloudSync({
            ...parsedCloud,
            onboardingComplete: true,
          });
        } else if (localLotCount > 0 && cloudLotCount === 0) {
          console.warn(`[PortfolioCloudBridge] ⚠️ WARNING: Cloud snapshot is EMPTY (0 lots) but local has ${localLotCount} lots`);
          console.warn(`   This may indicate a stale/incomplete snapshot was saved to Supabase`);
          console.warn(`   PRESERVING LOCAL LOTS to prevent data loss`);
        } else if (localLotCount > cloudLotCount && localLotCount > 0) {
          console.log(`[PortfolioCloudBridge] ✅ Local has more lots (${localLotCount} vs ${cloudLotCount}), keeping local`);
        }
        
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
