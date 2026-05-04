import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { subscriptionAllowsAccess } from "@/lib/subscription-state";
import { getStripe, getStripePriceId } from "@/lib/stripe/server";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe/subscription-sync";

export const runtime = "nodejs";

function sanitizedBillingDetail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/[\r\n\u0000]/g, " ").trim().slice(0, 220);
}

function checkoutErrorState(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("stripe_secret_key")) {
    return "billing_env_missing";
  }
  if (normalized.includes("stripe_price_id")) {
    return "billing_price_missing";
  }
  if (normalized.includes("no such price")) {
    return "billing_price_invalid";
  }
  if (normalized.includes("customer") || normalized.includes("checkout") || normalized.includes("subscription")) {
    return "billing_checkout_error";
  }
  return "error";
}

async function findOrCreateCustomer({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name?: string | null;
}) {
  const stripe = getStripe();
  const byEmail = email
    ? await stripe.customers.list({ email, limit: 10 })
    : { data: [] as Array<{ id: string; metadata?: Record<string, string> | null }> };
  const existing = byEmail.data.find((customer) => customer.metadata?.user_id === userId) ?? byEmail.data[0];
  if (existing) {
    if (existing.metadata?.user_id !== userId) {
      await stripe.customers.update(existing.id, {
        metadata: { ...(existing.metadata ?? {}), user_id: userId },
      });
    }
    return existing.id;
  }

  const created = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { user_id: userId },
  });
  return created.id;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const returnTo = safeRelativeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
    let dataUserId = user.id;
    try {
      dataUserId = await syncStocksPmAuthUser(supabase, user.id);
      const { data: subRow } = await supabase
        .from("user_subscriptions")
        .select("trial_expires_at, subscription_expires_at, subscription_tier, is_active")
        .eq("user_id", dataUserId)
        .maybeSingle();

      if (subscriptionAllowsAccess(subRow ?? null)) {
        return NextResponse.redirect(new URL(returnTo, request.url));
      }
    } catch (error) {
      console.warn("[billing/start] preflight sync failed, continuing with auth user id", error);
    }

    const origin = request.nextUrl.origin;
    try {
      const stripeState = await syncLatestStripeSubscriptionForUser({
        userId: dataUserId,
        email: user.email ?? "",
      });
      if (stripeState.ok && subscriptionAllowsAccess(stripeState.state)) {
        return NextResponse.redirect(new URL(returnTo, request.url));
      }
    } catch (error) {
      console.warn("[billing/start] stripe sync pre-check failed, continuing to checkout", error);
    }

    const customerId = await findOrCreateCustomer({
      userId: dataUserId,
      email: user.email ?? "",
      name:
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        null,
    });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: dataUserId,
      line_items: [
        {
          price: getStripePriceId(),
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(returnTo)}`,
      cancel_url: `${origin}/settings?billing=cancelled`,
      metadata: {
        user_id: dataUserId,
        auth_user_id: user.id,
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          user_id: dataUserId,
          auth_user_id: user.id,
        },
      },
    });

    if (!session.url) {
      return NextResponse.redirect(new URL("/settings?billing=error", request.url));
    }

    return NextResponse.redirect(session.url);
  } catch (error) {
    console.error("[billing/start] failed", error);
    const url = new URL(`/settings?billing=${checkoutErrorState(error)}`, request.url);
    const detail = sanitizedBillingDetail(error);
    if (detail) {
      url.searchParams.set("billing_detail", detail);
    }
    return NextResponse.redirect(url);
  }
}
