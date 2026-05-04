import type Stripe from "stripe";
import { clearUserSubscriptionState, trialAndSubscriptionFromStripeSubscription, upsertUserSubscriptionState } from "@/lib/billing";
import { getStripe } from "@/lib/stripe/server";

export type StripeSyncResult =
  | { ok: true; customerId: string; subscriptionId: string | null }
  | { ok: false; reason: "missing_customer" | "missing_subscription" };

function preferredSubscription(subscriptions: Stripe.Subscription[]) {
  const ranked = subscriptions
    .slice()
    .sort((a, b) => {
      const rank = (status: Stripe.Subscription.Status) => {
        if (status === "trialing") return 0;
        if (status === "active") return 1;
        if (status === "past_due") return 2;
        if (status === "paused") return 3;
        if (status === "unpaid") return 4;
        if (status === "canceled") return 5;
        if (status === "incomplete") return 6;
        return 7;
      };
      return rank(a.status) - rank(b.status) || b.created - a.created;
    });

  return ranked[0] ?? null;
}

export async function syncLatestStripeSubscriptionForUser({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<StripeSyncResult> {
  const stripe = getStripe();
  const customers = email
    ? await stripe.customers.list({ email, limit: 10 })
    : { data: [] as Stripe.Customer[] };
  const customer = customers.data.find((item) => item.metadata?.user_id === userId) ?? customers.data[0];

  if (!customer) {
    return { ok: false, reason: "missing_customer" };
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 20,
  });
  const subscription = preferredSubscription(subscriptions.data);

  if (!subscription) {
    await clearUserSubscriptionState(userId);
    return { ok: false, reason: "missing_subscription" };
  }

  await upsertUserSubscriptionState(userId, trialAndSubscriptionFromStripeSubscription(subscription));
  return { ok: true, customerId: customer.id, subscriptionId: subscription.id };
}
