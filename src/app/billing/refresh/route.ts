import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { getSubscriptionRowForUser } from "@/lib/subscription-admin";
import { subscriptionAllowsAccess } from "@/lib/subscription-state";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe/subscription-sync";

export const runtime = "nodejs";

function sanitizedBillingDetail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/[\r\n\u0000]/g, " ").trim().slice(0, 220);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const returnTo = safeRelativeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");

  try {
    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    const currentRow = await getSubscriptionRowForUser(dataUserId);
    if (subscriptionAllowsAccess(currentRow)) {
      return NextResponse.redirect(new URL(returnTo, request.url));
    }

    const result = await syncLatestStripeSubscriptionForUser({
      userId: dataUserId,
      email: user.email ?? "",
    });

    if (!result.ok) {
      return NextResponse.redirect(new URL(`/settings?billing=${result.reason}`, request.url));
    }

    return NextResponse.redirect(new URL(returnTo, request.url));
  } catch (error) {
    console.error("[billing/refresh] failed", error);
    const url = new URL("/settings?billing=refresh_error", request.url);
    const detail = sanitizedBillingDetail(error);
    if (detail) {
      url.searchParams.set("billing_detail", detail);
    }
    return NextResponse.redirect(url);
  }
}
