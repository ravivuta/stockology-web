import { canonicalAccount, displayAccount, preferredAccountLabel } from "@/lib/cash-accounts";

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
  return trimmed.length > 0 ? displayAccount(trimmed) : null;
}

export function fixedIncomeSnapshotSymbol(account: string): string {
  return `${FIXED_INCOME_SNAPSHOT_SYMBOL_PREFIX}${encodeURIComponent(account)}`;
}

export function sanitizeFixedIncomeByAccount(
  input: Record<string, number> | null | undefined
): Record<string, number> {
  if (!input) return {};
  const labels = new Map<string, string>();
  const totals = new Map<string, number>();
  for (const [account, amount] of Object.entries(input)) {
    const name = displayAccount(account);
    const key = name.toLowerCase();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= EPSILON) continue;
    labels.set(key, preferredAccountLabel(labels.get(key), name));
    totals.set(key, (totals.get(key) ?? 0) + n);
  }
  const out: Record<string, number> = {};
  for (const [key, amount] of totals) {
    const name = labels.get(key);
    if (name) out[name] = amount;
  }
  return out;
}

/** Balance for one account, including iOS suffix aliases such as "Fidelity (Retirement)". */
export function fixedIncomeAmountForAccount(
  fixedIncomeByAccount: Record<string, number> | null | undefined,
  account: string
): number {
  if (!fixedIncomeByAccount) return 0;
  const key = displayAccount(account).toLowerCase();
  let total = 0;
  for (const [name, amount] of Object.entries(fixedIncomeByAccount)) {
    if (displayAccount(name).toLowerCase() !== key) continue;
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
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

/** Same keys iOS writes for `$FIXED_INCOME:` rows in `holdingsJSON`. */
export function fixedIncomeSnapshotHoldings(
  fixedIncomeByAccount: Record<string, number> | null | undefined
): Array<{
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice: number;
  pendingOptimization: boolean;
  stockLimit: number;
  transactionLimit: number;
}> {
  if (!fixedIncomeByAccount) return [];
  const rows: Array<{
    symbol: string;
    quantity: number;
    averageCost: number;
    lastPrice: number;
    pendingOptimization: boolean;
    stockLimit: number;
    transactionLimit: number;
  }> = [];

  const merged = sanitizeFixedIncomeByAccount(fixedIncomeByAccount);
  for (const [account, amount] of Object.entries(merged)) {
    const name = displayAccount(account);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= EPSILON) continue;
    rows.push({
      symbol: fixedIncomeSnapshotSymbol(name),
      quantity: n,
      averageCost: 1,
      lastPrice: 1,
      pendingOptimization: false,
      stockLimit: 10_000,
      transactionLimit: 2_500,
    });
  }

  return rows;
}
