import { usePortfolioStore } from "@/store/portfolioStore";

const ACTIVE_DATA_USER_KEY = "stocks-pm-active-data-user-id";

/** sessionStorage flags used by PortfolioCloudBridge — must reset when switching accounts. */
export function clearPortfolioSessionStorageFlags(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("stocks-pm-cloud-hydrated:")) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Wipe persisted portfolio + session flags so the next session (or account) never inherits another user's book.
 * Call after successful sign-out and when detecting an authenticated user id change.
 */
export function clearPortfolioClientState(): void {
  usePortfolioStore.getState().resetAll();
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ACTIVE_DATA_USER_KEY);
  } catch {
    /* ignore */
  }
  clearPortfolioSessionStorageFlags();
}

export { ACTIVE_DATA_USER_KEY };
