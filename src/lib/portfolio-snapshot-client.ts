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
type SnapshotPushOptions = {
  force?: boolean;
  allowEmptyHoldings?: boolean;
  supabase?: ReturnType<typeof createClient>;
};

type SnapshotPushResult = { error: Error | null; skipped: boolean; fingerprint: string };

type QueuedSnapshotPush = {
  slice: PortfolioSlice;
  options?: SnapshotPushOptions;
  resolvers: Array<(result: SnapshotPushResult) => void>;
};

type SnapshotPushQueueState = {
  running: boolean;
  pending: QueuedSnapshotPush | null;
};

const snapshotPushQueueByUser = new Map<string, SnapshotPushQueueState>();

function snapshotValuationPrice(stock: PortfolioSlice["stocks"][number]): number {
  if (Number.isFinite(stock.lastPrice) && (stock.lastPrice ?? 0) > 0) {
    return stock.lastPrice as number;
  }
  if (Number.isFinite(stock.averageCost) && stock.averageCost > 0) {
    return stock.averageCost;
  }
  return 0;
}

function validateSnapshotSlice(
  slice: PortfolioSlice,
  options?: { allowEmptyHoldings?: boolean }
): { error: Error | null; skipped: boolean } {
  const hasMeaningfulCash = Number.isFinite(slice.cashBalance) && Math.abs(slice.cashBalance) >= 0.005;
  if (slice.stocks.length === 0 && !options?.allowEmptyHoldings && !hasMeaningfulCash) {
    return { error: null, skipped: true };
  }

  let costBasis = 0;
  let holdingsValue = 0;
  for (const stock of slice.stocks) {
    if (stock.quantity <= 0) continue;
    costBasis += stock.quantity * stock.averageCost;
    holdingsValue += stock.quantity * snapshotValuationPrice(stock);
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

async function executePortfolioSnapshotSlice(
  dataUserId: string,
  slice: PortfolioSlice,
  options?: SnapshotPushOptions
): Promise<SnapshotPushResult> {
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

function mergeSnapshotPushOptions(
  existing: SnapshotPushOptions | undefined,
  incoming: SnapshotPushOptions | undefined
): SnapshotPushOptions | undefined {
  if (!existing && !incoming) return undefined;
  return {
    force: !!existing?.force || !!incoming?.force,
    allowEmptyHoldings: !!existing?.allowEmptyHoldings || !!incoming?.allowEmptyHoldings,
    supabase: incoming?.supabase ?? existing?.supabase,
  };
}

async function drainSnapshotPushQueue(dataUserId: string, queue: SnapshotPushQueueState): Promise<void> {
  try {
    while (queue.pending) {
      const next = queue.pending;
      queue.pending = null;
      const result = await executePortfolioSnapshotSlice(dataUserId, next.slice, next.options);
      next.resolvers.forEach((resolve) => resolve(result));
    }
  } finally {
    queue.running = false;
    if (!queue.pending) {
      snapshotPushQueueByUser.delete(dataUserId);
    }
  }
}

export async function pushPortfolioSnapshotSlice(
  dataUserId: string,
  slice: PortfolioSlice,
  options?: SnapshotPushOptions
): Promise<SnapshotPushResult> {
  return await new Promise<SnapshotPushResult>((resolve) => {
    let queue = snapshotPushQueueByUser.get(dataUserId);
    if (!queue) {
      queue = { running: false, pending: null };
      snapshotPushQueueByUser.set(dataUserId, queue);
    }

    if (queue.pending) {
      queue.pending = {
        slice,
        options: mergeSnapshotPushOptions(queue.pending.options, options),
        resolvers: [...queue.pending.resolvers, resolve],
      };
    } else {
      queue.pending = {
        slice,
        options,
        resolvers: [resolve],
      };
    }

    if (!queue.running) {
      queue.running = true;
      void drainSnapshotPushQueue(dataUserId, queue);
    }
  });
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
