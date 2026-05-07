import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { withBasePath } from "@/lib/base-path";
import { createClient } from "@/lib/supabase/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { getSubscriptionRowForUser } from "@/lib/subscription-admin";
import { subscriptionAllowsAccess } from "@/lib/subscription-state";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

function portalErrorState(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("stripe_secret_key")) {
    return "portal_env_missing";
  }
  if (normalized.includes("billing portal") || normalized.includes("no configuration provided")) {
    return "portal_not_configured";
  }
  return "portal_error";
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL(withBasePath("/login"), request.url));
    }

    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    const currentRow = await getSubscriptionRowForUser(dataUserId);
    if (currentRow?.billing_exempt === true) {
      return NextResponse.redirect(new URL(withBasePath("/settings?billing=admin_access"), request.url));
    }
    const hasAppAccess = subscriptionAllowsAccess(currentRow);
    const stripe = getStripe();
    const email = user.email ?? "";
    const customers = email
      ? await stripe.customers.list({ email, limit: 10 })
      : { data: [] as Stripe.Customer[] };
    const customer = customers.data.find((item) => item.metadata?.user_id === dataUserId) ?? customers.data[0];

    if (!customer) {
      return NextResponse.redirect(new URL(withBasePath(`/settings?billing=${hasAppAccess ? "portal_unavailable" : "missing_customer"}`), request.url));
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });
    const hasStripeSubscription = subscriptions.data.some((subscription) =>
      ["trialing", "active", "past_due", "paused", "canceled", "unpaid"].includes(subscription.status)
    );

    if (!hasStripeSubscription) {
      return NextResponse.redirect(new URL(withBasePath("/settings?billing=portal_unavailable"), request.url));
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${request.nextUrl.origin}${withBasePath("/settings")}`,
    });

    return NextResponse.redirect(portal.url);
  } catch (error) {
    console.error("[billing/portal] failed", error);
    return NextResponse.redirect(new URL(withBasePath(`/settings?billing=${portalErrorState(error)}`), request.url));
  }
}
