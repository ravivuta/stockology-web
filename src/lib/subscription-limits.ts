import { subscriptionAllowsAccess, type SubscriptionRow } from "@/lib/subscription-state";

export const FREE_TRACKED_STOCK_LIMIT = 25;
export const PREMIUM_TRACKED_STOCK_LIMIT = 200;

/** Trial, paid, and billing-exempt accounts unlock the same premium features as iOS. */
export function hasPremiumFeatureAccess(row: SubscriptionRow): boolean {
  return subscriptionAllowsAccess(row);
}

export function trackedStockLimit(row: SubscriptionRow): number {
  return hasPremiumFeatureAccess(row) ? PREMIUM_TRACKED_STOCK_LIMIT : FREE_TRACKED_STOCK_LIMIT;
}

export function trackedStockLimitMessage(stockCount: number, row: SubscriptionRow): string {
  const maxTracked = trackedStockLimit(row);
  const hint = hasPremiumFeatureAccess(row)
    ? "Remove stocks before adding new ones."
    : `Remove stocks, or subscribe to raise the cap to ${PREMIUM_TRACKED_STOCK_LIMIT}.`;
  return `Cannot add stock. Tracked-stock limit is ${maxTracked} (currently ${stockCount}). ${hint}`;
}
