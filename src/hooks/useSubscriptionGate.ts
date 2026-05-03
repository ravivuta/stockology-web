"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscriptionAllowsAccess, type SubscriptionRow } from "@/lib/subscription-state";

export type SubRow = SubscriptionRow;

/**
 * @param serverRow Omit to fetch on the client. Pass `null` or a row when the RSC layout already loaded subscription (avoids duplicate requests).
 */
export function useSubscriptionGate(userId: string | undefined, serverRow?: SubRow) {
  const fromServer = serverRow !== undefined;
  const [row, setRow] = useState<SubRow | undefined>(() => (fromServer ? serverRow : undefined));
  const [loading, setLoading] = useState(!fromServer && !!userId);

  useEffect(() => {
    if (!userId) {
      setRow(null);
      setLoading(false);
      return;
    }
    if (fromServer) {
      setRow(serverRow);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("user_subscriptions")
          .select("trial_expires_at, subscription_expires_at, subscription_tier, is_active")
          .eq("user_id", userId)
          .maybeSingle();
        if (!cancelled) setRow(data ?? null);
      } catch {
        if (!cancelled) setRow(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fromServer, serverRow]);

  const allowed = (() => {
    if (row === undefined) return true;
    return subscriptionAllowsAccess(row);
  })();

  return { row, loading, allowed };
}
