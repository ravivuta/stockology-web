"use client";

import { ACTIVE_DATA_USER_KEY } from "@/lib/clear-portfolio-client-state";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import {
  portfolioSyncFingerprint,
  upsertPortfolioSnapshotForCloudUser,
  type PortfolioSlice,
} from "@/lib/portfolio-cloud-sync";
import { usePortfolioStore } from "@/store/portfolioStore";

const lastPushedFingerprintByUser = new Map<string, string>();

export function getLastPushedPortfolioFingerprint(dataUserId: string): string {
  return lastPushedFingerprintByUser.get(dataUserId) ?? "";
}

export function markLastPushedPortfolioFingerprint(dataUserId: string, fingerprint: string): void {
  lastPushedFingerprintByUser.set(dataUserId, fingerprint);
}

export async function pushPortfolioSnapshotSlice(
  dataUserId: string,
  slice: PortfolioSlice,
  options?: {
    force?: boolean;
    supabase?: ReturnType<typeof createClient>;
  }
): Promise<{ error: Error | null; skipped: boolean; fingerprint: string }> {
  const fingerprint = portfolioSyncFingerprint(slice);
  if (!options?.force && getLastPushedPortfolioFingerprint(dataUserId) === fingerprint) {
    return { error: null, skipped: true, fingerprint };
  }

  const supabase = options?.supabase ?? createClient();
  const { error } = await upsertPortfolioSnapshotForCloudUser(supabase, dataUserId, slice);
  if (!error) {
    markLastPushedPortfolioFingerprint(dataUserId, fingerprint);
  }
  return { error, skipped: false, fingerprint };
}

export async function flushCurrentPortfolioSnapshotNow(force = false): Promise<{ error: Error | null; skipped: boolean }> {
  if (typeof window === "undefined" || !hasSupabaseConfig()) {
    return { error: null, skipped: true };
  }

  let dataUserId = "";
  try {
    dataUserId = sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ?? "";
  } catch {
    dataUserId = "";
  }
  if (!dataUserId) return { error: null, skipped: true };

  const state = usePortfolioStore.getState();
  const slice: PortfolioSlice = {
    cashBalance: state.cashBalance,
    stocks: state.stocks,
    lotsBySymbol: state.lotsBySymbol,
  };

  const result = await pushPortfolioSnapshotSlice(dataUserId, slice, { force });
  return { error: result.error, skipped: result.skipped };
}
