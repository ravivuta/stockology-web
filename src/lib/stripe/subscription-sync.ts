import type Stripe from "stripe";
import { clearUserSubscriptionState, trialAndSubscriptionFromStripeSubscription, upsertUserSubscriptionState } from "@/lib/billing";
import { getStripe } from "@/lib/stripe/server";
import type { BillingSubState } from "@/lib/billing";

export type StripeSyncResult =
  | { ok: true; customerId: string; subscriptionId: string | null; state: BillingSubState }
  | { ok: false; reason: "missing_customer" | "missing_subscription" };

function subscriptionRank(status: Stripe.Subscription.Status) {
  if (status === "trialing") return 0;
  if (status === "active") return 1;
  if (status === "past_due") return 2;
  if (status === "paused") return 3;
  if (status === "unpaid") return 4;
  if (status === "canceled") return 5;
  if (status === "incomplete") return 6;
  return 7;
}

function preferredSubscription(subscriptions: Stripe.Subscription[]) {
  const ranked = subscriptions
    .slice()
    .sort((a, b) => subscriptionRank(a.status) - subscriptionRank(b.status) || b.created - a.created);

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
  const orderedCustomers = [
    ...customers.data.filter((item) => item.metadata?.user_id === userId),
    ...customers.data.filter((item) => item.metadata?.user_id !== userId),
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);

  if (orderedCustomers.length === 0) {
    return { ok: false, reason: "missing_customer" };
  }

  const subscriptionCandidates = (
    await Promise.all(
      orderedCustomers.map(async (customer) => {
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 20,
        });
        return subscriptions.data.map((subscription) => ({ customer, subscription }));
      })
    )
  ).flat();

  const bestMatch = subscriptionCandidates
    .slice()
    .sort(
      (a, b) =>
        subscriptionRank(a.subscription.status) - subscriptionRank(b.subscription.status) ||
        b.subscription.created - a.subscription.created
    )[0] ?? null;

  if (!bestMatch) {
    await clearUserSubscriptionState(userId);
    return { ok: false, reason: "missing_subscription" };
  }

  if (bestMatch.customer.metadata?.user_id !== userId) {
    await stripe.customers.update(bestMatch.customer.id, {
      metadata: { ...(bestMatch.customer.metadata ?? {}), user_id: userId },
    });
  }

  const subscription = bestMatch.subscription;
  const state = trialAndSubscriptionFromStripeSubscription(subscription);
  await upsertUserSubscriptionState(userId, state);
  return { ok: true, customerId: bestMatch.customer.id, subscriptionId: subscription.id, state };
}
