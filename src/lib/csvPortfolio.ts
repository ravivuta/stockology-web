export type CsvExportStock = { symbol: string; quantity: number; averageCost: number };
export type CsvColumnStandard =
  | "symbol"
  | "qty"
  | "price"
  | "transaction"
  | "purchaseDate"
  | "account"
  | "retirementAccount"
  | "name";
export type CsvColumnMapping = Partial<Record<CsvColumnStandard, string>>;
export type CsvImportField = {
  key: CsvColumnStandard;
  label: string;
  required?: boolean;
  description: string;
};

export const CSV_IMPORT_FIELDS: CsvImportField[] = [
  { key: "symbol", label: "Symbol", required: true, description: "Required ticker column." },
  { key: "qty", label: "Quantity", description: "Optional. Use with Price for holdings." },
  { key: "price", label: "Price", description: "Optional. Use with Quantity for holdings." },
  { key: "transaction", label: "Transaction", description: "Optional BUY/SELL/ADD style action column." },
  { key: "purchaseDate", label: "Purchase Date", description: "Optional lot purchase date." },
  { key: "account", label: "Account", description: "Optional account/profile name." },
  { key: "retirementAccount", label: "Retirement", description: "Optional tax-exempt yes/no column." },
  { key: "name", label: "Name", description: "Optional company name." },
];

const CSV_AUTO_DETECT_FIELDS = new Set<CsvColumnStandard>(["symbol", "qty", "price"]);

const CSV_IMPORT_CANDIDATES: Record<CsvColumnStandard, string[]> = {
  symbol: ["symbol", "ticker", "code"],
  qty: ["qty", "quantity", "shares", "share quantity"],
  price: ["price", "average cost", "averagecost", "average cost basis", "avg cost", "cost basis", "average price", "last price", "cost/share"],
  transaction: ["transaction", "type", "side", "action"],
  purchaseDate: ["purchaseDate", "purchase date", "tradeDate", "trade date", "date", "buy date"],
  account: ["account", "acct", "profile", "profileName", "accountName", "portfolio"],
  retirementAccount: ["retirementAccount", "retirement account", "accountType", "account type", "tax exempt", "tax-exempt"],
  name: ["name", "company", "company name", "security", "description"],
};

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

export type CsvImportTrade = {
  symbol: string;
  qty: number;
  price: number;
  tradeDate: string;
  account?: string;
  isRetirementAccount?: boolean;
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

export function normalizeCsvHeader(s: string) {
  return normKey(s);
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

function validateImportedAccountName(symbol: string, account: string): string | null {
  const trimmed = account.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9 _-]+$/.test(trimmed)) {
    return `Invalid account name '${account}' for ${symbol} (letters, numbers, spaces, hyphens, underscores only).`;
  }
  if (trimmed.length > 50) {
    return `Account name too long '${account}' for ${symbol} (max 50 characters).`;
  }
  return null;
}

function normalizeImportedAccountName(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/[^A-Za-z0-9 _-]/g, "").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 50);
}

function validateImportedDate(symbol: string, raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return `Invalid date format '${value}' for ${symbol}.`;
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const oneYearAhead = new Date();
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  if (ms > oneYearAhead.getTime()) return `Future purchase date '${value}' for ${symbol}.`;
  if (ms < tenYearsAgo.getTime()) return `Purchase date '${value}' too far in past for ${symbol} (over 10 years ago).`;
  return null;
}

function normalizeTradeDate(raw: string | undefined): string {
  const normalized = normalizeImportedDate(raw ?? "");
  if (normalized) return normalized;
  return new Date().toISOString().slice(0, 10);
}

function getCell(row: Record<string, unknown>, headerKey: string | null): string {
  if (!headerKey) return "";
  const v = row[headerKey];
  if (v == null) return "";
  return String(v).trim();
}

/** All recognised import column name candidates (lowercased, no spaces). */
const HEADER_CANDIDATES = new Set<string>([
  "symbol", "ticker", "code",
  "qty", "quantity", "shares",
  "price", "averagecost", "avgcost", "costbasis",
  "transaction", "type", "side", "action",
  "purchasedate", "tradedate", "date",
  "account", "portfolio",
  "name", "company",
]);

/**
 * Returns the index in `lines` of the first line that looks like a CSV header
 * (contains at least one recognised import column name).
 * Falls back to 0 if nothing matches, so existing behaviour is preserved.
 */
function findHeaderLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const delim = detectDelimiter(line);
    const cols = splitCsvLine(line, delim).map((c) => normKey(c.replace(/^"+|"+$/g, "")));
    if (cols.some((c) => HEADER_CANDIDATES.has(c))) return i;
  }
  return 0;
}

function detectDelimiter(line: string): string {
  const comma = (line.match(/,/g) ?? []).length;
  const tab = (line.match(/\t/g) ?? []).length;
  const semi = (line.match(/;/g) ?? []).length;
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma && semi > tab) return ";";
  return ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  out.push(current.trim());
  return out;
}

function stripCsvCell(cell: string): string {
  return cell.replace(/^"+|"+$/g, "").trim();
}

function parseCsvRecordsFallback(text: string): Record<string, unknown>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headerIdx = findHeaderLineIndex(lines);
  const headerLine = lines[headerIdx] ?? "";
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map(stripCsvCell);
  if (headers.length === 0) return [];

  return lines.slice(headerIdx + 1).map((line) => {
    const cells = splitCsvLine(line, delimiter).map(stripCsvCell);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

async function parseCsvRecords(text: string): Promise<{ data: Record<string, unknown>[]; error?: string }> {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const allLines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIdx = findHeaderLineIndex(allLines);
  // Rebuild text from the header row onwards so PapaParse sees a clean CSV
  const trimmedText = allLines.slice(headerIdx).join("\n");

  const firstLine = allLines[headerIdx] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const { default: Papa } = await import("papaparse");
  const parsed = Papa.parse<Record<string, unknown>>(trimmedText, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length === 0) {
    return { data: parsed.data };
  }

  const fieldMismatchOnly = parsed.errors.every((error) => error.code === "TooFewFields" || error.code === "TooManyFields");
  if (fieldMismatchOnly) {
    const fallbackData = parseCsvRecordsFallback(text);
    if (fallbackData.length > 0) {
      return { data: fallbackData };
    }
  }

  return { data: [], error: parsed.errors[0]?.message ?? "CSV parse error" };
}

function matchHeader(headers: string[], target: string): string | null {
  const normalizedTarget = normKey(target);
  for (const header of headers) {
    const normalizedHeader = normKey(header);
    if (normalizedHeader === normalizedTarget) return header;
  }
  for (const header of headers) {
    const normalizedHeader = normKey(header);
    if (normalizedHeader.includes(normalizedTarget) || normalizedTarget.includes(normalizedHeader)) return header;
  }
  return null;
}

function resolveMappedHeaderKey(
  headers: string[],
  mapping: CsvColumnMapping | undefined,
  standard: CsvColumnStandard,
  fallback: string[]
): string | null {
  const mapped = mapping?.[standard];
  if (typeof mapped === "string") {
    if (mapped.trim().toLowerCase() === "none" || mapped.trim() === "") return null;
    return matchHeader(headers, mapped);
  }
  return findHeaderKey(headers, fallback);
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

export function extractCsvHeaders(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIdx = findHeaderLineIndex(lines);
  const headerLine = lines[headerIdx];
  if (!headerLine) return [];
  const delimiter = detectDelimiter(headerLine);
  return splitCsvLine(headerLine, delimiter).map((header) => header.replace(/^"+|"+$/g, "").trim()).filter(Boolean);
}

export function parseWatchlistCsv(
  text: string
): { ok: true; rows: CsvImportRow[]; skipped: string[] } | { ok: false; error: string } {
  const symbolOnly = parseSymbolOnlyText(text);
  if (symbolOnly) return symbolOnly;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: "No data rows in CSV." };

  const headerIdx = findHeaderLineIndex(lines);
  const headerLine = lines[headerIdx] ?? "";
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map((header) => header.replace(/^"+|"+$/g, "").trim());
  const symbolIndex = headers.findIndex((header) => CSV_IMPORT_CANDIDATES.symbol.some((candidate) => normKey(header) === normKey(candidate)));
  const nameIndex = headers.findIndex((header) => CSV_IMPORT_CANDIDATES.name.some((candidate) => normKey(header) === normKey(candidate)));

  if (symbolIndex < 0) {
    return { ok: false, error: "Could not find a symbol column for watchlist import." };
  }

  const skipped: string[] = [];
  const rows: CsvImportRow[] = [];

  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, delimiter).map((cell) => cell.replace(/^"+|"+$/g, "").trim());
    const symbol = (cells[symbolIndex] ?? "").toUpperCase();
    if (!symbol) continue;
    if (!isValidTicker(symbol)) {
      skipped.push(symbol);
      continue;
    }
    const name = nameIndex >= 0 ? cells[nameIndex] ?? "" : "";
    rows.push({
      symbol,
      qty: 0,
      price: 0,
      name: name || undefined,
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: skipped.length > 0 ? "No valid symbol rows found." : "No data rows in CSV." };
  }

  return { ok: true, rows, skipped };
}

export function shouldShowCsvMapping(text: string): boolean {
  const headers = extractCsvHeaders(text);
  if (headers.length === 0) return false;
  if (headers.length > 1) return true;
  const only = normKey(headers[0] ?? "");
  return CSV_IMPORT_FIELDS.some((field) => field.key.toLowerCase() === only);
}

export function suggestCsvColumnMapping(
  headers: string[],
  saved?: Partial<Record<string, CsvColumnStandard>>
): CsvColumnMapping {
  const suggestions: CsvColumnMapping = {};
  for (const field of CSV_IMPORT_FIELDS) {
    if (!CSV_AUTO_DETECT_FIELDS.has(field.key)) continue;
    const remembered = headers.find((header) => saved?.[normKey(header)] === field.key);
    if (remembered) {
      suggestions[field.key] = remembered;
      continue;
    }
    const fallback = resolveMappedHeaderKey(headers, undefined, field.key, CSV_IMPORT_CANDIDATES[field.key]);
    if (fallback) suggestions[field.key] = fallback;
  }
  return suggestions;
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

function hasRecognizableTransactionValues(data: Record<string, unknown>[], headerKey: string | null): boolean {
  if (!headerKey) return false;
  return data.some((row) => {
    const value = getCell(row, headerKey);
    if (!value) return false;
    return isSellTransaction(value) || isBuyTransaction(value);
  });
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
  if (
    ["yes", "y", "true", "1", "retirement", "ira", "roth", "401k", "tax-exempt", "tax exempt"].includes(value) ||
    value.includes("ira") ||
    value.includes("roth") ||
    value.includes("401k") ||
    value.includes("retirement") ||
    value.includes("tax-exempt")
  ) {
    return true;
  }
  if (
    ["no", "n", "false", "0", "taxable", "brokerage"].includes(value) ||
    value.includes("taxable") ||
    value.includes("brokerage")
  ) {
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
  text: string,
  options?: { columnMapping?: CsvColumnMapping }
): Promise<{ ok: true; rows: CsvImportRow[]; trades: CsvImportTrade[]; skipped: string[] } | { ok: false; error: string }> {
  const symbolOnly = parseSymbolOnlyText(text);
  if (symbolOnly) return { ...symbolOnly, trades: [] };
  const mapping = options?.columnMapping;

  const parsed = await parseCsvRecords(text);
  if (parsed.error) {
    const fallback = parseSymbolOnlyText(text);
    if (fallback) return { ...fallback, trades: [] };
    return { ok: false, error: parsed.error };
  }

  const data = parsed.data.filter((row) => Object.values(row).some((v) => v != null && String(v).trim() !== ""));
  if (data.length === 0) {
    return { ok: false, error: "No data rows in CSV." };
  }

  const headers = Object.keys(data[0] ?? {});
  const keySet = new Set(headers.map(normKey));

  const resolveExplicitOptionalHeader = (
    standard: CsvColumnStandard,
    fallback: string[]
  ): string | null => {
    const configured = mapping?.[standard];
    if (!configured || configured.toLowerCase() === "none") return null;
    return resolveMappedHeaderKey(headers, mapping, standard, fallback);
  };

  const skipped: string[] = [];
  const out: CsvImportRow[] = [];
  const trades: CsvImportTrade[] = [];
  const validationErrors: string[] = [];

  const isExtended =
    keySet.has("symbol") &&
    keySet.has("quantity") &&
    keySet.has("averagecost") &&
    keySet.has("shortsma") &&
    keySet.has("dynamicfactor");

  if (isExtended) {
    const kSymbol = resolveMappedHeaderKey(headers, mapping, "symbol", ["Symbol", "symbol"]);
    const kQty = resolveMappedHeaderKey(headers, mapping, "qty", ["Quantity", "quantity"]);
    const kAvg = resolveMappedHeaderKey(headers, mapping, "price", ["AverageCost", "average cost"]);
    const kSma = findHeaderKey(headers, ["ShortSMA", "shortSMA"]);
    const kDyn = findHeaderKey(headers, ["DynamicFactor", "dynamic factor"]);
    const kSL = findHeaderKey(headers, ["StockLimit", "stock limit"]);
    const kTL = findHeaderKey(headers, ["TransactionLimit", "transaction limit"]);
    const kTp = findHeaderKey(headers, ["TargetPrice", "target price"]);
    const kName = resolveMappedHeaderKey(headers, mapping, "name", ["Name", "name"]);
    const kDate = resolveMappedHeaderKey(headers, mapping, "purchaseDate", ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
    const kAccount = resolveExplicitOptionalHeader("account", ["account", "Account", "profile", "profileName", "accountName"]);
    const kRetirement = resolveExplicitOptionalHeader("retirementAccount", ["retirementAccount", "retirement account", "accountType", "account type"]);
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
      const account = normalizeImportedAccountName(getCell(row, kAccount ?? ""));
      const isRetirementAccount = parseRetirementAccountFlag(getCell(row, kRetirement ?? ""));
      const accountError = account ? validateImportedAccountName(sym, account) : null;
      if (accountError) {
        validationErrors.push(accountError);
        continue;
      }
      const dateError = validateImportedDate(sym, purchaseDate);
      if (dateError) {
        validationErrors.push(dateError);
        continue;
      }
      if (Math.abs(qty) > 1_000_000) {
        validationErrors.push(`Unreasonably large quantity ${Math.abs(qty)} for ${sym}.`);
        continue;
      }
      if (price < 0 || price > 10_000) {
        validationErrors.push(`Invalid price ${price} for ${sym}.`);
        continue;
      }
      if (qty < 0) {
        trades.push({
          symbol: sym,
          qty: Math.abs(qty),
          price: Math.max(0, price),
          tradeDate: normalizeTradeDate(purchaseDate),
          account,
          isRetirementAccount,
        });
        continue;
      }
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
      if (trades.length > 0) return { ok: true, rows: [], trades, skipped };
      if (validationErrors.length > 0) return { ok: false, error: validationErrors.join(" ") };
      return { ok: false, error: "No valid symbol rows in extended CSV." };
    }
    return { ok: true, rows: out, trades, skipped };
  }

  const kSymLot = resolveMappedHeaderKey(headers, mapping, "symbol", ["symbol", "Symbol", "ticker"]);
  const kQtyLot = resolveMappedHeaderKey(headers, mapping, "qty", ["qty", "Qty", "quantity", "Quantity", "shares"]);
  const kTxnLot = resolveMappedHeaderKey(headers, mapping, "transaction", ["transaction", "Transaction", "side", "action"]);
  /* Lot-style rows (iOS export): symbol + qty + transaction/side so we can skip SELL lines. */
  const isLot = kSymLot != null && kQtyLot != null && hasRecognizableTransactionValues(data, kTxnLot);

  if (isLot) {
    const kSym = kSymLot;
    const kQty = kQtyLot;
    const kPrice = resolveMappedHeaderKey(headers, mapping, "price", ["price", "Price", "average cost", "AverageCost", "cost"]);
    const kTxn = kTxnLot;
    const kDate = resolveMappedHeaderKey(headers, mapping, "purchaseDate", ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
    const kAccount = resolveExplicitOptionalHeader("account", ["account", "Account", "profile", "profileName", "accountName"]);
    const kRetirement = resolveExplicitOptionalHeader("retirementAccount", ["retirementAccount", "retirement account", "accountType", "account type"]);

    for (const row of data) {
      const sym = getCell(row, kSym).toUpperCase();
      if (!sym) continue;
      if (!isValidTicker(sym)) {
        skipped.push(sym);
        continue;
      }
      const txn = kTxn ? getCell(row, kTxn) : "";
      const isSell = txn ? isSellTransaction(txn) : false;
      if (txn && !isSell && !isBuyTransaction(txn)) continue;

      const rawQty = kQty ? getCell(row, kQty) : "";
      const rawPrice = kPrice ? getCell(row, kPrice) : "";
      const hasQty = rawQty.length > 0;
      const hasPrice = rawPrice.length > 0;
      if (hasQty !== hasPrice) {
        validationErrors.push(
          `Row for ${sym} is missing ${hasQty ? "price" : "quantity"}. Leave both blank for watchlist-only, or provide both for holdings.`
        );
        continue;
      }

      const qty = hasQty ? parseNumber(rawQty) ?? 0 : 0;
      const price = hasPrice ? parseNumber(rawPrice) ?? 0 : 0;
      const purchaseDate = normalizeImportedDate(getCell(row, kDate ?? ""));
      const account = normalizeImportedAccountName(getCell(row, kAccount ?? ""));
      const isRetirementAccount = parseRetirementAccountFlag(getCell(row, kRetirement ?? ""));
      const accountError = account ? validateImportedAccountName(sym, account) : null;
      if (accountError) {
        validationErrors.push(accountError);
        continue;
      }
      const dateError = validateImportedDate(sym, purchaseDate);
      if (dateError) {
        validationErrors.push(dateError);
        continue;
      }
      if (Math.abs(qty) > 1_000_000) {
        validationErrors.push(`Unreasonably large quantity ${Math.abs(qty)} for ${sym}.`);
        continue;
      }
      if (price < 0 || price > 10_000) {
        validationErrors.push(`Invalid price ${price} for ${sym}.`);
        continue;
      }
      if (isSell || qty < 0) {
        trades.push({
          symbol: sym,
          qty: Math.abs(qty),
          price: Math.max(0, price),
          tradeDate: normalizeTradeDate(purchaseDate),
          account,
          isRetirementAccount,
        });
        continue;
      }
      out.push({
        symbol: sym,
        qty: Math.max(0, qty),
        price: Math.max(0, price),
        purchaseDate,
        account,
        isRetirementAccount,
      });
    }
    if (out.length === 0) {
      if (trades.length > 0) return { ok: true, rows: [], trades, skipped };
      if (validationErrors.length > 0) return { ok: false, error: validationErrors.join(" ") };
      return { ok: false, error: "No importable rows (all SELL, invalid symbols, or empty)." };
    }
    return { ok: true, rows: out, trades, skipped };
  }

  /* Simple / broker-style */
  const kSym = resolveMappedHeaderKey(headers, mapping, "symbol", ["symbol", "Symbol", "ticker", "Ticker", "code"]);
  if (!kSym) {
    return { ok: false, error: "Could not find a symbol column (expected Symbol, ticker, etc.)." };
  }
  const kQty = resolveMappedHeaderKey(headers, mapping, "qty", ["qty", "quantity", "Quantity", "shares", "Shares", "quantity."]);
  const kPrice = resolveMappedHeaderKey(headers, mapping, "price", [
    "price",
    "average cost",
    "AverageCost",
    "cost basis",
    "cost/share",
    "avg cost",
    "average price",
    "last price",
  ]);
  const kDate = resolveMappedHeaderKey(headers, mapping, "purchaseDate", ["purchaseDate", "purchase date", "tradeDate", "trade date"]);
  const kAccount = resolveExplicitOptionalHeader("account", ["account", "Account", "profile", "profileName", "accountName"]);
  const kRetirement = resolveExplicitOptionalHeader("retirementAccount", ["retirementAccount", "retirement account", "accountType", "account type"]);

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
      validationErrors.push(
        `Row for ${sym} is missing ${hasQty ? "price" : "quantity"}. Leave both blank for watchlist-only, or provide both for holdings.`
      );
      continue;
    }

    const qty = hasQty ? parseNumber(rawQty) ?? 0 : 0;
    const price = hasPrice ? parseNumber(rawPrice) ?? 0 : 0;
    const purchaseDate = normalizeImportedDate(getCell(row, kDate ?? ""));
    const account = normalizeImportedAccountName(getCell(row, kAccount ?? ""));
    const isRetirementAccount = parseRetirementAccountFlag(getCell(row, kRetirement ?? ""));
    const accountError = account ? validateImportedAccountName(sym, account) : null;
    if (accountError) {
      validationErrors.push(accountError);
      continue;
    }
    const dateError = validateImportedDate(sym, purchaseDate);
    if (dateError) {
      validationErrors.push(dateError);
      continue;
    }
    if (Math.abs(qty) > 1_000_000) {
      validationErrors.push(`Unreasonably large quantity ${Math.abs(qty)} for ${sym}.`);
      continue;
    }
    if (price < 0 || price > 10_000) {
      validationErrors.push(`Invalid price ${price} for ${sym}.`);
      continue;
    }
    if (qty < 0) {
      trades.push({
        symbol: sym,
        qty: Math.abs(qty),
        price: Math.max(0, price),
        tradeDate: normalizeTradeDate(purchaseDate),
        account,
        isRetirementAccount,
      });
      continue;
    }
    out.push({
      symbol: sym,
      qty: Math.max(0, qty),
      price: Math.max(0, price),
      purchaseDate,
      account,
      isRetirementAccount,
    });
  }

  if (out.length === 0) {
    if (trades.length > 0) return { ok: true, rows: [], trades, skipped };
    if (validationErrors.length > 0) return { ok: false, error: validationErrors.join(" ") };
    return { ok: false, error: "No valid symbol rows found." };
  }
  return { ok: true, rows: out, trades, skipped };
}

/** Matches iOS `PortfolioPageView.generateCSV`, including account metadata. */
export function exportWatchlistCsv(stocks: CsvExportStock[]): string {
  const header = "symbol";
  const esc = (f: string) => {
    if (f.includes(",") || f.includes('"') || f.includes("\n")) return `"${f.replace(/"/g, '""')}"`;
    return f;
  };
  // Only export watchlist-only symbols (no holdings); or export all if caller passes filtered list
  const lines = [header];
  for (const s of stocks) {
    if (s.symbol.trim()) lines.push(esc(s.symbol.trim()));
  }
  return lines.join("\n");
}

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
