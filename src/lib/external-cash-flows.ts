"use client";

import { ACTIVE_DATA_USER_KEY } from "@/lib/clear-portfolio-client-state";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

export type ExternalCashFlowType = "deposit" | "withdrawal" | "correction";

export type ExternalCashFlowEvent = {
  id: number;
  user_id: string;
  occurred_at: string;
  amount: number;
  flow_type: ExternalCashFlowType;
  source: string | null;
  note: string | null;
  balance_before: number | null;
  balance_after: number | null;
  created_at: string;
};

async function resolveActiveDataUserId(): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;

  try {
    const fromSession = sessionStorage.getItem(ACTIVE_DATA_USER_KEY);
    if (fromSession) return fromSession;
  } catch {
    // Ignore sessionStorage access issues and fall through to auth resolution.
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;
  return resolveStocksPmDataUserId(supabase, uid);
}

export async function recordExternalCashFlow(input: {
  amount: number;
  flowType?: ExternalCashFlowType;
  source: string;
  note?: string | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  occurredAt?: string;
}): Promise<{ error: Error | null; id: number | null }> {
  if (!hasSupabaseConfig()) return { error: null, id: null };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) {
    return { error: null, id: null };
  }

  const dataUserId = await resolveActiveDataUserId();
  if (!dataUserId) {
    const err = new Error("No active Stocks PM user id available for external cash flow logging.");
    console.error("[recordExternalCashFlow] ERROR:", err.message);
    return { error: err, id: null };
  }

  console.log("[recordExternalCashFlow] Logging flow:", {
    amount,
    flowType: input.flowType ?? (amount > 0 ? "deposit" : "withdrawal"),
    source: input.source,
    dataUserId: dataUserId.substring(0, 8) + "...",
  });

  const supabase = createClient();
  const flowType: ExternalCashFlowType =
    input.flowType ?? (amount > 0 ? "deposit" : "withdrawal");
  const { data, error } = await supabase.rpc("log_external_cash_flow", {
    p_user_id: dataUserId,
    p_amount: amount,
    p_flow_type: flowType,
    p_source: input.source,
    p_note: input.note ?? null,
    p_balance_before: input.balanceBefore ?? null,
    p_balance_after: input.balanceAfter ?? null,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
  });

  if (error) {
    console.error("[recordExternalCashFlow] RPC error:", error.message);
    return { error: new Error(error.message), id: null };
  }

  const id = typeof data === "number" ? data : Number(data);
  if (Number.isFinite(id)) {
    console.log("[recordExternalCashFlow] ✅ Logged flow ID:", id);
  }
  return { error: null, id: Number.isFinite(id) ? id : null };
}

export async function fetchExternalCashFlows(limit = 500): Promise<ExternalCashFlowEvent[]> {
  if (!hasSupabaseConfig()) return [];
  const dataUserId = await resolveActiveDataUserId();
  if (!dataUserId) return [];

  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_external_cash_flows", {
    p_user_id: dataUserId,
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) return [];
  return data as ExternalCashFlowEvent[];
}
