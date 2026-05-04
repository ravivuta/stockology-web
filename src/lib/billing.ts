import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export type BillingSubState = {
  subscription_tier: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  is_active: boolean;
};

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
