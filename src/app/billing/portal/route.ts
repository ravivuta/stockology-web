import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
  const stripe = getStripe();
  const email = user.email ?? "";
  const customers = email
    ? await stripe.customers.list({ email, limit: 10 })
    : { data: [] as Stripe.Customer[] };
  const customer = customers.data.find((item) => item.metadata?.user_id === dataUserId) ?? customers.data[0];

  if (!customer) {
    return NextResponse.redirect(new URL("/settings?billing=missing_customer", request.url));
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${request.nextUrl.origin}/settings`,
  });

  return NextResponse.redirect(portal.url);
}
