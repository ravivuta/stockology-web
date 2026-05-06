import { computeRiskReturnScore } from "@/lib/ios-recommendation";
import { parseStockPeg } from "@/lib/stock-metric-parse";
import type { LotStatus, SoldLot, StockHolding, TradeLot } from "@/store/portfolioStore";

/** Raw holding JSON from iOS `user_portfolio_snapshots.holdings`. */
type RawHolding = {
  symbol?: string;
  quantity?: number;
  averageCost?: number;
  lastPrice?: number;
  currentPrice?: number;
  shortSMA?: number | null;
  dynamicFactor?: number | null;
  stockLimit?: number | null;
  transactionLimit?: number | null;
  targetPrice?: number | null;
  isShortlisted?: boolean | null;
  moving_avg?: number | null;
  noAutoBuy?: boolean | null;
  excludeFromShortlist?: boolean | null;
  enableRSIReversalGate?: boolean | null;
  rsiPeriod?: number | null;
  rsiOversoldThreshold?: number | null;
  rsiOverboughtThreshold?: number | null;
  rsiHysteresisPoints?: number | null;
  rsiMinRisingDays?: number | null;
  name?: string | null;
  analystTarget?: number | null;
  analyst_target?: number | null;
  analystAvg?: string | null;
  analyst_average?: string | number | null;
  beta?: number | null;
  marketCap?: number | null;
  market_cap?: number | null;
  peg?: number | null;
  peg_ratio?: number | null;
  isETF?: boolean | null;
  is_etf?: boolean | null;
  lotHistory?: {
    symbol?: string;
    openLots?: RawOpenLot[];
    soldLots?: RawSoldLot[];
  } | null;
};

type RawOpenLot = {
  lotId?: string;
  symbol?: string;
  quantity?: number;
  costBasis?: number;
  purchaseDate?: unknown;
  initialQuantity?: number;
  status?: string;
  account?: string | null;
  isRetirementAccount?: boolean | null;
};

type RawSoldLot = {
  salePrice?: number;
  quantity?: number;
  originalCostBasis?: number;
  saleDateIntervalSince1970?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Swift JSONEncoder often encodes `Date` as seconds since 2001-01-01 (reference date). */
function swiftReferenceDateToIso(seconds: number): string {
  const ref = Date.UTC(2001, 0, 1, 0, 0, 0, 0);
  return new Date(ref + seconds * 1000).toISOString();
}

function parsePurchaseDate(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return swiftReferenceDateToIso(v);
  return null;
}

function mapLotStatus(s: string | undefined): LotStatus {
  switch (s) {
    case "partiallySold":
      return "partiallySold";
    case "fullySold":
      return "fullySold";
    case "washSaleRestricted":
      return "washSaleRestricted";
    default:
      return "open";
  }
}

function mapOpenLot(raw: RawOpenLot, symbol: string): TradeLot | null {
  const qty = Number(raw.quantity);
  const cost = Number(raw.costBasis);
  const pd = parsePurchaseDate(raw.purchaseDate);
  if (!Number.isFinite(qty) || !Number.isFinite(cost) || !pd) return null;
  return {
    id: typeof raw.lotId === "string" && raw.lotId.trim() ? raw.lotId : `${symbol}_${pd}_${cost}`,
    quantity: qty,
    costBasis: cost,
    purchaseDate: pd,
    account: typeof raw.account === "string" ? raw.account : "",
    isRetirementAccount: typeof raw.isRetirementAccount === "boolean" ? raw.isRetirementAccount : null,
    status: mapLotStatus(raw.status),
  };
}

function mapSoldLot(raw: RawSoldLot): SoldLot | null {
  const interval = raw.saleDateIntervalSince1970;
  const qty = Number(raw.quantity);
  const price = Number(raw.salePrice);
  const basis = Number(raw.originalCostBasis);
  if (typeof interval !== "number" || !Number.isFinite(qty) || !Number.isFinite(price)) return null;
  const saleDate = new Date(interval * 1000).toISOString();
  const realized =
    Number.isFinite(basis) ? (price - basis) * qty : (price - price) * qty;
  return { saleDate, quantity: qty, salePrice: price, realizedGainLoss: realized };
}

function parseRawHolding(raw: unknown): { stock: StockHolding; lots: { open: TradeLot[]; sold: SoldLot[] } } | null {
  if (!isRecord(raw)) return null;
  const h = raw as RawHolding;
  const symbol = typeof h.symbol === "string" ? h.symbol.trim().toUpperCase() : "";
  if (!symbol) return null;

  const quantity = Number(h.quantity) || 0;
  const averageCost = Number(h.averageCost) || 0;
  const lastPrice = Number(h.lastPrice ?? h.currentPrice) || averageCost || 0;

  const hasStrategy =
    h.shortSMA != null &&
    Number.isFinite(Number(h.shortSMA)) &&
    h.dynamicFactor != null &&
    Number.isFinite(Number(h.dynamicFactor));

  const shortSMA = hasStrategy ? Math.round(Number(h.shortSMA)) : 50;
  const dynamicFactor = hasStrategy ? Number(h.dynamicFactor) : 20;
  const stockLimit = h.stockLimit != null && Number.isFinite(Number(h.stockLimit)) ? Number(h.stockLimit) : 10000;
  const transactionLimit =
    h.transactionLimit != null && Number.isFinite(Number(h.transactionLimit)) ? Number(h.transactionLimit) : 2500;
  const targetPrice = h.targetPrice != null && Number.isFinite(Number(h.targetPrice)) ? Number(h.targetPrice) : undefined;

  const stock: StockHolding = {
    symbol,
    quantity,
    averageCost,
    shortSMA,
    dynamicFactor,
    stockLimit,
    transactionLimit,
    targetPrice,
    pendingOptimization: !hasStrategy,
    lastPrice,
    dailyChangePercent: 0,
    isShortlisted: h.isShortlisted === true,
    isVisibleInRisk: true,
    isInWatchlistSize: true,
    suppressTradeActions: h.noAutoBuy === true,
    excludeFromShortlist: h.excludeFromShortlist === true,
    enableRSIReversalGate: h.enableRSIReversalGate ?? true,
    rsiPeriod: h.rsiPeriod != null && Number.isFinite(Number(h.rsiPeriod)) ? Math.round(Number(h.rsiPeriod)) : 14,
    rsiOversoldThreshold:
      h.rsiOversoldThreshold != null && Number.isFinite(Number(h.rsiOversoldThreshold)) ? Number(h.rsiOversoldThreshold) : 30,
    rsiOverboughtThreshold:
      h.rsiOverboughtThreshold != null && Number.isFinite(Number(h.rsiOverboughtThreshold)) ? Number(h.rsiOverboughtThreshold) : 70,
    rsiHysteresisPoints:
      h.rsiHysteresisPoints != null && Number.isFinite(Number(h.rsiHysteresisPoints)) ? Number(h.rsiHysteresisPoints) : 5,
    rsiMinRisingDays:
      h.rsiMinRisingDays != null && Number.isFinite(Number(h.rsiMinRisingDays)) ? Math.round(Number(h.rsiMinRisingDays)) : 2,
    recommendation: undefined,
  };

  const nm = typeof h.name === "string" ? h.name.trim() : "";
  if (nm) stock.name = nm;

  const at = optFiniteNumber(h.analystTarget ?? h.analyst_target);
  if (at != null && at > 0) stock.analystTarget = at;

  const aa = h.analystAvg ?? h.analyst_average;
  if (typeof aa === "string" && aa.trim()) stock.analystAvg = aa.trim();
  else if (typeof aa === "number" && Number.isFinite(aa)) stock.analystAvg = aa.toFixed(2);

  const b = optFiniteNumber(h.beta);
  if (b != null) stock.beta = b;

  const mc = optFiniteNumber(h.marketCap ?? h.market_cap);
  if (mc != null && mc > 0) stock.marketCap = mc;

  const peg = parseStockPeg(h.peg ?? h.peg_ratio);
  if (peg !== undefined) stock.peg = peg;

  if (h.isETF === true || h.is_etf === true) stock.isETF = true;
  else if (h.isETF === false || h.is_etf === false) stock.isETF = false;

  const ma = optFiniteNumber(h.moving_avg);
  if (ma != null && ma > 0) stock.movingAvg = ma;

  const open: TradeLot[] = [];
  const sold: SoldLot[] = [];
  const lh = h.lotHistory;
  if (lh && typeof lh === "object" && lh.openLots && Array.isArray(lh.openLots)) {
    for (const ol of lh.openLots) {
      if (!isRecord(ol)) continue;
      const lot = mapOpenLot(ol as RawOpenLot, symbol);
      if (lot) open.push(lot);
    }
  }
  if (lh && typeof lh === "object" && lh.soldLots && Array.isArray(lh.soldLots)) {
    for (const sl of lh.soldLots) {
      if (!isRecord(sl)) continue;
      const s = mapSoldLot(sl as RawSoldLot);
      if (s) sold.push(s);
    }
  }

  stock.score = stock.isETF ? undefined : computeRiskReturnScore(stock);

  return { stock, lots: { open, sold } };
}

export type CloudSnapshotHydrationInput = {
  holdings: unknown;
  cash_balance: unknown;
};

export function parseCloudSnapshotForStore(row: CloudSnapshotHydrationInput): {
  cashBalance: number;
  stocks: StockHolding[];
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
} {
  const cashBalance = Number(row.cash_balance) || 0;
  const holdings = row.holdings;
  if (!Array.isArray(holdings)) {
    return { cashBalance, stocks: [], lotsBySymbol: {} };
  }

  const stocks: StockHolding[] = [];
  const lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }> = {};

  for (const item of holdings) {
    const parsed = parseRawHolding(item);
    if (!parsed) continue;
    stocks.push(parsed.stock);
    if (parsed.lots.open.length > 0 || parsed.lots.sold.length > 0) {
      lotsBySymbol[parsed.stock.symbol] = parsed.lots;
    }
  }

  stocks.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { cashBalance, stocks, lotsBySymbol };
}
