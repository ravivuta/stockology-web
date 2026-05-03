import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { clearUserSubscriptionState, trialAndSubscriptionFromStripeSubscription, upsertUserSubscriptionState } from "@/lib/billing";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/server";

export const runtime = "nodejs";

function userIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const value = subscription.metadata?.user_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = userIdFromSubscription(subscription);
  if (!userId) return;
  await upsertUserSubscriptionState(userId, trialAndSubscriptionFromStripeSubscription(subscription));
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.resumed":
      case "customer.subscription.paused":
      case "customer.subscription.trial_will_end": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = userIdFromSubscription(subscription);
        if (userId) {
          await clearUserSubscriptionState(userId);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handling failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
