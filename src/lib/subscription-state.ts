export type SubscriptionRow = {
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  subscription_tier?: string | null;
  is_active?: boolean | null;
  billing_exempt?: boolean | null;
} | null;

function expiresAtMs(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

export function isPaidSubscriptionTier(value: string | null | undefined) {
  const tier = (value ?? "").trim().toLowerCase();
  return tier !== "" && tier !== "free" && tier !== "trial";
}

export function subscriptionAllowsAccess(row: SubscriptionRow) {
  if (!row) return false;
  if (row.billing_exempt === true) return true;
  if (row.is_active === false) return false;

  const now = Date.now();
  const paid = expiresAtMs(row.subscription_expires_at);
  const trial = expiresAtMs(row.trial_expires_at);

  if (paid > now) return true;
  if (trial > now) return true;

  // iOS-backed rows may identify an active plan by tier even when expiry was not
  // synchronized into the lightweight web gate fields.
  if (isPaidSubscriptionTier(row.subscription_tier) && !row.subscription_expires_at) {
    return true;
  }

  return false;
}
