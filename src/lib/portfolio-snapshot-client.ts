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
const DURABLE_PENDING_KEY = "stocks-pm-pending-portfolio-snapshots:v1";
const durableRetryTimersByUser = new Map<string, number>();

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

function validateSnapshotSlice(
  slice: PortfolioSlice,
  options?: { allowEmptyHoldings?: boolean }
): { error: Error | null; skipped: boolean } {
  const hasMeaningfulCash = Number.isFinite(slice.cashBalance) && Math.abs(slice.cashBalance) >= 0.005;
  if (slice.stocks.length === 0 && !options?.allowEmptyHoldings && !hasMeaningfulCash) {
    return { error: null, skipped: true };
  }

  return { error: null, skipped: false };
}

type DurablePendingSnapshot = {
  slice: PortfolioSlice;
  allowEmptyHoldings: boolean;
  fingerprint: string;
  updatedAt: string;
  retryCount: number;
  notified?: boolean;
};

function readDurablePendingSnapshots(): Record<string, DurablePendingSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DURABLE_PENDING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, DurablePendingSnapshot>)
      : {};
  } catch {
    return {};
  }
}

function writeDurablePendingSnapshots(pending: Record<string, DurablePendingSnapshot>): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(pending);
    if (keys.length === 0) {
      window.localStorage.removeItem(DURABLE_PENDING_KEY);
      return;
    }
    window.localStorage.setItem(DURABLE_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Ignore storage failures; the in-memory queue still handles active-tab saves.
  }
}

function rememberDurablePendingSnapshot(
  dataUserId: string,
  slice: PortfolioSlice,
  options: SnapshotPushOptions | undefined,
  fingerprint: string,
  retryCount: number,
  notified = false
): void {
  const pending = readDurablePendingSnapshots();
  pending[dataUserId] = {
    slice,
    allowEmptyHoldings: !!options?.allowEmptyHoldings,
    fingerprint,
    updatedAt: new Date().toISOString(),
    retryCount,
    notified,
  };
  writeDurablePendingSnapshots(pending);
}

function clearDurablePendingSnapshot(dataUserId: string, fingerprint: string): void {
  const pending = readDurablePendingSnapshots();
  if (pending[dataUserId]?.fingerprint !== fingerprint) return;
  delete pending[dataUserId];
  writeDurablePendingSnapshots(pending);
}

function scheduleDurableRetry(dataUserId: string, delayMs = 5000): void {
  if (typeof window === "undefined") return;
  if (durableRetryTimersByUser.has(dataUserId)) return;

  const timer = window.setTimeout(() => {
    durableRetryTimersByUser.delete(dataUserId);
    const pending = readDurablePendingSnapshots()[dataUserId];
    if (!pending) return;
    void pushPortfolioSnapshotSlice(dataUserId, pending.slice, {
      force: true,
      allowEmptyHoldings: pending.allowEmptyHoldings,
    });
  }, delayMs);

  durableRetryTimersByUser.set(dataUserId, timer);
}

export function retryPendingPortfolioSnapshot(dataUserId: string): void {
  const pending = readDurablePendingSnapshots()[dataUserId];
  if (!pending) return;
  void pushPortfolioSnapshotSlice(dataUserId, pending.slice, {
    force: true,
    allowEmptyHoldings: pending.allowEmptyHoldings,
  });
}

function notifySnapshotSaveFailure(dataUserId: string, message: string): void {
  if (typeof window === "undefined") return;

  console.error("[pushPortfolioSnapshotSlice] Snapshot save failed after retries.", {
    dataUserId,
    message,
  });

  window.alert(
    "Portfolio save failed after 2 retries. Your latest changes are still queued in this browser and will retry when you reopen the app, but they are not saved to Supabase yet.\n\n" +
      message
  );
}

export function getLastPushedPortfolioFingerprint(dataUserId: string): string {
  return lastPushedFingerprintByUser.get(dataUserId) ?? "";
}

export function markLastPushedPortfolioFingerprint(dataUserId: string, fingerprint: string): void {
  lastPushedFingerprintByUser.set(dataUserId, fingerprint);
}

async function savePortfolioSnapshotViaServer(
  dataUserId: string,
  slice: PortfolioSlice
): Promise<{ error: Error | null }> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  try {
    const response = await fetch(`${basePath}/api/portfolio/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUserId, slice }),
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      return { error: new Error(payload?.error || `Snapshot save failed with HTTP ${response.status}.`) };
    }
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Snapshot save failed.") };
  }
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
  let { error } = await upsertPortfolioSnapshotForCloudUser(supabase, dataUserId, slice);

  if (error) {
    console.warn("[pushPortfolioSnapshotSlice] Direct Supabase save failed; retrying through server.", error.message);
    const fallback = await savePortfolioSnapshotViaServer(dataUserId, slice);
    error = fallback.error;
  }

  if (!error) {
    markLastPushedPortfolioFingerprint(dataUserId, fingerprint);
    clearDurablePendingSnapshot(dataUserId, fingerprint);
  } else {
    const pending = readDurablePendingSnapshots()[dataUserId];
    const previousRetryCount = pending?.fingerprint === fingerprint ? pending.retryCount ?? 0 : 0;
    const alreadyNotified = pending?.fingerprint === fingerprint ? pending.notified === true : false;

    if (previousRetryCount >= 2) {
      rememberDurablePendingSnapshot(dataUserId, slice, options, fingerprint, previousRetryCount, true);
      if (!alreadyNotified) {
        notifySnapshotSaveFailure(dataUserId, error.message);
      }
    } else {
      rememberDurablePendingSnapshot(dataUserId, slice, options, fingerprint, previousRetryCount + 1);
      scheduleDurableRetry(dataUserId);
    }
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

/**
 * Deletes all portfolio snapshot history for the active user.
 * Called on portfolio reset so the home chart starts fresh.
 */
export async function deleteAllPortfolioSnapshots(): Promise<void> {
  if (typeof window === "undefined" || !hasSupabaseConfig()) return;

  let dataUserId = "";
  try {
    dataUserId = sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ?? "";
  } catch {
    dataUserId = "";
  }
  if (!dataUserId) return;

  const supabase = createClient();
  const { error } = await supabase.rpc("delete_portfolio_snapshots", {
    p_user_id: dataUserId,
  });

  if (error) {
    console.error("[deleteAllPortfolioSnapshots] RPC error:", error.message);
  } else {
    console.log("[deleteAllPortfolioSnapshots] ✅ Deleted all portfolio snapshot history");
  }
}
