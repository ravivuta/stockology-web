import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export type BillingSubState = {
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
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

export function trialAndSubscriptionFromStripeSubscription(subscription: Stripe.Subscription): BillingSubState {
  const status = subscription.status;
  const trialExpiresAt = status === "trialing" ? unixToIso(subscription.trial_end) : null;
  const currentPeriodEndUnix = currentPeriodEndFromItems(subscription);
  const subscriptionExpiresAt =
    status === "active" || status === "past_due"
      ? unixToIso(currentPeriodEndUnix)
      : null;

  return {
    trial_expires_at: trialExpiresAt,
    subscription_expires_at: subscriptionExpiresAt,
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
    trial_expires_at: null,
    subscription_expires_at: null,
  });
}
