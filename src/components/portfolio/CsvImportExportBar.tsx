"use client";

import { useRef, useState } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { pushPortfolioSnapshotSlice } from "@/lib/portfolio-snapshot-client";
import { fetchTickerHydrationFromTables, type TickerHydrationPriceRow } from "@/lib/ticker-direct-hydration";
import { usePortfolioStore, type StockHolding } from "@/store/portfolioStore";
import {
  CSV_IMPORT_FIELDS,
  parsePortfolioCsv,
  parseWatchlistCsv,
  shouldShowCsvMapping,
  suggestCsvColumnMapping,
  normalizeCsvHeader,
  extractCsvHeaders,
  exportPortfolioCsv,
  exportWatchlistCsv,
  downloadCsv,
  type CsvColumnMapping,
  type CsvColumnStandard,
  type CsvExportStock,
  type CsvImportField,
  type CsvImportTrade,
  type CsvImportRow,
} from "@/lib/csvPortfolio";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { parseStockPeg } from "@/lib/stock-metric-parse";
import { formatCurrency, formatNumberMax2 } from "@/lib/numberFormat";

const MAX_TRACKED_STOCKS = 200;
const HIDDEN_MAPPING_FIELDS = new Set<CsvColumnStandard>(["name", "account", "retirementAccount"]);
const FIELD_LABELS: Partial<Record<CsvColumnStandard, string>> = {
  qty: "Qty",
  price: "Avg cost",
};

function getMappingFieldsForMode(importMode: "portfolio" | "watchlist"): CsvImportField[] {
  const byKey = new Map(CSV_IMPORT_FIELDS.map((field) => [field.key, field]));
  const symbol = byKey.get("symbol");
  const qty = byKey.get("qty");
  const price = byKey.get("price");

  if (importMode === "portfolio") {
    const rest = CSV_IMPORT_FIELDS.filter((field) => !["symbol", "qty", "price"].includes(field.key));
    return [
      symbol ? { ...symbol, label: "Symbol", required: true } : { key: "symbol", label: "Symbol", required: true, description: "Required ticker column." },
      qty ? { ...qty, label: "Qty", required: true } : { key: "qty", label: "Qty", required: true, description: "Required. Use with Avg cost for holdings." },
      price ? { ...price, label: "Avg cost", required: true } : { key: "price", label: "Avg cost", required: true, description: "Required. Use with Qty for holdings." },
      ...rest.map((field) => ({ ...field, label: FIELD_LABELS[field.key] ?? field.label, required: false })),
    ];
  }

  return [
    symbol ? { ...symbol, label: "Symbol", required: true } : { key: "symbol", label: "Symbol", required: true, description: "Required ticker column." },
  ];
}

const CSV_MAPPING_MEMORY_KEY = "stocks-pm-csv-mapping-memory:v1";
const CSV_MAPPING_PRESETS_KEY = "stocks-pm-csv-mapping-presets:v1";

type Props = {
  exportFilename: string;
  /** Defaults to all symbols in the store (same as iOS: full tracked list). */
  exportStocks?: CsvExportStock[];
  compact?: boolean;
  importMode?: "portfolio" | "watchlist";
};

type PendingMappingImport = {
  text: string;
  headers: string[];
  mapping: CsvColumnMapping;
  defaultAccountName: string;
  defaultRetirementAccount: "no" | "yes" | "";
  activePresetId: string | null;
};

type ImportProgress = {
  active: boolean;
  label: string;
  value: number;
};

type SavedCsvMappingPreset = {
  id: string;
  name: string;
  mapping: CsvColumnMapping;
  defaultAccountName: string;
  defaultRetirementAccount: "no" | "yes";
  updatedAt: string;
};

function describeAccountType(value: "no" | "yes"): string {
  return value === "yes" ? "Retirement" : "Taxable";
}

function canSubmitMappingImport(pending: PendingMappingImport | null): boolean {
  if (!pending) return false;
  const symbol = pending.mapping.symbol;
  if (!symbol || symbol.toLowerCase() === "none") return false;
  if (!pending.defaultAccountName.trim()) return false;
  if (!(pending.defaultRetirementAccount === "no" || pending.defaultRetirementAccount === "yes")) return false;
  return true;
}

function describePreset(preset: SavedCsvMappingPreset): string {
  const accountName = preset.defaultAccountName.trim() || "No default account name";
  return `${accountName} • ${describeAccountType(preset.defaultRetirementAccount)}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapHydrationRowToPatch(row: TickerHydrationPriceRow): Partial<StockHolding> {
  const patch: Partial<StockHolding> = {};
  if (row.last_price != null && Number.isFinite(Number(row.last_price))) patch.lastPrice = Number(row.last_price);
  if (row.daily_pct_change != null && Number.isFinite(Number(row.daily_pct_change))) patch.dailyChangePercent = Number(row.daily_pct_change);
  if (typeof row.company_name === "string" && row.company_name.trim()) patch.name = row.company_name.trim();
  if (row.analyst_target != null) {
    const target = Number(row.analyst_target);
    if (Number.isFinite(target) && target > 0) patch.analystTarget = target;
  }
  if (row.analyst_average != null) {
    if (typeof row.analyst_average === "number" && Number.isFinite(row.analyst_average)) patch.analystAvg = row.analyst_average.toFixed(2);
    if (typeof row.analyst_average === "string" && row.analyst_average.trim()) {
      const parsed = Number.parseFloat(row.analyst_average);
      patch.analystAvg = Number.isFinite(parsed) ? parsed.toFixed(2) : row.analyst_average.trim();
    }
  }
  if (row.market_cap != null) {
    const marketCap = Number(row.market_cap);
    if (Number.isFinite(marketCap) && marketCap > 0) patch.marketCap = marketCap;
  }
  const peg = parseStockPeg(row.peg_ratio);
  if (peg !== undefined) patch.peg = peg;
  if (row.beta != null) {
    const beta = Number(row.beta);
    if (Number.isFinite(beta)) patch.beta = beta;
  }
  if (row.is_etf === true) patch.isETF = true;
  if (row.is_etf === false) patch.isETF = false;
  return patch;
}

function loadSavedMappingMemory(): Partial<Record<string, CsvColumnStandard>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CSV_MAPPING_MEMORY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<string, CsvColumnStandard>>;
  } catch {
    return {};
  }
}

function saveMappingMemory(mapping: CsvColumnMapping) {
  if (typeof window === "undefined") return;
  try {
    const previous = loadSavedMappingMemory();
    const next = { ...previous };
    for (const [standard, source] of Object.entries(mapping) as Array<[CsvColumnStandard, string]>) {
      if (!source || source.toLowerCase() === "none") continue;
      next[normalizeCsvHeader(source)] = standard;
    }
    window.localStorage.setItem(CSV_MAPPING_MEMORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function loadSavedMappingPresets(): SavedCsvMappingPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CSV_MAPPING_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedCsvMappingPreset => {
        return typeof item?.id === "string" && typeof item?.name === "string" && typeof item?.updatedAt === "string";
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function persistSavedMappingPresets(presets: SavedCsvMappingPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CSV_MAPPING_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage failures
  }
}

function upsertSavedMappingPreset(preset: Omit<SavedCsvMappingPreset, "id" | "updatedAt"> & { id?: string }): SavedCsvMappingPreset[] {
  const trimmedName = preset.name.trim();
  if (!trimmedName) return loadSavedMappingPresets();
  const existing = loadSavedMappingPresets();
  const normalizedName = trimmedName.toLowerCase();
  const match = preset.id
    ? existing.find((item) => item.id === preset.id)
    : existing.find((item) => item.name.trim().toLowerCase() === normalizedName);
  const nextPreset: SavedCsvMappingPreset = {
    id: match?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    mapping: preset.mapping,
    defaultAccountName: preset.defaultAccountName.trim(),
    defaultRetirementAccount: preset.defaultRetirementAccount,
    updatedAt: new Date().toISOString(),
  };
  const next = [nextPreset, ...existing.filter((item) => item.id !== nextPreset.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  persistSavedMappingPresets(next);
  return next;
}

function removeSavedMappingPreset(id: string): SavedCsvMappingPreset[] {
  const next = loadSavedMappingPresets().filter((item) => item.id !== id);
  persistSavedMappingPresets(next);
  return next;
}

function dedupeSymbolRows(rows: CsvImportRow[]): CsvImportRow[] {
  const seen = new Set<string>();
  const out: CsvImportRow[] = [];
  for (const row of rows) {
    const symbol = row.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, qty: 0, price: 0, name: row.name });
  }
  return out;
}

function hasExistingPositionData(
  symbol: string,
  stocks: StockHolding[],
  lotsBySymbol: Record<string, { open: { quantity: number }[]; sold: { quantity: number }[] }>
): boolean {
  const existing = stocks.find((stock) => stock.symbol.toUpperCase() === symbol.toUpperCase());
  if (!existing) return false;
  if (existing.quantity > 0) return true;
  const lots = lotsBySymbol[existing.symbol];
  return !!lots && (lots.open.length > 0 || lots.sold.length > 0);
}

export function CsvImportExportBar({
  exportFilename,
  exportStocks,
  compact = false,
  importMode = "portfolio",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsvRows = usePortfolioStore((s) => s.importCsvRows);
  const clearAllHoldingsKeepingWatchlist = usePortfolioStore((s) => s.clearAllHoldingsKeepingWatchlist);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const updateStock = usePortfolioStore((s) => s.updateStock);
  const storeStocks = usePortfolioStore((s) => s.stocks);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const toExport = exportStocks ?? storeStocks;
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingMappingImport, setPendingMappingImport] = useState<PendingMappingImport | null>(null);
  const [presetPendingDelete, setPresetPendingDelete] = useState<SavedCsvMappingPreset | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({ active: false, label: "", value: 0 });
  const [savedPresets, setSavedPresets] = useState<SavedCsvMappingPreset[]>([]);
  const [deleteHoldingsOpen, setDeleteHoldingsOpen] = useState(false);
  const mappingFields = getMappingFieldsForMode(importMode);
  // importBusy tracks only the import's own progress — not background optimization.
  // importCsvRows already cancels any in-flight optimizePendingStocks via optimizationGeneration,
  // so blocking import on `optimizing` just locks the button during normal post-load auto-optimize.
  const importBusy = progress.active;

  function beginImportProgress(label: string, value: number) {
    setProgress({ active: true, label, value });
  }

  function updateImportProgress(label: string, value: number) {
    setProgress({ active: true, label, value });
  }

  function finishImportProgress() {
    setProgress({ active: false, label: "", value: 0 });
  }

  async function hydrateImportedSymbols(symbols: string[]) {
    if (!hasSupabaseConfig()) return;
    const supabase = createClient();
    for (const batch of chunk(symbols, 35)) {
      const { prices, sentiment } = await fetchTickerHydrationFromTables(supabase, batch);
      for (const sym of Object.keys(prices)) {
        const priceRow = prices[sym];
        if (!priceRow) continue;
        const patch = mapHydrationRowToPatch(priceRow);
        const sent = sentiment[sym];
        if (sent?.sentiment_score != null && Number.isFinite(Number(sent.sentiment_score))) {
          patch.aiSentimentScore = Number(sent.sentiment_score);
        }
        if (Object.keys(patch).length > 0) {
          updateStock(sym, patch);
        }
      }
    }
  }

  async function saveImportSnapshot() {
    if (!hasSupabaseConfig()) return;
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const authUserId = data.user?.id;
    if (!authUserId) return;
    const dataUserId = await resolveStocksPmDataUserId(supabase, authUserId);
    const state = usePortfolioStore.getState();
    await pushPortfolioSnapshotSlice(dataUserId, {
      cashBalance: state.cashBalance,
      stocks: state.stocks,
      lotsBySymbol: state.lotsBySymbol,
    }, { force: true, supabase });
  }

  async function applyImport(
    rows: CsvImportRow[],
    skipped: string[],
    defaults?: { defaultRetirementAccount?: boolean; defaultAccountName?: string },
    importedTrades: CsvImportTrade[] = []
  ) {
    const importedSymbols = [...new Set(rows.map((row) => row.symbol.toUpperCase()))];
    const currentSymbols = new Set(storeStocks.map((stock) => stock.symbol.toUpperCase()));
    const newSymbols = importedSymbols.filter((symbol) => !currentSymbols.has(symbol));
    if (currentSymbols.size + newSymbols.length > MAX_TRACKED_STOCKS) {
      const overflow = currentSymbols.size + newSymbols.length - MAX_TRACKED_STOCKS;
      setFlash({
        kind: "err",
        text: `Cannot import: ${newSymbols.length} new stocks in this file would exceed the maximum tracked-stock limit of ${MAX_TRACKED_STOCKS} (currently have ${currentSymbols.size}). Remove at least ${overflow} stock(s) before importing.`,
      });
      return;
    }

    updateImportProgress("Applying import", 58);
    const normalizedWithDefaults =
      defaults?.defaultRetirementAccount == null && !defaults?.defaultAccountName?.trim()
        ? rows
        : rows.map((row) =>
            row.qty > 0
              ? {
                  ...row,
                  isRetirementAccount:
                    row.isRetirementAccount == null ? defaults?.defaultRetirementAccount : row.isRetirementAccount,
                  account: row.account?.trim() || defaults?.defaultAccountName?.trim() || row.account,
                }
              : row
          );
    const normalizedRows = importMode === "watchlist" ? dedupeSymbolRows(rows) : rows;
    const importRows =
      importMode === "watchlist"
        ? normalizedRows.filter((row) => !hasExistingPositionData(row.symbol, storeStocks, lotsBySymbol))
        : normalizedRows;
    const outcome = importCsvRows(
      importMode === "watchlist" ? importRows : normalizedWithDefaults,
      importMode,
      importedTrades
    );

    if (outcome.importedSymbols.length > 0) {
      updateImportProgress("Loading market data", 76);
      await hydrateImportedSymbols(outcome.importedSymbols);
      recalc();
      usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
      updateImportProgress("Saving snapshot", 92);
      await saveImportSnapshot();
    }

    const invalidNote =
      skipped.length > 0
        ? ` Skipped invalid tickers: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}.`
        : "";

    if (importMode === "watchlist") {
      const alreadyTracked = normalizedRows.length - outcome.addedCount;
      const preservedHoldings = normalizedRows.filter((row) =>
        hasExistingPositionData(row.symbol, storeStocks, lotsBySymbol)
      ).length;
      const trackedNote = alreadyTracked > 0 ? ` ${alreadyTracked} already tracked.` : "";
      const preservedNote =
        preservedHoldings > 0 ? ` Preserved ${preservedHoldings} existing holding${preservedHoldings === 1 ? "" : "s"} and lot history.` : "";
      setFlash({
        kind: "ok",
        text: `Imported ${outcome.addedCount} new watchlist symbol(s).${trackedNote}${preservedNote}${invalidNote}`,
      });
      return;
    }

    const prunedNote =
      outcome.prunedWatchlistCount > 0
        ? ` Removed ${outcome.prunedWatchlistCount} stale watchlist-only symbol(s).`
        : "";
    const beforeImportSymbols = new Set(storeStocks.map((stock) => stock.symbol.toUpperCase()));
    const buyUpdates = outcome.netUpdates.filter((update) => update.action === "BUY" && !beforeImportSymbols.has(update.symbol));
    const addUpdates = outcome.netUpdates.filter((update) => update.action === "BUY" && beforeImportSymbols.has(update.symbol));
    const soldUpdates = outcome.netUpdates.filter((update) => update.action === "SELL");
    const describeUpdates = (updates: Array<{ symbol: string; qty: number }>, sign: "+" | "-") =>
      updates.map((update) => `${update.symbol} ${sign}${formatNumberMax2(update.qty)}`).join(", ");

    const hasDeltaUpdates = buyUpdates.length + addUpdates.length + soldUpdates.length > 0;
    const cashAdjustmentNote =
      Math.abs(outcome.cashAdjustedBy) > 1e-6
        ? ` Cash ${outcome.cashAdjustedBy > 0 ? "increased" : "decreased"} by ${formatCurrency(Math.abs(outcome.cashAdjustedBy))} from CSV holdings updates.`
        : "";

    const summaryText = hasDeltaUpdates
      ? [
          "CSV updates applied.",
          `Buy: ${buyUpdates.length}${buyUpdates.length > 0 ? ` (${describeUpdates(buyUpdates, "+")})` : ""}.`,
          `Add: ${addUpdates.length}${addUpdates.length > 0 ? ` (${describeUpdates(addUpdates, "+")})` : ""}.`,
          `Sold: ${soldUpdates.length}${soldUpdates.length > 0 ? ` (${describeUpdates(soldUpdates, "-")})` : ""}.`,
        ].join(" ")
      : "No updates detected from CSV.";

    setFlash({
      kind: "ok",
      text: `${summaryText}${prunedNote}${cashAdjustmentNote}${invalidNote}`,
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          beginImportProgress("Reading CSV file", 16);
          const text = String(reader.result ?? "");
          if (importMode === "portfolio" && shouldShowCsvMapping(text)) {
            const headers = extractCsvHeaders(text);
            setSavedPresets(loadSavedMappingPresets());
            setPendingMappingImport({
              text,
              headers,
              mapping: suggestCsvColumnMapping(headers, loadSavedMappingMemory()),
              defaultAccountName: "",
              defaultRetirementAccount: "",
              activePresetId: null,
            });
            finishImportProgress();
            return;
          }

          updateImportProgress("Parsing CSV", 36);
          if (importMode === "watchlist") {
            const res = parseWatchlistCsv(text);
            if (!res.ok) {
              setFlash({ kind: "err", text: res.error });
              finishImportProgress();
              return;
            }
            await applyImport(res.rows, res.skipped, undefined, []);
          } else {
            const res = await parsePortfolioCsv(text);
            if (!res.ok) {
              setFlash({ kind: "err", text: res.error });
              finishImportProgress();
              return;
            }
            await applyImport(res.rows, res.skipped, undefined, res.trades);
          }
          updateImportProgress("Finishing import", 100);
        } catch (error) {
          setFlash({
            kind: "err",
            text: error instanceof Error ? error.message : "CSV import failed.",
          });
        } finally {
          window.setTimeout(() => finishImportProgress(), 350);
        }
      })();
    };
    reader.readAsText(file, "utf-8");
  }

  function onExport() {
    const holdings = toExport.filter((s) => s.quantity > 0 || (lotsBySymbol[s.symbol]?.open.length ?? 0) > 0);
    if (holdings.length === 0) {
      setFlash({ kind: "err", text: "No holdings to export yet." });
      return;
    }
    downloadCsv(exportFilename, exportPortfolioCsv(holdings, lotsBySymbol));
    setFlash({ kind: "ok", text: "Holdings CSV downloaded." });
  }

  function onExportWatchlist() {
    const watchlist = toExport.filter((s) => s.quantity === 0 && (lotsBySymbol[s.symbol]?.open.length ?? 0) === 0);
    if (watchlist.length === 0) {
      setFlash({ kind: "err", text: "No watchlist-only symbols to export." });
      return;
    }
    const base = exportFilename.replace(/\.csv$/i, "");
    downloadCsv(`${base}_watchlist.csv`, exportWatchlistCsv(watchlist));
    setFlash({ kind: "ok", text: "Watchlist CSV downloaded." });
  }

  async function onDeleteHoldings() {
    clearAllHoldingsKeepingWatchlist();
    recalc();
    await saveImportSnapshot();
    setFlash({
      kind: "ok",
      text: "Deleted all holdings. Symbols were kept in your watchlist, while cash, chart history, and saved snapshots were preserved.",
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        aria-label="Choose CSV file to import"
        onChange={onPickFile}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importBusy}
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${importBusy ? "cursor-wait opacity-60" : ""}`}
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={importBusy}
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${importBusy ? "cursor-wait opacity-60" : ""}`}
        >
          Export Holdings
        </button>
        <button
          type="button"
          onClick={onExportWatchlist}
          disabled={importBusy}
          className={`ui-hover-pop rounded-lg border border-border bg-background font-medium text-foreground dark:border-white/10 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${importBusy ? "cursor-wait opacity-60" : ""}`}
        >
          Export Watchlist
        </button>
        {importMode === "portfolio" ? (
          <button
            type="button"
            onClick={() => setDeleteHoldingsOpen(true)}
            disabled={importBusy || storeStocks.every((stock) => stock.quantity <= 0)}
            className={`ui-hover-pop rounded-lg border border-error/45 bg-background font-medium text-error dark:border-error/35 ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
            } ${importBusy || storeStocks.every((stock) => stock.quantity <= 0) ? "cursor-not-allowed opacity-60" : ""}`}
          >
            Delete Holdings
          </button>
        ) : null}
      </div>
      {importBusy ? (
        <div className="min-w-[14rem] flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-border/80 dark:bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progress.value}%` }}
            />
          </div>
          <p className={`mt-1 ${compact ? "text-[11px]" : "text-xs"} text-subtle`} role="status" aria-live="polite">
            {progress.label}…
          </p>
        </div>
      ) : null}
      <AppModal
        open={pendingMappingImport != null}
        onClose={() => setPendingMappingImport(null)}
        size="lg"
        titleId="csv-mapping-title"
        describedById="csv-mapping-description"
      >
        <ModalSection className="border-b border-border px-5 pb-4 pt-5 dark:border-foreground/10">
          <h2 id="csv-mapping-title" className="text-lg font-semibold tracking-tight text-foreground">
            Map CSV columns
          </h2>
          <p id="csv-mapping-description" className="mt-2 text-sm leading-relaxed text-subtle">
            Match your file’s columns to the iOS import fields before importing. `Symbol` is required. For holdings, `Quantity` and `Price` must both be mapped. If both are left
            blank, the row imports as watchlist-only.
          </p>
        </ModalSection>
        <ModalSection className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {importMode === "portfolio" ? (
              <>
                <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">* Mapping Profile</p>
                      <p className="mt-1 text-xs text-subtle">Apply a previously saved mapping profile, including profile name and account type defaults, before reviewing the column matches.</p>
                    </div>
                    {savedPresets.length > 0 ? (
                      <div className="space-y-2">
                        {savedPresets.map((preset) => {
                          const isActive = pendingMappingImport?.activePresetId === preset.id;
                          return (
                            <div
                              key={preset.id}
                              className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${isActive ? "border-primary/60 bg-primary/10" : "border-border/80 bg-elevated/60"}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{preset.name}</p>
                                <p className="mt-1 text-xs text-subtle">{describePreset(preset)}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingMappingImport((current) =>
                                      current
                                        ? {
                                            ...current,
                                            mapping: preset.mapping,
                                            defaultAccountName: preset.defaultAccountName,
                                            defaultRetirementAccount: preset.defaultRetirementAccount,
                                            activePresetId: preset.id,
                                          }
                                        : current
                                    );
                                  }}
                                  className="ui-hover-spotlight rounded-lg border border-primary/40 bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = removeSavedMappingPreset(preset.id);
                                    setSavedPresets(next);
                                    setPendingMappingImport((current) =>
                                      current && current.activePresetId === preset.id
                                        ? { ...current, activePresetId: null }
                                        : current
                                    );
                                  }}
                                  className="ui-hover-pop rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-subtle">No saved mappings yet.</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-sm font-medium text-foreground">* Mapping Profile</p>
                    <p className="mt-1 text-xs text-subtle">Required. Used as the account/profile value for imported lots when the CSV does not provide one.</p>
                  </div>
                  <input
                    value={pendingMappingImport?.defaultAccountName ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPendingMappingImport((current) => (current ? { ...current, defaultAccountName: value } : current));
                    }}
                    placeholder="Brokerage, IRA, Roth, Taxable…"
                    className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-sm font-medium text-foreground">* Taxable or Retirement?</p>
                    <p className="mt-1 text-xs text-subtle">Required. Saved with the profile and applied to holding lots when no account type column is mapped.</p>
                  </div>
                  <select
                    value={pendingMappingImport?.defaultRetirementAccount ?? ""}
                    onChange={(e) => {
                      const value = e.target.value as "no" | "yes" | "";
                      setPendingMappingImport((current) => (current ? { ...current, defaultRetirementAccount: value } : current));
                    }}
                    className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Select...</option>
                    <option value="no">Taxable</option>
                    <option value="yes">Retirement</option>
                  </select>
                </div>
              </>
            ) : null}

            <div className="rounded-xl border border-border/80 bg-background/60 p-3">
              <p className="text-sm font-medium text-foreground">Column Mapping</p>
              <p className="mt-1 text-xs text-subtle">
                {importMode === "portfolio"
                  ? "Map your CSV column headers to the iOS holdings import fields. Symbol, Qty, and Avg cost are required."
                  : "Map your CSV column headers to the iOS watchlist import fields. Symbol is required. Holding columns are ignored."}
              </p>
            </div>
            {mappingFields.filter((field) => !HIDDEN_MAPPING_FIELDS.has(field.key)).map((field) => {
              const fieldKey = field.key;
              return (
                <div key={fieldKey} className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {field.label}
                      {field.required && <span className="ml-1 text-xs text-red-500">*</span>}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{field.description}</p>
                  </div>
                  <select
                    value={pendingMappingImport?.mapping[fieldKey] ?? "none"}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPendingMappingImport((current) =>
                        current
                          ? {
                              ...current,
                              mapping: {
                                ...current.mapping,
                                [fieldKey]: value,
                              },
                            }
                          : current
                      );
                    }}
                    className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
                  >
                    <option value="none">None</option>
                    {(pendingMappingImport?.headers ?? []).map((header) => (
                      <option key={`${fieldKey}:${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </ModalSection>
        <ModalSection className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setPendingMappingImport(null)}
            disabled={progress.active}
            className="ui-hover-pop rounded-lg border border-border px-4 py-2 text-sm text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!pendingMappingImport) return;
              void (async () => {
                try {
                  beginImportProgress("Saving column mapping", 18);
                  saveMappingMemory(pendingMappingImport.mapping);
                  const presetName = pendingMappingImport.defaultAccountName.trim();
                  if (presetName) {
                    const next = upsertSavedMappingPreset({
                      id: pendingMappingImport.activePresetId ?? undefined,
                      name: presetName,
                      mapping: pendingMappingImport.mapping,
                      defaultAccountName: pendingMappingImport.defaultAccountName,
                      defaultRetirementAccount: pendingMappingImport.defaultRetirementAccount === "yes" ? "yes" : "no",
                    });
                    setSavedPresets(next);
                    const savedPreset = next.find((preset) => preset.id === (pendingMappingImport.activePresetId ?? next[0]?.id));
                    if (savedPreset) {
                      setPendingMappingImport((current) => (current ? { ...current, activePresetId: savedPreset.id } : current));
                    }
                  }
                  updateImportProgress("Parsing CSV", 36);
                  const res = await parsePortfolioCsv(pendingMappingImport.text, {
                    columnMapping: pendingMappingImport.mapping,
                  });
                  if (!res.ok) {
                    setFlash({ kind: "err", text: res.error });
                    return;
                  }
                  await applyImport(
                    res.rows,
                    res.skipped,
                    {
                      defaultAccountName: pendingMappingImport.defaultAccountName,
                      defaultRetirementAccount:
                        pendingMappingImport.mapping.retirementAccount &&
                        pendingMappingImport.mapping.retirementAccount.toLowerCase() !== "none"
                          ? undefined
                          : pendingMappingImport.defaultRetirementAccount === "yes",
                    },
                    res.trades
                  );
                  updateImportProgress("Finishing import", 100);
                  setPendingMappingImport(null);
                } catch (error) {
                  setFlash({
                    kind: "err",
                    text: error instanceof Error ? error.message : "CSV import failed.",
                  });
                } finally {
                  window.setTimeout(() => finishImportProgress(), 350);
                }
              })();
            }}
            disabled={progress.active || !canSubmitMappingImport(pendingMappingImport)}
            className={`ui-hover-spotlight rounded-lg border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ${
              progress.active || !canSubmitMappingImport(pendingMappingImport) ? "cursor-not-allowed opacity-70" : ""
            }`}
          >
            {progress.active ? "Importing…" : "Import CSV"}
          </button>
        </ModalSection>
      </AppModal>

      <AppModal
        open={flash != null}
        onClose={() => setFlash(null)}
        size="sm"
        titleId="csv-import-status-title"
        describedById="csv-import-status-description"
      >
        <ModalSection className="border-b border-border px-5 pb-4 pt-5 dark:border-foreground/10">
          <h2 id="csv-import-status-title" className="text-lg font-semibold tracking-tight text-foreground">
            {flash?.kind === "err" ? "CSV error" : "CSV status"}
          </h2>
        </ModalSection>
        <ModalSection className="px-5 py-4">
          <p
            id="csv-import-status-description"
            className={`text-sm leading-relaxed ${flash?.kind === "err" ? "text-error" : "text-subtle"}`}
            role="status"
          >
            {flash?.text}
          </p>
        </ModalSection>
        <ModalSection className="flex justify-end border-t border-border px-4 py-4 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="ui-hover-spotlight rounded-lg border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Close
          </button>
        </ModalSection>
      </AppModal>

      <AppModal
        open={presetPendingDelete != null}
        onClose={() => setPresetPendingDelete(null)}
        size="sm"
        titleId="csv-delete-preset-title"
        describedById="csv-delete-preset-description"
      >
        <ModalSection className="border-b border-border px-5 pb-4 pt-5 dark:border-foreground/10">
          <h2 id="csv-delete-preset-title" className="text-lg font-semibold tracking-tight text-foreground">
            Delete saved mapping?
          </h2>
        </ModalSection>
        <ModalSection className="px-5 py-4">
          <p id="csv-delete-preset-description" className="text-sm leading-relaxed text-subtle">
            {presetPendingDelete
              ? `This will permanently remove “${presetPendingDelete.name}”.`
              : "This will permanently remove the selected mapping preset."}
          </p>
        </ModalSection>
        <ModalSection className="flex justify-end gap-2 border-t border-border px-4 py-4 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setPresetPendingDelete(null)}
            className="ui-hover-pop rounded-lg border border-border px-4 py-2 text-sm text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!presetPendingDelete) return;
              const next = removeSavedMappingPreset(presetPendingDelete.id);
              setSavedPresets(next);
              setPendingMappingImport((current) =>
                current && current.activePresetId === presetPendingDelete.id
                  ? {
                      ...current,
                      activePresetId: null,
                    }
                  : current
              );
              setPresetPendingDelete(null);
            }}
            className="ui-hover-spotlight rounded-lg border border-error/45 bg-error-bg px-4 py-2 text-sm font-semibold text-error"
          >
            Delete
          </button>
        </ModalSection>
      </AppModal>

      <ConfirmModal
        open={deleteHoldingsOpen}
        onClose={() => setDeleteHoldingsOpen(false)}
        onConfirm={() => {
          void onDeleteHoldings();
        }}
        title="Delete all holdings?"
        description="This clears all holdings quantities, cost basis, lot history, and trade history while keeping your tracked symbols in the watchlist. Cash, portfolio history, and chart data are preserved."
        confirmLabel="Delete Holdings"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
