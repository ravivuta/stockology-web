export const FIXED_INCOME_SNAPSHOT_SYMBOL_PREFIX = "$FIXED_INCOME:";
const EPSILON = 0.005;

export function isFixedIncomeSymbol(symbol: string | null | undefined): boolean {
  return (symbol ?? "").trim().toUpperCase().startsWith(FIXED_INCOME_SNAPSHOT_SYMBOL_PREFIX);
}

export function fixedIncomeAccountNameFromSnapshotSymbol(symbol: string): string | null {
  if (!isFixedIncomeSymbol(symbol)) return null;
  const idx = symbol.indexOf(":");
  if (idx < 0) return null;
  const raw = symbol.slice(idx + 1);
  const decoded = decodeURIComponent(raw);
  const trimmed = decoded.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function fixedIncomeSnapshotSymbol(account: string): string {
  return `${FIXED_INCOME_SNAPSHOT_SYMBOL_PREFIX}${encodeURIComponent(account)}`;
}

export function sanitizeFixedIncomeByAccount(
  input: Record<string, number> | null | undefined
): Record<string, number> {
  if (!input) return {};
  const out: Record<string, number> = {};
  for (const [account, amount] of Object.entries(input)) {
    const name = account.trim();
    if (!name) continue;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= EPSILON) continue;
    out[name] = n;
  }
  return out;
}

export function fixedIncomeTotal(
  fixedIncomeByAccount: Record<string, number> | null | undefined
): number {
  if (!fixedIncomeByAccount) return 0;
  return Object.values(fixedIncomeByAccount).reduce((sum, amount) => {
    const n = Number(amount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export function fixedIncomeSnapshotHoldings(
  fixedIncomeByAccount: Record<string, number> | null | undefined
): Array<{
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice: number;
  pendingOptimization: boolean;
  shortSMA: null;
  dynamicFactor: null;
  stockLimit: null;
  transactionLimit: null;
  targetPrice: null;
  recommendation: null;
  moving_avg: null;
  isShortlisted: boolean;
  lotHistory: null;
  noAutoBuy: null;
  excludeFromShortlist: null;
  isETF: boolean;
  enableRSIReversalGate: null;
  rsiPeriod: null;
  rsiOversoldThreshold: null;
  rsiOverboughtThreshold: null;
  rsiHysteresisPoints: null;
  rsiMinRisingDays: null;
}> {
  if (!fixedIncomeByAccount) return [];
  const rows: Array<{
    symbol: string;
    quantity: number;
    averageCost: number;
    lastPrice: number;
    pendingOptimization: boolean;
    shortSMA: null;
    dynamicFactor: null;
    stockLimit: null;
    transactionLimit: null;
    targetPrice: null;
    recommendation: null;
    moving_avg: null;
    isShortlisted: boolean;
    lotHistory: null;
    noAutoBuy: null;
    excludeFromShortlist: null;
    isETF: boolean;
    enableRSIReversalGate: null;
    rsiPeriod: null;
    rsiOversoldThreshold: null;
    rsiOverboughtThreshold: null;
    rsiHysteresisPoints: null;
    rsiMinRisingDays: null;
  }> = [];

  for (const [account, amount] of Object.entries(fixedIncomeByAccount)) {
    const name = account.trim();
    const n = Number(amount);
    if (!name || !Number.isFinite(n) || n <= EPSILON) continue;
    rows.push({
      symbol: fixedIncomeSnapshotSymbol(name),
      quantity: n,
      averageCost: 1,
      lastPrice: 1,
      pendingOptimization: false,
      shortSMA: null,
      dynamicFactor: null,
      stockLimit: null,
      transactionLimit: null,
      targetPrice: null,
      recommendation: null,
      moving_avg: null,
      isShortlisted: false,
      lotHistory: null,
      noAutoBuy: null,
      excludeFromShortlist: null,
      isETF: false,
      enableRSIReversalGate: null,
      rsiPeriod: null,
      rsiOversoldThreshold: null,
      rsiOverboughtThreshold: null,
      rsiHysteresisPoints: null,
      rsiMinRisingDays: null,
    });
  }

  return rows;
}
