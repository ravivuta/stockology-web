"use client";
import { useEffect, useState } from "react";
import { subscriptionAllowsAccess, type SubscriptionRow } from "@/lib/subscription-state";

export type SubRow = SubscriptionRow;

/**
 * @param serverRow Omit to fetch on the client. Pass `null` or a row when the RSC layout already loaded subscription (avoids duplicate requests).
 */
export function useSubscriptionGate(userId: string | undefined, serverRow?: SubRow) {
  const fromServer = serverRow !== undefined;
  const [row, setRow] = useState<SubRow | undefined>(() => (fromServer ? serverRow : undefined));
  const [loading, setLoading] = useState(() => {
    if (!userId) return false;
    if (!fromServer) return true;
    return !subscriptionAllowsAccess(serverRow ?? null);
  });

  useEffect(() => {
    if (!userId) {
      setRow(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
      }
      try {
        const response = await fetch("/api/subscription/status", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Subscription status request failed: ${response.status}`);
        }
        const payload = (await response.json()) as { row?: SubscriptionRow | null };
        if (!cancelled) setRow(payload.row ?? null);
      } catch {
        if (!cancelled) setRow(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fromServer, serverRow]);

  useEffect(() => {
    if (fromServer) {
      setRow(serverRow);
    }
  }, [fromServer, serverRow]);

  const allowed = (() => {
    if (row === undefined) return true;
    return subscriptionAllowsAccess(row);
  })();

  return { row, loading, allowed };
}
