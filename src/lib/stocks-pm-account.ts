import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";

/**
 * Ensures the current Supabase Auth web user is mapped onto the same canonical
 * Stocks PM account id used by the iOS app for snapshots and subscriptions.
 */
export async function syncStocksPmAuthUser(supabase: SupabaseClient, fallbackAuthUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("sync_stocks_pm_auth_user");
  if (!error && typeof data === "string" && data.length > 0) {
    return data;
  }

  if (error) {
    console.warn("[syncStocksPmAuthUser] RPC failed (run latest Supabase migration?):", error.message);
  }

  return resolveStocksPmDataUserId(supabase, fallbackAuthUserId);
}
