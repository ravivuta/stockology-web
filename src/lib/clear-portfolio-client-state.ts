import { usePortfolioStore } from "@/store/portfolioStore";

const ACTIVE_DATA_USER_KEY = "stocks-pm-active-data-user-id";
const ACTIVE_AUTH_USER_KEY = "stocks-pm-active-auth-user-id";
const PORTFOLIO_DRAFT_PREFIX = "stocks-pm-portfolio-draft:";

type PortfolioDraft = {
  cashBalance: number;
  stocks: ReturnType<typeof usePortfolioStore.getState>["stocks"];
  lotsBySymbol: ReturnType<typeof usePortfolioStore.getState>["lotsBySymbol"];
  onboardingComplete: boolean;
};

function getPortfolioDraftKey(dataUserId: string): string {
  return `${PORTFOLIO_DRAFT_PREFIX}${dataUserId}`;
}

function hasMeaningfulPortfolioDraft(draft: PortfolioDraft): boolean {
  return (
    draft.cashBalance > 0 ||
    draft.stocks.length > 0 ||
    draft.onboardingComplete ||
    Object.keys(draft.lotsBySymbol).length > 0
  );
}

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

export function saveCurrentPortfolioDraftForUser(dataUserId?: string): void {
  if (typeof window === "undefined") return;

  let resolvedUserId = dataUserId ?? "";
  try {
    if (!resolvedUserId) {
      resolvedUserId =
        sessionStorage.getItem(ACTIVE_DATA_USER_KEY) ??
        sessionStorage.getItem(ACTIVE_AUTH_USER_KEY) ??
        "";
    }
  } catch {
    resolvedUserId = dataUserId ?? "";
  }
  if (!resolvedUserId) return;

  const state = usePortfolioStore.getState();
  const draft: PortfolioDraft = {
    cashBalance: state.cashBalance,
    stocks: state.stocks,
    lotsBySymbol: state.lotsBySymbol,
    onboardingComplete: state.onboardingComplete,
  };

  try {
    const key = getPortfolioDraftKey(resolvedUserId);
    if (!hasMeaningfulPortfolioDraft(draft)) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* ignore blocked storage / private mode */
  }
}

export function readPortfolioDraftForUser(dataUserId: string): PortfolioDraft | null {
  if (typeof window === "undefined" || !dataUserId) return null;
  try {
    const raw = localStorage.getItem(getPortfolioDraftKey(dataUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortfolioDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      cashBalance: Number(parsed.cashBalance) || 0,
      stocks: Array.isArray(parsed.stocks) ? parsed.stocks : [],
      lotsBySymbol:
        parsed.lotsBySymbol && typeof parsed.lotsBySymbol === "object" ? parsed.lotsBySymbol : {},
      onboardingComplete: parsed.onboardingComplete === true,
    };
  } catch {
    return null;
  }
}

/**
 * Wipe persisted portfolio + session flags so the next session (or account) never inherits another user's book.
 * Call after successful sign-out and when detecting an authenticated user id change.
 */
export function clearPortfolioClientState(): void {
  saveCurrentPortfolioDraftForUser();
  usePortfolioStore.getState().resetAll();
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ACTIVE_DATA_USER_KEY);
    sessionStorage.removeItem(ACTIVE_AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
  clearPortfolioSessionStorageFlags();
}

export { ACTIVE_AUTH_USER_KEY, ACTIVE_DATA_USER_KEY };
