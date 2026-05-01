import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockHolding } from "@/store/portfolioStore";

type PortfolioSlice = {
  cashBalance: number;
  stocks: StockHolding[];
};

function etCalendarDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function holdingPayload(s: StockHolding) {
  const optimized = !s.pendingOptimization;
  return {
    symbol: s.symbol,
    quantity: s.quantity,
    averageCost: s.averageCost,
    lastPrice: s.lastPrice ?? s.averageCost,
    shortSMA: optimized ? s.shortSMA : null,
    dynamicFactor: optimized ? s.dynamicFactor : null,
    stockLimit: optimized ? s.stockLimit : null,
    transactionLimit: optimized ? s.transactionLimit : null,
    targetPrice: optimized && s.targetPrice != null ? s.targetPrice : null,
    recommendation: s.recommendation?.action ?? null,
    moving_avg: s.movingAvg ?? s.recommendation?.movingAvg ?? null,
    isShortlisted: s.isShortlisted ?? true,
    lotHistory: null,
  };
}

function totals(state: PortfolioSlice) {
  let cost = 0;
  let value = 0;
  for (const s of state.stocks) {
    if (s.quantity <= 0) continue;
    cost += s.quantity * s.averageCost;
    value += s.quantity * (s.lastPrice ?? s.averageCost);
  }
  const unrealized = value - cost;
  const totalPortfolio = value + state.cashBalance;
  return { total_cost_basis: cost, total_portfolio_value: totalPortfolio, total_unrealized_gain: unrealized };
}

export function portfolioSyncFingerprint(state: PortfolioSlice): string {
  return JSON.stringify({
    c: state.cashBalance,
    st: state.stocks.map((s) => [
      s.symbol,
      s.quantity,
      s.averageCost,
      s.lastPrice,
      s.shortSMA,
      s.dynamicFactor,
      s.pendingOptimization,
      s.stockLimit,
      s.transactionLimit,
      s.targetPrice,
    ]),
  });
}

/**
 * Saves today's ET-dated snapshot via RPC so holdings are encrypted server-side.
 * Uses `save_portfolio_snapshot` RPC (replaces direct table upsert — columns are
 * now bytea/AES-256-CBC encrypted and cannot be written directly from the client).
 */
export async function upsertPortfolioSnapshotForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  state: PortfolioSlice
): Promise<{ error: Error | null }> {
  const holdings = state.stocks.map(holdingPayload);
  const t = totals(state);

  const { error } = await supabase.rpc("save_portfolio_snapshot", {
    p_user_id: dataUserId,
    p_et_calendar_date: etCalendarDateString(),
    p_holdings: holdings,
    p_cash_balance: state.cashBalance,
    p_total_portfolio_value: t.total_portfolio_value,
    p_total_cost_basis: t.total_cost_basis,
    p_total_unrealized_gain: t.total_unrealized_gain,
  });

  if (error) {
    console.warn("[upsertPortfolioSnapshotForCloudUser]", error.message);
    return { error: new Error(error.message) };
  }
  return { error: null };
}
