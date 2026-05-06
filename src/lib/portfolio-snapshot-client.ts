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

function validateSnapshotSlice(
  slice: PortfolioSlice,
  options?: { allowEmptyHoldings?: boolean }
): { error: Error | null; skipped: boolean } {
  if (slice.stocks.length === 0 && !options?.allowEmptyHoldings) {
    return { error: null, skipped: true };
  }

  let costBasis = 0;
  let holdingsValue = 0;
  for (const stock of slice.stocks) {
    if (stock.quantity <= 0) continue;
    costBasis += stock.quantity * stock.averageCost;
    holdingsValue += stock.quantity * (stock.lastPrice ?? stock.averageCost);
  }

  const totalPortfolioValue = holdingsValue + slice.cashBalance;
  if (totalPortfolioValue < 0) {
    return { error: new Error("Skipping snapshot save because total portfolio value is negative."), skipped: true };
  }

  if (slice.cashBalance < -100) {
    return { error: new Error("Skipping snapshot save because cash balance is materially negative."), skipped: true };
  }

  if (slice.stocks.some((stock) => stock.stockLimit < -100 || stock.transactionLimit < -100)) {
    return { error: new Error("Skipping snapshot save because one or more trading limits are negative."), skipped: true };
  }

  const hasPositions = slice.stocks.some((stock) => stock.quantity > 0);
  if (hasPositions && costBasis > 0 && holdingsValue < 100) {
    return {
      error: new Error("Skipping snapshot save because holdings exist but prices appear to be missing."),
      skipped: true,
    };
  }

  return { error: null, skipped: false };
}

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
    allowEmptyHoldings?: boolean;
    supabase?: ReturnType<typeof createClient>;
  }
): Promise<{ error: Error | null; skipped: boolean; fingerprint: string }> {
  const validation = validateSnapshotSlice(slice, {
    allowEmptyHoldings: options?.allowEmptyHoldings,
  });
  if (validation.skipped) {
    if (validation.error) {
      console.warn("[pushPortfolioSnapshotSlice]", validation.error.message);
    }
    return { error: validation.error, skipped: true, fingerprint: "" };
  }

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

export async function flushCurrentPortfolioSnapshotNow(
  force = false,
  options?: { allowEmptyHoldings?: boolean }
): Promise<{ error: Error | null; skipped: boolean }> {
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

  const result = await pushPortfolioSnapshotSlice(dataUserId, slice, {
    force,
    allowEmptyHoldings: options?.allowEmptyHoldings,
  });
  return { error: result.error, skipped: result.skipped };
}
