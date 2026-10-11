const HISTORICAL_PRICE_PREFIX = "stocks-pm-historical-price-cache:";
const PORTFOLIO_DRAFT_PREFIX = "stocks-pm-portfolio-draft:";
const CHART_CACHE_KEYS = ["dash_chart_cloudPts", "dash_chart_spySeries", "dash_chart_extFlows"];

let regenerableCacheDisabled = false;

/** After one quota failure, stop writing rebuildable caches for the rest of this page load. */
export function shouldPersistRegenerableCache(): boolean {
  return !regenerableCacheDisabled;
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  return error instanceof Error && /quota/i.test(error.name + error.message);
}

function keysMatching(predicate: (key: string) => boolean): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && predicate(key)) keys.push(key);
  }
  return keys;
}

/** Drop caches that the app can rebuild. Leave the login session and portfolio key alone. */
export function evictRegenerableLocalStorage(): void {
  if (typeof window === "undefined") return;
  const keys = keysMatching(
    (key) =>
      key.startsWith(HISTORICAL_PRICE_PREFIX) ||
      key.startsWith(PORTFOLIO_DRAFT_PREFIX) ||
      CHART_CACHE_KEYS.includes(key)
  );
  for (const key of keys) localStorage.removeItem(key);
}

export function setLocalStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    if (!isQuotaError(error)) return;
    regenerableCacheDisabled = true;
    evictRegenerableLocalStorage();
    try {
      localStorage.setItem(key, value);
    } catch {
      // In-memory state stays. The cloud snapshot is reloaded on the next visit.
    }
  }
}
