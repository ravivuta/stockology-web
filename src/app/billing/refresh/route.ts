import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe/subscription-sync";

export const runtime = "nodejs";

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
    return NextResponse.redirect(new URL("/settings?billing=portal_error", request.url));
  }
}
