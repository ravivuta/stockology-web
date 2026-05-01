import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the `user_id` used in `user_portfolio_snapshots` / `user_subscriptions`.
 * iOS uses Google subject / Apple id; web uses Supabase Auth UUID — same email must still match.
 * Requires migrations through `20260403120000_resolve_stocks_pm_data_user_id_v2.sql` on Supabase.
 */
export async function resolveStocksPmDataUserId(supabase: SupabaseClient, fallbackAuthUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("resolve_stocks_pm_data_user_id");
  if (error) {
    console.warn("[resolveStocksPmDataUserId] RPC failed (run latest Supabase migration?):", error.message);
    return fallbackAuthUserId;
  }
  if (typeof data === "string" && data.length > 0) {
    return data;
  }
  return fallbackAuthUserId;
}
