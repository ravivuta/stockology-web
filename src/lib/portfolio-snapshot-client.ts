"use client";

import { ACTIVE_DATA_USER_KEY } from "@/lib/clear-portfolio-client-state";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import {
  portfolioSyncFingerprint,
  upsertPortfolioSnapshotForCloudUser,
  patchPortfolioSnapshotCashForCloudUser,
  patchPortfolioSnapshotHoldingsForCloudUser,
  type PortfolioSlice,
} from "@/lib/portfolio-cloud-sync";
import { usePortfolioStore } from "@/store/portfolioStore";

const lastPushedFingerprintByUser = new Map<string, string>();
const pendingLocalMutationAtByUser = new Map<string, string>();
const DURABLE_PENDING_KEY = "stocks-pm-pending-portfolio-snapshots:v1";
const SAVED_LOCAL_MUTATION_KEY = "stocks-pm-saved-local-mutation:v1";
const durableRetryTimersByUser = new Map<string, number>();
let accountDeletionBlocksSnapshotPush = false;

type SnapshotPushOptions = {
  force?: boolean;
  allowEmptyHoldings?: boolean;
  /** Client `lastLocalMutationAt` captured with this slice. */
  localMutationAt?: string;
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

/** Stop snapshot writes while an account delete removes the cloud user. */
export function setAccountDeletionBlocksSnapshotPush(blocked: boolean) {
  accountDeletionBlocksSnapshotPush = blocked;
  if (!blocked) return;
  snapshotPushQueueByUser.clear();
  pendingLocalMutationAtByUser.clear();
  for (const timer of durableRetryTimersByUser.values()) {
    window.clearTimeout(timer);
  }
  durableRetryTimersByUser.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DURABLE_PENDING_KEY);
    window.localStorage.removeItem(SAVED_LOCAL_MUTATION_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

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
  localMutationAt?: string;
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
    localMutationAt: options?.localMutationAt,
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
      localMutationAt: pending.localMutationAt,
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
    localMutationAt: pending.localMutationAt,
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

function readSavedLocalMutations(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SAVED_LOCAL_MUTATION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const saved: Record<string, string> = {};
    for (const [userId, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) saved[userId] = value;
    }
    return saved;
  } catch {
    return {};
  }
}

function writeSavedLocalMutations(saved: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_LOCAL_MUTATION_KEY, JSON.stringify(saved));
  } catch {
    // The portfolio store already handles quota pressure. Missing this marker
    // only falls back to the snapshot timestamp check.
  }
}

/** Record a local edit before its snapshot write finishes so refresh cannot replace it. */
export function noteUnsavedLocalPortfolioMutation(dataUserId: string, localMutationAt: string | null | undefined): void {
  if (!dataUserId || !localMutationAt) return;
  const next = Date.parse(localMutationAt);
  if (!Number.isFinite(next)) return;
  const previous = Date.parse(pendingLocalMutationAtByUser.get(dataUserId) ?? "");
  if (Number.isFinite(previous) && previous > next) return;
  pendingLocalMutationAtByUser.set(dataUserId, localMutationAt);
}

function markSnapshotSavedLocalMutation(dataUserId: string, localMutationAt: string | undefined): void {
  if (!dataUserId || !localMutationAt) return;
  const next = Date.parse(localMutationAt);
  if (!Number.isFinite(next)) return;
  const saved = readSavedLocalMutations();
  const previous = Date.parse(saved[dataUserId] ?? "");
  if (!Number.isFinite(previous) || next >= previous) {
    saved[dataUserId] = localMutationAt;
    writeSavedLocalMutations(saved);
  }
  const pending = Date.parse(pendingLocalMutationAtByUser.get(dataUserId) ?? "");
  if (!Number.isFinite(pending) || pending <= next) {
    pendingLocalMutationAtByUser.delete(dataUserId);
  }
}

/** True when this browser has a portfolio edit that has not been confirmed in the snapshot. */
export function localPortfolioMutationIsUnsaved(
  dataUserId: string,
  lastLocalMutationAt: string | null | undefined
): boolean {
  if (!dataUserId) return false;
  const savedMs = Date.parse(readSavedLocalMutations()[dataUserId] ?? "");
  const pendingMs = Date.parse(pendingLocalMutationAtByUser.get(dataUserId) ?? "");
  const localMs = Date.parse(lastLocalMutationAt ?? "");
  if (Number.isFinite(pendingMs) && (!Number.isFinite(savedMs) || pendingMs > savedMs)) return true;
  if (Number.isFinite(localMs) && Number.isFinite(savedMs) && localMs > savedMs) return true;
  return false;
}

async function savePortfolioSnapshotViaServer(
  dataUserId: string,
  slice: PortfolioSlice,
  options?: SnapshotPushOptions
): Promise<{ error: Error | null; skipped?: boolean }> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  try {
    const response = await fetch(`${basePath}/api/portfolio/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUserId,
        slice,
        allowEmptyHoldings: !!options?.allowEmptyHoldings,
      }),
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; skipped?: boolean } | null;
    if (!response.ok) {
      return { error: new Error(payload?.error || `Snapshot save failed with HTTP ${response.status}.`) };
    }
    return { error: null, skipped: payload?.skipped === true };
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
  let saved = await upsertPortfolioSnapshotForCloudUser(supabase, dataUserId, slice, {
    allowEmptyHoldings: options?.allowEmptyHoldings,
  });
  let error = saved.error;

  if (saved.skipped) {
    return { error: null, skipped: true, fingerprint };
  }

  if (error) {
    console.warn("[pushPortfolioSnapshotSlice] Direct Supabase save failed; retrying through server.", error.message);
    const fallback = await savePortfolioSnapshotViaServer(dataUserId, slice, options);
    error = fallback.error;
    saved = { error: fallback.error, skipped: fallback.skipped };
    if (fallback.skipped) {
      return { error: null, skipped: true, fingerprint };
    }
  }

  if (!error) {
    markLastPushedPortfolioFingerprint(dataUserId, fingerprint);
    markSnapshotSavedLocalMutation(dataUserId, options?.localMutationAt);
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

function newerLocalMutationAt(existing: string | undefined, incoming: string | undefined): string | undefined {
  const existingMs = Date.parse(existing ?? "");
  const incomingMs = Date.parse(incoming ?? "");
  if (!Number.isFinite(existingMs)) return incoming;
  if (!Number.isFinite(incomingMs)) return existing;
  return incomingMs >= existingMs ? incoming : existing;
}

function mergeSnapshotPushOptions(
  existing: SnapshotPushOptions | undefined,
  incoming: SnapshotPushOptions | undefined
): SnapshotPushOptions | undefined {
  if (!existing && !incoming) return undefined;
  return {
    force: !!existing?.force || !!incoming?.force,
    allowEmptyHoldings: !!existing?.allowEmptyHoldings || !!incoming?.allowEmptyHoldings,
    localMutationAt: newerLocalMutationAt(existing?.localMutationAt, incoming?.localMutationAt),
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
  if (accountDeletionBlocksSnapshotPush) {
    return { error: null, skipped: true, fingerprint: "" };
  }
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
    return { error: new Error("Cloud save is not configured."), skipped: true };
  }

  let dataUserId = "";
  try {
    dataUserId = sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ?? "";
  } catch {
    dataUserId = "";
  }
  if (!dataUserId) return { error: new Error("Not signed in."), skipped: true };

  const state = usePortfolioStore.getState();
  const slice: PortfolioSlice = {
    cashBalance: state.cashBalance,
    fixedIncomeByAccount: state.fixedIncomeByAccount,
    stocks: state.stocks,
    lotsBySymbol: state.lotsBySymbol,
  };
  noteUnsavedLocalPortfolioMutation(dataUserId, state.lastLocalMutationAt);

  const result = await pushPortfolioSnapshotSlice(dataUserId, slice, {
    force,
    allowEmptyHoldings: options?.allowEmptyHoldings,
    localMutationAt: state.lastLocalMutationAt ?? undefined,
  });
  return { error: result.error, skipped: result.skipped };
}

export async function patchCurrentPortfolioSnapshotCash(
  markPendingOptimization: boolean
): Promise<{ error: Error | null; patched: boolean }> {
  if (typeof window === "undefined" || !hasSupabaseConfig()) {
    return { error: null, patched: false };
  }

  let dataUserId = "";
  try {
    dataUserId = sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ?? "";
  } catch {
    dataUserId = "";
  }
  if (!dataUserId) return { error: null, patched: false };

  const state = usePortfolioStore.getState();
  const supabase = createClient();
  const result = await patchPortfolioSnapshotCashForCloudUser(
    supabase,
    dataUserId,
    state.cashBalance,
    markPendingOptimization
  );
  if (!result.error && result.patched) {
    markLastPushedPortfolioFingerprint(
      dataUserId,
      portfolioSyncFingerprint({
        cashBalance: state.cashBalance,
        fixedIncomeByAccount: state.fixedIncomeByAccount,
        stocks: state.stocks,
        lotsBySymbol: state.lotsBySymbol,
      })
    );
  }
  return result;
}

export async function patchCurrentPortfolioSnapshotHoldings(
  removedSymbols: string[] = []
): Promise<{ error: Error | null; patched: boolean }> {
  if (typeof window === "undefined" || !hasSupabaseConfig()) {
    return { error: null, patched: false };
  }

  let dataUserId = "";
  try {
    dataUserId = sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ?? "";
  } catch {
    dataUserId = "";
  }
  if (!dataUserId) return { error: null, patched: false };

  const state = usePortfolioStore.getState();
  const slice: PortfolioSlice = {
    cashBalance: state.cashBalance,
    fixedIncomeByAccount: state.fixedIncomeByAccount,
    stocks: state.stocks,
    lotsBySymbol: state.lotsBySymbol,
  };
  const supabase = createClient();
  const result = await patchPortfolioSnapshotHoldingsForCloudUser(supabase, dataUserId, slice, removedSymbols);
  if (!result.error && result.patched) {
    markLastPushedPortfolioFingerprint(dataUserId, portfolioSyncFingerprint(slice));
  }
  return result;
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
