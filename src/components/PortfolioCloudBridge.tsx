"use client";

import { useEffect, useState } from "react";
import { snapshotIndicatesExistingAccount } from "@/lib/cloud-portfolio";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import {
  portfolioSyncFingerprint,
} from "@/lib/portfolio-cloud-sync";
import {
  ACTIVE_DATA_USER_KEY,
  clearPortfolioSessionStorageFlags,
} from "@/lib/clear-portfolio-client-state";
import { pushPortfolioSnapshotSlice } from "@/lib/portfolio-snapshot-client";
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
  dataUserId,
  cloudSnapshot,
}: {
  dataUserId: string;
  cloudSnapshot: CloudSnapshotHydrationProps;
}) {
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Bump suffix when server-side resolve logic changes so clients re-apply cloud snapshot once.
    const key = `stocks-pm-cloud-hydrated:v2:${dataUserId}`;
    try {
      const prevActive = sessionStorage.getItem(ACTIVE_DATA_USER_KEY);
      if (prevActive && prevActive !== dataUserId) {
        usePortfolioStore.getState().resetAll();
        clearPortfolioSessionStorageFlags();
      }
      sessionStorage.setItem(ACTIVE_DATA_USER_KEY, dataUserId);

      if (sessionStorage.getItem(key)) {
        setSyncReady(true);
        return;
      }
      const state = usePortfolioStore.getState();
      const shouldApplySnapshotOnce =
        cloudSnapshot &&
        (
          snapshotIndicatesExistingAccount(cloudSnapshot) ||
          state.cashBalance > 0 ||
          state.stocks.length > 0 ||
          state.onboardingComplete
        );
      if (cloudSnapshot && shouldApplySnapshotOnce) {
        const parsed = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });
        usePortfolioStore.getState().replaceFromCloudSync({
          ...parsed,
          onboardingComplete: true,
        });
        sessionStorage.setItem(key, "1");
      }
    } finally {
      setSyncReady(true);
    }
  }, [dataUserId, cloudSnapshot]);

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

    const unsub = usePortfolioStore.subscribe((state, prev) => {
      const a = portfolioSyncFingerprint({ cashBalance: prev.cashBalance, stocks: prev.stocks, lotsBySymbol: prev.lotsBySymbol });
      const b = portfolioSyncFingerprint({ cashBalance: state.cashBalance, stocks: state.stocks, lotsBySymbol: state.lotsBySymbol });
      if (a === b) return;
      schedulePush();
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [syncReady, dataUserId]);

  return null;
}
