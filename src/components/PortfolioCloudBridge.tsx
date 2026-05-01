"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { snapshotIndicatesExistingAccount } from "@/lib/cloud-portfolio";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import {
  portfolioSyncFingerprint,
  upsertPortfolioSnapshotForCloudUser,
} from "@/lib/portfolio-cloud-sync";
import {
  ACTIVE_DATA_USER_KEY,
  clearPortfolioSessionStorageFlags,
} from "@/lib/clear-portfolio-client-state";
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
  const lastPushedRef = useRef<string>("");

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
      if (cloudSnapshot && snapshotIndicatesExistingAccount(cloudSnapshot)) {
        const parsed = parseCloudSnapshotForStore({
          holdings: cloudSnapshot.holdings,
          cash_balance: cloudSnapshot.cash_balance,
        });
        if (parsed.stocks.length > 0 || parsed.cashBalance > 0) {
          usePortfolioStore.getState().replaceFromCloudSync({
            ...parsed,
            onboardingComplete: true,
          });
        }
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
        const slice = { cashBalance: state.cashBalance, stocks: state.stocks };
        const fp = portfolioSyncFingerprint(slice);
        if (fp === lastPushedRef.current) return;
        const supabase = createClient();
        const { error } = await upsertPortfolioSnapshotForCloudUser(supabase, dataUserId, slice);
        if (!error) {
          lastPushedRef.current = fp;
        }
      }, debounceMs);
    };

    const unsub = usePortfolioStore.subscribe((state, prev) => {
      const a = portfolioSyncFingerprint({ cashBalance: prev.cashBalance, stocks: prev.stocks });
      const b = portfolioSyncFingerprint({ cashBalance: state.cashBalance, stocks: state.stocks });
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
