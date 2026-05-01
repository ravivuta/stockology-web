/** Latest row shape from `user_portfolio_snapshots` (iOS sync). */
export type PortfolioSnapshotRow = {
  holdings: unknown;
  cash_balance: unknown;
  total_portfolio_value: unknown;
};

/**
 * True when the user already has portfolio data in Supabase from the mobile app (or any client that syncs snapshots).
 * Used to skip web onboarding for returning mobile users who never set `stocks_pm_onboarding_done` on web.
 */
export function snapshotIndicatesExistingAccount(row: PortfolioSnapshotRow | null | undefined): boolean {
  if (!row) return false;
  const cash = Number(row.cash_balance ?? 0);
  if (Number.isFinite(cash) && cash > 0) return true;
  const tpv = Number(row.total_portfolio_value ?? 0);
  if (Number.isFinite(tpv) && tpv > 0) return true;
  const h = row.holdings;
  if (Array.isArray(h) && h.length > 0) return true;
  return false;
}
