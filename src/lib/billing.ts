import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_MANAGED_TRIAL_MONTHS } from "@/lib/trial-config";
import { isPaidSubscriptionTier } from "@/lib/subscription-state";

export type BillingSubState = {
  subscription_tier: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  is_active: boolean;
};

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function unixToIso(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function currentPeriodEndFromItems(subscription: Stripe.Subscription): number | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (ends.length > 0) {
    return Math.max(...ends);
  }

  if (typeof subscription.cancel_at === "number" && Number.isFinite(subscription.cancel_at)) {
    return subscription.cancel_at;
  }

  return null;
}

function subscriptionTierFromStripeSubscription(subscription: Stripe.Subscription): string {
  if (subscription.status === "trialing") {
    return "trial";
  }

  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  if (interval === "week") return "weekly";
  if (interval === "day") return "daily";

  if (subscription.status === "active" || subscription.status === "past_due") {
    return "pro";
  }

  return "free";
}

export function trialAndSubscriptionFromStripeSubscription(subscription: Stripe.Subscription): BillingSubState {
  const status = subscription.status;
  const trialStartedAt = status === "trialing" ? unixToIso(subscription.trial_start) : null;
  const trialExpiresAt = status === "trialing" ? unixToIso(subscription.trial_end) : null;
  const currentPeriodEndUnix = currentPeriodEndFromItems(subscription);
  const subscriptionExpiresAt =
    status === "active" || status === "past_due"
      ? unixToIso(currentPeriodEndUnix)
      : null;

  return {
    subscription_tier: subscriptionTierFromStripeSubscription(subscription),
    trial_started_at: trialStartedAt,
    trial_expires_at: trialExpiresAt,
    subscription_expires_at: subscriptionExpiresAt,
    is_active: status === "trialing" || status === "active" || status === "past_due",
  };
}

export async function upsertUserSubscriptionState(userId: string, values: BillingSubState) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      ...values,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function clearUserSubscriptionState(userId: string) {
  await upsertUserSubscriptionState(userId, {
    subscription_tier: "free",
    trial_started_at: null,
    trial_expires_at: null,
    subscription_expires_at: null,
    is_active: false,
  });
}

export async function ensureUserHasWebTrial(userId: string, trialMonths = APP_MANAGED_TRIAL_MONTHS) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("user_id, subscription_tier, trial_started_at, trial_expires_at, subscription_expires_at, is_active, billing_exempt")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data?.billing_exempt === true) return false;

  if (data?.user_id) {
    const tier = String(data.subscription_tier ?? "").trim().toLowerCase();
    const startedAt = data.trial_started_at ? new Date(data.trial_started_at) : null;
    const expiresAt = data.trial_expires_at ? new Date(data.trial_expires_at) : null;
    const hasPaidSubscription = Boolean(data.subscription_expires_at);
    const nowMs = Date.now();
    const startedAtMs = startedAt != null && Number.isFinite(startedAt.getTime()) ? startedAt.getTime() : 0;
    const expiresAtMs = expiresAt != null && Number.isFinite(expiresAt.getTime()) ? expiresAt.getTime() : 0;
    const hasFutureTrial = expiresAtMs > nowMs;
    const isPaidTier = isPaidSubscriptionTier(tier);
    const normalizedStartAt =
      startedAt != null && Number.isFinite(startedAt.getTime()) ? startedAt : new Date();
    const targetTrialExpiresAt = addMonths(normalizedStartAt, trialMonths);
    const shouldProvisionFreshTrial =
      !hasPaidSubscription &&
      !isPaidTier &&
      startedAtMs <= 0 &&
      expiresAtMs <= 0;
    const shouldNormalizeTrial =
      !hasPaidSubscription &&
      (
        (tier === "trial" &&
          (startedAtMs <= 0 || expiresAtMs <= 0 || data.is_active !== true)) ||
        (!isPaidTier && hasFutureTrial && data.is_active !== true)
      );

    if (shouldProvisionFreshTrial || shouldNormalizeTrial) {
      await upsertUserSubscriptionState(userId, {
        subscription_tier: "trial",
        trial_started_at: normalizedStartAt.toISOString(),
        trial_expires_at:
          shouldProvisionFreshTrial && !hasFutureTrial
            ? addMonths(new Date(), trialMonths).toISOString()
            : (hasFutureTrial ? expiresAt! : targetTrialExpiresAt).toISOString(),
        subscription_expires_at: null,
        is_active: true,
      });
      return true;
    }

    return false;
  }

  const trialStartedAt = new Date();
  const trialExpiresAt = addMonths(trialStartedAt, trialMonths);

  await upsertUserSubscriptionState(userId, {
    subscription_tier: "trial",
    trial_started_at: trialStartedAt.toISOString(),
    trial_expires_at: trialExpiresAt.toISOString(),
    subscription_expires_at: null,
    is_active: true,
  });

  return true;
}
