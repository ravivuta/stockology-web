import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { getSubscriptionRowForUser } from "@/lib/subscription-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    const row = await getSubscriptionRowForUser(dataUserId);
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load subscription status" },
      { status: 500 }
    );
  }
}
