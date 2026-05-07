import { NextResponse, type NextRequest } from "next/server";
import { withBasePath } from "@/lib/base-path";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";
import { getStripe } from "@/lib/stripe/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe/subscription-sync";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(withBasePath("/login"), request.url));
  }

  const returnTo = safeRelativeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(new URL(withBasePath(`/settings?billing=success&return_to=${encodeURIComponent(returnTo)}`), request.url));
  }

  try {
    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id && session.client_reference_id !== dataUserId) {
      return NextResponse.redirect(new URL(withBasePath("/settings?billing=error"), request.url));
    }

    if (typeof session.subscription === "string") {
      await syncLatestStripeSubscriptionForUser({
        userId: dataUserId,
        email: user.email ?? "",
      });
    }

    return NextResponse.redirect(new URL(withBasePath(returnTo), request.url));
  } catch (error) {
    console.error("[billing/success] failed", error);
    return NextResponse.redirect(new URL(withBasePath("/settings?billing=error"), request.url));
  }
}
