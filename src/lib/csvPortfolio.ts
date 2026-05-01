export type CsvExportStock = { symbol: string; quantity: number; averageCost: number };

/** One logical row after parsing (before merge). */
export type CsvImportRow = {
  symbol: string;
  qty: number;
  price: number;
  shortSMA?: number;
  dynamicFactor?: number;
  stockLimit?: number;
  transactionLimit?: number;
  targetPrice?: number;
  name?: string;
};

function normKey(s: string) {
  return s.trim().toLowerCase().replace(/[\s_]/g, "");
}

export function isValidTicker(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  if (!s || s.length < 1 || s.length > 10) return false;
  if (s.includes(" ") || s.startsWith("^")) return false;
  if (!/^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/.test(s)) return false;
  if (s.includes("..") || s.includes("--")) return false;
  return true;
}

export function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[$,]/g, "").replace(/USD/gi, "").trim();
  if (s.startsWith("(") && s.endsWith(")")) s = `-${s.slice(1, -1)}`;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function getCell(row: Record<string, unknown>, headerKey: string | null): string {
  if (!headerKey) return "";
  const v = row[headerKey];
  if (v == null) return "";
  return String(v).trim();
}

function findHeaderKey(headers: string[], candidates: string[]): string | null {
  const map = new Map(headers.map((h) => [normKey(h), h] as const));
  for (const c of candidates) {
    const k = normKey(c);
    const hit = map.get(k);
    if (hit) return hit;
  }
  return null;
}

function isSellTransaction(text: string): boolean {
  const u = text.toUpperCase();
  return u.includes("SELL") || u.includes("SOLD") || u.includes("REDUCE");
}

function isBuyTransaction(text: string): boolean {
  const u = text.toUpperCase();
  if (!u || u === "NONE" || u === "NULL" || u === "N/A" || u === "-") return true;
  if (u.includes("CASH")) return false;
  return u.includes("BUY") || u.includes("BOUGHT") || u.includes("ADD");
}

/**
 * Parse CSV from iOS-compatible formats:
 * - Extended: Symbol, Quantity, AverageCost, ShortSMA, DynamicFactor, …
 * - Lots: purchaseDate, transaction, symbol, qty, price [, account]
 * - Simple: symbol + quantity/qty + price/average cost (flexible headers)
 */
export async function parsePortfolioCsv(
  text: string
): Promise<{ ok: true; rows: CsvImportRow[]; skipped: string[] } | { ok: false; error: string }> {
  const { default: Papa } = await import("papaparse");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const msg = parsed.errors[0]?.message ?? "CSV parse error";
    return { ok: false, error: msg };
  }

  const data = parsed.data.filter((row) => Object.values(row).some((v) => v != null && String(v).trim() !== ""));
  if (data.length === 0) {
    return { ok: false, error: "No data rows in CSV." };
  }

  const headers = Object.keys(data[0] ?? {});
  const keySet = new Set(headers.map(normKey));

  const skipped: string[] = [];
  const out: CsvImportRow[] = [];

  const isExtended =
    keySet.has("symbol") &&
    keySet.has("quantity") &&
    keySet.has("averagecost") &&
    keySet.has("shortsma") &&
    keySet.has("dynamicfactor");

  if (isExtended) {
    const kSymbol = findHeaderKey(headers, ["Symbol", "symbol"]);
    const kQty = findHeaderKey(headers, ["Quantity", "quantity"]);
    const kAvg = findHeaderKey(headers, ["AverageCost", "average cost"]);
    const kSma = findHeaderKey(headers, ["ShortSMA", "shortSMA"]);
    const kDyn = findHeaderKey(headers, ["DynamicFactor", "dynamic factor"]);
    const kSL = findHeaderKey(headers, ["StockLimit", "stock limit"]);
    const kTL = findHeaderKey(headers, ["TransactionLimit", "transaction limit"]);
    const kTp = findHeaderKey(headers, ["TargetPrice", "target price"]);
    const kName = findHeaderKey(headers, ["Name", "name"]);
    if (!kSymbol || !kQty || !kAvg) {
      return { ok: false, error: "Extended CSV is missing Symbol, Quantity, or AverageCost." };
    }

    for (const row of data) {
      const sym = getCell(row, kSymbol).toUpperCase();
      if (!sym) continue;
      if (!isValidTicker(sym)) {
        skipped.push(sym);
        continue;
      }
      const qty = parseNumber(getCell(row, kQty)) ?? 0;
      const price = parseNumber(getCell(row, kAvg)) ?? 0;
      const shortSMA = parseNumber(getCell(row, kSma ?? "")) ?? undefined;
      const dynamicFactor = parseNumber(getCell(row, kDyn ?? "")) ?? undefined;
      const stockLimit = parseNumber(getCell(row, kSL ?? "")) ?? undefined;
      const transactionLimit = parseNumber(getCell(row, kTL ?? "")) ?? undefined;
      const targetPrice = parseNumber(getCell(row, kTp ?? "")) ?? undefined;
      const nameRaw = getCell(row, kName ?? "");
      out.push({
        symbol: sym,
        qty: Math.max(0, qty),
        price: Math.max(0, price),
        shortSMA: shortSMA != null ? Math.round(shortSMA) : undefined,
        dynamicFactor: dynamicFactor ?? undefined,
        stockLimit: stockLimit ?? undefined,
        transactionLimit: transactionLimit ?? undefined,
        targetPrice: targetPrice ?? undefined,
        name: nameRaw || undefined,
      });
    }
    if (out.length === 0) {
      return { ok: false, error: "No valid symbol rows in extended CSV." };
    }
    return { ok: true, rows: mergeCsvLotRows(out), skipped };
  }

  const kSymLot = findHeaderKey(headers, ["symbol", "Symbol", "ticker"]);
  const kQtyLot = findHeaderKey(headers, ["qty", "Qty", "quantity", "Quantity", "shares"]);
  const kTxnLot = findHeaderKey(headers, ["transaction", "Transaction", "side", "action"]);
  /* Lot-style rows (iOS export): symbol + qty + transaction/side so we can skip SELL lines. */
  const isLot = kSymLot != null && kQtyLot != null && kTxnLot != null;

  if (isLot) {
    const kSym = kSymLot;
    const kQty = kQtyLot;
    const kPrice = findHeaderKey(headers, ["price", "Price", "average cost", "AverageCost", "cost"]);
    const kTxn = kTxnLot;

    for (const row of data) {
      const sym = getCell(row, kSym).toUpperCase();
      if (!sym) continue;
      if (!isValidTicker(sym)) {
        skipped.push(sym);
        continue;
      }
      const txn = kTxn ? getCell(row, kTxn) : "";
      if (txn && isSellTransaction(txn)) continue;
      if (txn && !isBuyTransaction(txn)) continue;

      const qty = kQty ? parseNumber(getCell(row, kQty)) ?? 0 : 0;
      const price = kPrice ? parseNumber(getCell(row, kPrice)) ?? 0 : 0;
      out.push({ symbol: sym, qty: Math.max(0, qty), price: Math.max(0, price) });
    }
    if (out.length === 0) {
      return { ok: false, error: "No importable rows (all SELL, invalid symbols, or empty)." };
    }
    return { ok: true, rows: mergeCsvLotRows(out), skipped };
  }

  /* Simple / broker-style */
  const kSym = findHeaderKey(headers, ["symbol", "Symbol", "ticker", "Ticker", "code"]);
  if (!kSym) {
    return { ok: false, error: "Could not find a symbol column (expected Symbol, ticker, etc.)." };
  }
  const kQty = findHeaderKey(headers, ["qty", "quantity", "Quantity", "shares", "Shares", "quantity."]);
  const kPrice = findHeaderKey(headers, [
    "price",
    "average cost",
    "AverageCost",
    "cost basis",
    "cost/share",
    "avg cost",
    "average price",
    "last price",
  ]);

  for (const row of data) {
    const sym = getCell(row, kSym).toUpperCase();
    if (!sym) continue;
    if (!isValidTicker(sym)) {
      skipped.push(sym);
      continue;
    }
    const qty = kQty ? parseNumber(getCell(row, kQty)) ?? 0 : 0;
    const price = kPrice ? parseNumber(getCell(row, kPrice)) ?? 0 : 0;
    out.push({ symbol: sym, qty: Math.max(0, qty), price: Math.max(0, price) });
  }

  if (out.length === 0) {
    return { ok: false, error: "No valid symbol rows found." };
  }
  return { ok: true, rows: mergeCsvLotRows(out), skipped };
}

/** Merge multiple lot lines per symbol (weighted average cost). */
export function mergeCsvLotRows(rows: CsvImportRow[]): CsvImportRow[] {
  const m = new Map<string, { basis: number; qty: number; template: CsvImportRow }>();

  for (const r of rows) {
    const sym = r.symbol.toUpperCase();
    const q = Math.max(0, r.qty);
    const p = Math.max(0, r.price);
    const cur = m.get(sym);
    if (!cur) {
      m.set(sym, { basis: q * p, qty: q, template: { ...r, symbol: sym, qty: q, price: p } });
    } else {
      cur.basis += q * p;
      cur.qty += q;
      cur.template = {
        ...cur.template,
        qty: cur.qty,
        price: cur.qty > 0 ? cur.basis / cur.qty : cur.template.price,
      };
    }
  }

  return Array.from(m.values()).map((v) => ({
    ...v.template,
    symbol: v.template.symbol.toUpperCase(),
    qty: v.qty,
    price: v.qty > 0 ? v.basis / v.qty : v.template.price,
  }));
}

/** Matches iOS `PortfolioPageView.generateCSV` (+ empty account column). */
export function exportPortfolioCsv(stocks: CsvExportStock[]): string {
  const header = "purchaseDate,transaction,symbol,qty,price,account";
  const esc = (f: string) => {
    if (f.includes(",") || f.includes('"') || f.includes("\n")) return `"${f.replace(/"/g, '""')}"`;
    return f;
  };
  const lines = [header];
  for (const s of stocks) {
    const row = ["", "BUY", s.symbol, String(s.quantity), s.averageCost.toFixed(2), ""].map(esc);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
