import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionRow } from "@/lib/subscription-state";

export async function getSubscriptionRowForUser(userId: string): Promise<SubscriptionRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("trial_expires_at, subscription_expires_at, subscription_tier, is_active, billing_exempt")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
