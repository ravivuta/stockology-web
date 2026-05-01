"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SubRow = {
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
} | null;

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
        const { data } = await supabase.from("user_subscriptions").select("trial_expires_at, subscription_expires_at").eq("user_id", userId).maybeSingle();
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
    if (row === undefined || row === null) return true;
    const now = Date.now();
    const paid = row.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : 0;
    const trial = row.trial_expires_at ? new Date(row.trial_expires_at).getTime() : 0;
    if (paid && paid > now) return true;
    if (trial && trial > now) return true;
    return false;
  })();

  return { row, loading, allowed };
}
