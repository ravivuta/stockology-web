import type { SubscriptionRow } from "@/lib/subscription-state";

export const FREE_TRACKED_STOCK_LIMIT = 25;
export const PREMIUM_TRACKED_STOCK_LIMIT = 200;

const WEBSITE_ADMIN_EMAILS = new Set([
  "appaitechmanager@gmail.com",
  "ravivuta@gmail.com",
  "n87grkdrxp@privaterelay.appleid.com",
  "ravi.vuta@fmc-na.com",
]);

const WEBSITE_PAID_TIERS = new Set(["monthly", "yearly", "weekly", "daily", "pro"]);

export function isWebsiteAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 && WEBSITE_ADMIN_EMAILS.has(normalized);
}

/** Stripe website plan. An App Store product id does not unlock the website. */
export function hasActiveWebsiteSubscription(row: SubscriptionRow): boolean {
  if (!row || row.is_active === false || row.billing_exempt === true) return false;
  const tier = (row.subscription_tier ?? "").trim().toLowerCase();
  if (!WEBSITE_PAID_TIERS.has(tier)) return false;
  if (!row.subscription_expires_at) return true;
  return new Date(row.subscription_expires_at).getTime() > Date.now();
}

/** Admin, billing-exempt, or an active website subscription. */
export function hasPremiumFeatureAccess(row: SubscriptionRow, email?: string | null): boolean {
  if (isWebsiteAdminEmail(email)) return true;
  if (row?.billing_exempt === true) return true;
  return hasActiveWebsiteSubscription(row);
}

export function trackedStockLimit(row: SubscriptionRow, email?: string | null): number {
  return hasPremiumFeatureAccess(row, email) ? PREMIUM_TRACKED_STOCK_LIMIT : FREE_TRACKED_STOCK_LIMIT;
}

export function trackedStockLimitMessage(stockCount: number, row: SubscriptionRow, email?: string | null): string {
  const maxTracked = trackedStockLimit(row, email);
  const hint = hasPremiumFeatureAccess(row, email)
    ? "Remove stocks before adding new ones."
    : `Remove stocks, or subscribe to raise the cap to ${PREMIUM_TRACKED_STOCK_LIMIT}.`;
  return `Cannot add stock. Tracked-stock limit is ${maxTracked} (currently ${stockCount}). ${hint}`;
}
