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

/**
 * Mirrors the iOS foreground-open touch so web sessions also populate
 * `public.users.last_app_open_at`.
 */
export async function touchStocksPmLastAppOpen(
  supabase: SupabaseClient,
  dataUserId: string,
  appBuildVersion = "web",
  fallbackAuthUserId?: string
): Promise<void> {
  if (!dataUserId) return;

  const touchOnce = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("touch_last_app_open", {
      p_user_id: userId,
      p_app_build_version: appBuildVersion,
    });

    if (!error) {
      if (typeof data === "boolean") {
        if (data) return true;
        console.warn("[touchStocksPmLastAppOpen] RPC returned no update for user:", userId);
        return false;
      }

      // Some older deployments may not return a boolean body even on success.
      return true;
    }

    // Backward-compatible fallback for projects that only have the older 1-arg RPC.
    const legacy = await supabase.rpc("touch_last_app_open", {
      p_user_id: userId,
    });

    if (legacy.error) {
      console.warn("[touchStocksPmLastAppOpen] RPC failed (run latest Supabase migration?):", legacy.error.message);
      return false;
    }

    if (typeof legacy.data === "boolean") {
      if (legacy.data) return true;
      console.warn("[touchStocksPmLastAppOpen] Legacy RPC returned no update for user:", userId);
      return false;
    }

    return true;
  };

  if (await touchOnce(dataUserId)) return;

  const authUserId = fallbackAuthUserId ?? dataUserId;
  const resolvedUserId = await syncStocksPmAuthUser(supabase, authUserId);
  if (resolvedUserId !== dataUserId) {
    console.warn("[touchStocksPmLastAppOpen] Retrying with remapped canonical user:", resolvedUserId);
  }

  if (!(await touchOnce(resolvedUserId))) {
    console.warn("[touchStocksPmLastAppOpen] Failed to update last_app_open after re-sync retry for user:", resolvedUserId);
  }
}
