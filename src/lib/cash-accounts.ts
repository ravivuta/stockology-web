export const CASH_SYMBOL = "$CASH";
export const CASH_UNIT_PRICE = 1;
export const DEFAULT_ACCOUNT = "Default Account";
export const UNASSIGNED_ACCOUNT = DEFAULT_ACCOUNT;
const LEGACY_UNASSIGNED_ACCOUNT = "Unassigned";

const EPSILON = 0.005;

export function isCashSymbol(symbol: string | null | undefined): boolean {
  return (symbol ?? "").trim().toUpperCase() === CASH_SYMBOL;
}

export function displayAccount(account: string | null | undefined): string {
  const trimmed = (account ?? "").trim();
  if (!trimmed) return DEFAULT_ACCOUNT;
  const key = trimmed.toLowerCase();
  if (key === LEGACY_UNASSIGNED_ACCOUNT.toLowerCase() || key === DEFAULT_ACCOUNT.toLowerCase()) {
    return DEFAULT_ACCOUNT;
  }
  return trimmed;
}

function accountKey(account: string | null | undefined): string {
  return displayAccount(account).toLowerCase();
}

export type CashLotBundle = { open: Array<{
  id: string;
  quantity: number;
  costBasis: number;
  purchaseDate: string;
  account?: string;
  isRetirementAccount?: boolean | null;
  status: "open" | "partiallySold" | "fullySold" | "washSaleRestricted";
}>; sold: Array<{
  saleDate: string;
  quantity: number;
  salePrice: number;
  realizedGainLoss: number;
}> };

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cashLotQuantity(lots: CashLotBundle | undefined): number {
  return Math.max(0, (lots?.open ?? []).reduce((sum, lot) => sum + Math.max(0, Number(lot.quantity) || 0), 0));
}

export function cashByAccount(lots: CashLotBundle | undefined): Record<string, number> {
  const totals = new Map<string, { name: string; amount: number }>();
  for (const lot of lots?.open ?? []) {
    const qty = Number(lot.quantity) || 0;
    if (qty <= EPSILON) continue;
    const name = displayAccount(lot.account);
    const key = accountKey(name);
    const existing = totals.get(key);
    totals.set(key, { name: existing?.name ?? name, amount: (existing?.amount ?? 0) + qty });
  }
  const named: Record<string, number> = {};
  for (const { name, amount } of totals.values()) named[name] = amount;
  return named;
}

export function knownCashAccounts(
  lotsBySymbol: Record<string, CashLotBundle>,
  stockSymbols: string[]
): string[] {
  const names = new Map<string, string>();

  const remember = (account: string | null | undefined) => {
    const name = displayAccount(account);
    const key = accountKey(name);
    if (!names.has(key) || names.get(key) === UNASSIGNED_ACCOUNT) {
      names.set(key, name);
    }
  };

  for (const lot of lotsBySymbol[CASH_SYMBOL]?.open ?? []) {
    if ((Number(lot.quantity) || 0) > EPSILON) remember(lot.account);
  }
  for (const symbol of stockSymbols) {
    if (isCashSymbol(symbol)) continue;
    for (const lot of lotsBySymbol[symbol]?.open ?? []) {
      if ((Number(lot.quantity) || 0) > EPSILON) remember(lot.account);
    }
  }

  const values = [...names.values()];
  if (values.length === 0) return [UNASSIGNED_ACCOUNT];

  return values.sort((a, b) => {
    if (a === UNASSIGNED_ACCOUNT) return 1;
    if (b === UNASSIGNED_ACCOUNT) return -1;
    return a.localeCompare(b);
  });
}

export function migrateCashLots(
  lotsBySymbol: Record<string, CashLotBundle>,
  fallbackCash: number
): Record<string, CashLotBundle> {
  const existing = lotsBySymbol[CASH_SYMBOL];
  const hasLots = (existing?.open ?? []).some((lot) => (Number(lot.quantity) || 0) > EPSILON);
  if (hasLots) return lotsBySymbol;
  const cash = Math.max(0, fallbackCash);
  if (cash <= EPSILON) return lotsBySymbol;
  return replaceCashLots(lotsBySymbol, { [UNASSIGNED_ACCOUNT]: cash });
}

export function replaceCashLots(
  lotsBySymbol: Record<string, CashLotBundle>,
  amountsByAccount: Record<string, number>
): Record<string, CashLotBundle> {
  const sold = lotsBySymbol[CASH_SYMBOL]?.sold ?? [];
  const merged = new Map<string, { name: string; amount: number }>();
  for (const [rawName, rawAmount] of Object.entries(amountsByAccount)) {
    const name = displayAccount(rawName);
    const key = accountKey(name);
    const amount = Math.max(0, Number(rawAmount) || 0);
    const existing = merged.get(key);
    merged.set(key, { name, amount: (existing?.amount ?? 0) + amount });
  }
  const open = [...merged.values()]
    .filter((entry) => entry.amount > EPSILON)
    .map((entry) => ({
      id: uid(),
      quantity: entry.amount,
      costBasis: CASH_UNIT_PRICE,
      purchaseDate: new Date().toISOString(),
      account: entry.name,
      isRetirementAccount: null,
      status: "open" as const,
    }));
  return { ...lotsBySymbol, [CASH_SYMBOL]: { open, sold } };
}

export function applyCashDelta(
  lotsBySymbol: Record<string, CashLotBundle>,
  account: string | null | undefined,
  signedDollars: number
): Record<string, CashLotBundle> {
  if (!Number.isFinite(signedDollars) || Math.abs(signedDollars) < EPSILON) return lotsBySymbol;
  const existing = lotsBySymbol[CASH_SYMBOL] ?? { open: [], sold: [] };
  const next = {
    ...lotsBySymbol,
    [CASH_SYMBOL]: {
      open: existing.open.map((lot) => ({ ...lot })),
      sold: existing.sold,
    },
  };
  const bundle = next[CASH_SYMBOL];
  const preferred = displayAccount(account);

  if (signedDollars > 0) {
    credit(bundle, preferred, signedDollars);
  } else {
    let remaining = -signedDollars;
    remaining = debitPreferred(bundle, preferred, remaining);
    if (remaining > EPSILON && accountKey(preferred) !== accountKey(UNASSIGNED_ACCOUNT)) {
      remaining = debitPreferred(bundle, UNASSIGNED_ACCOUNT, remaining);
    }
    if (remaining > EPSILON) {
      const order = bundle.open
        .map((_, index) => index)
        .sort((a, b) => bundle.open[b].quantity - bundle.open[a].quantity);
      for (const index of order) {
        remaining = debitAt(bundle, index, remaining);
        if (remaining <= EPSILON) break;
      }
    }
    bundle.open = bundle.open.filter((lot) => lot.quantity > EPSILON);
  }
  return next;
}

function credit(bundle: CashLotBundle, accountName: string, amount: number) {
  const key = accountKey(accountName);
  const match = bundle.open.find((lot) => accountKey(lot.account) === key);
  if (match) {
    match.quantity += amount;
    return;
  }
  bundle.open.push({
    id: uid(),
    quantity: amount,
    costBasis: CASH_UNIT_PRICE,
    purchaseDate: new Date().toISOString(),
    account: accountName,
    isRetirementAccount: null,
    status: "open",
  });
}

function debitPreferred(bundle: CashLotBundle, accountName: string, remaining: number): number {
  const key = accountKey(accountName);
  const index = bundle.open.findIndex((lot) => accountKey(lot.account) === key);
  if (index < 0) return remaining;
  return debitAt(bundle, index, remaining);
}

function debitAt(bundle: CashLotBundle, index: number, remaining: number): number {
  if (remaining <= EPSILON || index < 0 || index >= bundle.open.length) return remaining;
  const available = bundle.open[index].quantity;
  const take = Math.min(available, remaining);
  bundle.open[index].quantity = Math.max(0, available - take);
  return remaining - take;
}

export function cashHoldingPayload(lots: CashLotBundle | undefined) {
  const open = lots?.open ?? [];
  const sold = lots?.sold ?? [];
  const quantity = cashLotQuantity(lots);
  return {
    symbol: CASH_SYMBOL,
    quantity,
    averageCost: CASH_UNIT_PRICE,
    lastPrice: CASH_UNIT_PRICE,
    pendingOptimization: false,
    shortSMA: null,
    dynamicFactor: null,
    stockLimit: null,
    transactionLimit: null,
    targetPrice: null,
    recommendation: null,
    moving_avg: null,
    isShortlisted: false,
    noAutoBuy: null,
    excludeFromShortlist: null,
    isETF: false,
    enableRSIReversalGate: null,
    rsiPeriod: null,
    rsiOversoldThreshold: null,
    rsiOverboughtThreshold: null,
    rsiHysteresisPoints: null,
    rsiMinRisingDays: null,
    lotHistory: {
      symbol: CASH_SYMBOL,
      openLots: open.map((lot) => ({
        lotId: lot.id,
        symbol: CASH_SYMBOL,
        quantity: lot.quantity,
        costBasis: lot.costBasis,
        purchaseDate: lot.purchaseDate,
        status: lot.status,
        account: lot.account ?? null,
        isRetirementAccount: lot.isRetirementAccount ?? null,
      })),
      soldLots: sold.map((lot) => ({
        salePrice: lot.salePrice,
        quantity: lot.quantity,
        originalCostBasis: lot.salePrice - lot.realizedGainLoss / Math.max(lot.quantity, 1e-9),
        saleDateIntervalSince1970: Date.parse(lot.saleDate) / 1000,
      })),
    },
  };
}
