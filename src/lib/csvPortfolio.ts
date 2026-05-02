export type CsvExportStock = { symbol: string; quantity: number; averageCost: number };

/** One logical row after parsing (before merge). */
export type CsvImportRow = {
  symbol: string;
  qty: number;
  price: number;
  purchaseDate?: string;
  account?: string;
  isRetirementAccount?: boolean;
  shortSMA?: number;
  dynamicFactor?: number;
  stockLimit?: number;
  transactionLimit?: number;
  targetPrice?: number;
  name?: string;
};

function parseSymbolOnlyText(text: string): { ok: true; rows: CsvImportRow[]; skipped: string[] } | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const parsedLines = lines.map((line) => line.split(",").map((cell) => cell.replace(/^"+|"+$/g, "").trim()));
  const hasExtraNonEmptyCells = parsedLines.some((cells) => cells.slice(1).some((cell) => cell.length > 0));
  if (hasExtraNonEmptyCells) return null;

  const skipped: string[] = [];
  const rows: CsvImportRow[] = [];
  const firstValue = parsedLines[0]?.[0]?.toLowerCase() ?? "";
  const body = firstValue === "symbol" || firstValue === "ticker" ? parsedLines.slice(1) : parsedLines;

  for (const cells of body) {
    const firstCell = cells[0]?.toUpperCase() ?? "";
    if (!firstCell) continue;
    if (!isValidTicker(firstCell)) {
      skipped.push(firstCell);
      continue;
    }
    rows.push({ symbol: firstCell, qty: 0, price: 0 });
  }

  if (rows.length === 0) return null;
  return { ok: true, rows, skipped };
}

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

function normalizeImportedDate(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseRetirementAccountFlag(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (["yes", "y", "true", "1", "retirement", "ira", "roth", "401k", "tax-exempt", "tax exempt"].includes(value)) {
    return true;
  }
  if (["no", "n", "false", "0", "taxable", "brokerage"].includes(value)) {
    return false;
  }
  return undefined;
}

/**
 * Parse CSV from iOS-compatible formats:
 * - Extended: Symbol, Quantity, AverageCost, ShortSMA, DynamicFactor, …
 * - Lots: purchaseDate, transaction, symbol, qty, price [, account, retirementAccount]
 * - Simple: symbol + quantity/qty + price/average cost (flexible headers)
 */
export async function parsePortfolioCsv(
  text: string
): Promise<{ ok: true; rows: CsvImportRow[]; skipped: string[] } | { ok: false; error: string }> {
  const symbolOnly = parseSymbolOnlyText(text);
  if (symbolOnly) return symbolOnly;

  const { default: Papa } = await import("papaparse");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const fallback = parseSymbolOnlyText(text);
    if (fallback) return fallback;
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
    const kDate = findHeaderKey(headers, ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
    const kAccount = findHeaderKey(headers, ["account", "Account", "profile", "profileName", "accountName"]);
    const kRetirement = findHeaderKey(headers, ["retirementAccount", "retirement account", "accountType", "account type"]);
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
      const purchaseDate = normalizeImportedDate(getCell(row, kDate ?? ""));
      const account = getCell(row, kAccount ?? "") || undefined;
      const isRetirementAccount = parseRetirementAccountFlag(getCell(row, kRetirement ?? ""));
      out.push({
        symbol: sym,
        qty: Math.max(0, qty),
        price: Math.max(0, price),
        purchaseDate,
        account,
        isRetirementAccount,
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
    return { ok: true, rows: out, skipped };
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
    const kDate = findHeaderKey(headers, ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
    const kAccount = findHeaderKey(headers, ["account", "Account", "profile", "profileName", "accountName"]);
    const kRetirement = findHeaderKey(headers, ["retirementAccount", "retirement account", "accountType", "account type"]);

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

      const rawQty = kQty ? getCell(row, kQty) : "";
      const rawPrice = kPrice ? getCell(row, kPrice) : "";
      const hasQty = rawQty.length > 0;
      const hasPrice = rawPrice.length > 0;
      if (hasQty !== hasPrice) {
        return {
          ok: false,
          error: `Row for ${sym} is missing ${hasQty ? "price" : "quantity"}. Leave both blank for watchlist-only, or provide both for holdings.`,
        };
      }

      const qty = hasQty ? parseNumber(rawQty) ?? 0 : 0;
      const price = hasPrice ? parseNumber(rawPrice) ?? 0 : 0;
      out.push({
        symbol: sym,
        qty: Math.max(0, qty),
        price: Math.max(0, price),
        purchaseDate: normalizeImportedDate(getCell(row, kDate ?? "")),
        account: getCell(row, kAccount ?? "") || undefined,
        isRetirementAccount: parseRetirementAccountFlag(getCell(row, kRetirement ?? "")),
      });
    }
    if (out.length === 0) {
      return { ok: false, error: "No importable rows (all SELL, invalid symbols, or empty)." };
    }
    return { ok: true, rows: out, skipped };
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
  const kDate = findHeaderKey(headers, ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
  const kAccount = findHeaderKey(headers, ["account", "Account", "profile", "profileName", "accountName"]);
  const kRetirement = findHeaderKey(headers, ["retirementAccount", "retirement account", "accountType", "account type"]);

  for (const row of data) {
    const sym = getCell(row, kSym).toUpperCase();
    if (!sym) continue;
    if (!isValidTicker(sym)) {
      skipped.push(sym);
      continue;
    }
    const rawQty = kQty ? getCell(row, kQty) : "";
    const rawPrice = kPrice ? getCell(row, kPrice) : "";
    const hasQty = rawQty.length > 0;
    const hasPrice = rawPrice.length > 0;
    if (hasQty !== hasPrice) {
      return {
        ok: false,
        error: `Row for ${sym} is missing ${hasQty ? "price" : "quantity"}. Leave both blank for watchlist-only, or provide both for holdings.`,
      };
    }

    const qty = hasQty ? parseNumber(rawQty) ?? 0 : 0;
    const price = hasPrice ? parseNumber(rawPrice) ?? 0 : 0;
    out.push({
      symbol: sym,
      qty: Math.max(0, qty),
      price: Math.max(0, price),
      purchaseDate: normalizeImportedDate(getCell(row, kDate ?? "")),
      account: getCell(row, kAccount ?? "") || undefined,
      isRetirementAccount: parseRetirementAccountFlag(getCell(row, kRetirement ?? "")),
    });
  }

  if (out.length === 0) {
    return { ok: false, error: "No valid symbol rows found." };
  }
  return { ok: true, rows: out, skipped };
}

/** Matches iOS `PortfolioPageView.generateCSV`, including account metadata. */
export function exportPortfolioCsv(
  stocks: CsvExportStock[],
  lotsBySymbol?: Record<string, { open: Array<{ quantity: number; costBasis: number; purchaseDate: string; account?: string; isRetirementAccount?: boolean | null }>; sold: unknown[] }>
): string {
  const header = "purchaseDate,transaction,symbol,qty,price,account,retirementAccount";
  const esc = (f: string) => {
    if (f.includes(",") || f.includes('"') || f.includes("\n")) return `"${f.replace(/"/g, '""')}"`;
    return f;
  };
  const lines = [header];
  for (const s of stocks) {
    const bundle = lotsBySymbol?.[s.symbol];
    const openLots = bundle?.open ?? [];
    if (openLots.length > 0) {
      for (const lot of openLots) {
        const row = [
          lot.purchaseDate || "",
          "BUY",
          s.symbol,
          String(lot.quantity),
          lot.costBasis.toFixed(2),
          lot.account ?? "",
          lot.isRetirementAccount == null ? "" : lot.isRetirementAccount ? "yes" : "no",
        ].map(esc);
        lines.push(row.join(","));
      }
      continue;
    }

    const row = ["", "BUY", s.symbol, String(s.quantity), s.averageCost.toFixed(2), "", ""].map(esc);
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
