"use client";

import { useRef, useState } from "react";
import { usePortfolioStore } from "@/store/portfolioStore";
import {
  CSV_IMPORT_FIELDS,
  parsePortfolioCsv,
  shouldShowCsvMapping,
  suggestCsvColumnMapping,
  normalizeCsvHeader,
  extractCsvHeaders,
  exportPortfolioCsv,
  downloadCsv,
  type CsvColumnMapping,
  type CsvColumnStandard,
  type CsvExportStock,
  type CsvImportRow,
} from "@/lib/csvPortfolio";
import { runRefreshPipeline } from "@/lib/refresh";
import { AppModal, ModalSection } from "@/components/ui/AppModal";

const CSV_MAPPING_MEMORY_KEY = "stocks-pm-csv-mapping-memory:v1";

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
  defaultRetirementAccount: "no" | "yes";
};

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

export function CsvImportExportBar({
  exportFilename,
  exportStocks,
  compact = false,
  importMode = "portfolio",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsvRows = usePortfolioStore((s) => s.importCsvRows);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const storeStocks = usePortfolioStore((s) => s.stocks);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const toExport = exportStocks ?? storeStocks;
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingMappingImport, setPendingMappingImport] = useState<PendingMappingImport | null>(null);

  async function applyImport(rows: CsvImportRow[], skipped: string[], defaultRetirementAccount?: boolean) {
    const normalizedWithDefaults =
      defaultRetirementAccount == null
        ? rows
        : rows.map((row) =>
            row.qty > 0 && row.isRetirementAccount == null
              ? { ...row, isRetirementAccount: defaultRetirementAccount }
              : row
          );
    const normalizedRows = importMode === "watchlist" ? dedupeSymbolRows(rows) : rows;
    const outcome = importCsvRows(
      importMode === "watchlist" ? normalizedRows : normalizedWithDefaults,
      importMode
    );

    if (outcome.importedSymbols.length > 0) {
      await runRefreshPipeline(outcome.importedSymbols);
      recalc();
      usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
    }

    const invalidNote =
      skipped.length > 0
        ? ` Skipped invalid tickers: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}.`
        : "";

    if (importMode === "watchlist") {
      const alreadyTracked = outcome.importedCount - outcome.addedCount;
      const trackedNote = alreadyTracked > 0 ? ` ${alreadyTracked} already tracked.` : "";
      setFlash({
        kind: "ok",
        text: `Imported ${outcome.addedCount} new watchlist symbol(s).${trackedNote}${invalidNote}`,
      });
      return;
    }

    const prunedNote =
      outcome.prunedWatchlistCount > 0
        ? ` Removed ${outcome.prunedWatchlistCount} stale watchlist-only symbol(s).`
        : "";
    const typeLead =
      outcome.importType === "holdings"
        ? `Merged ${outcome.importedCount} symbol(s) with the existing portfolio.`
        : `Imported ${outcome.importedCount} watchlist symbol(s) into the portfolio tracker.`;

    setFlash({
      kind: "ok",
      text: `${typeLead}${prunedNote}${invalidNote}`,
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const text = String(reader.result ?? "");
        if (importMode === "portfolio" && shouldShowCsvMapping(text)) {
          const headers = extractCsvHeaders(text);
          setPendingMappingImport({
            text,
            headers,
            mapping: suggestCsvColumnMapping(headers, loadSavedMappingMemory()),
            defaultRetirementAccount: "no",
          });
          return;
        }

        const res = await parsePortfolioCsv(text);
        if (!res.ok) {
          setFlash({ kind: "err", text: res.error });
          return;
        }
        await applyImport(res.rows, res.skipped);
      })();
    };
    reader.readAsText(file, "utf-8");
  }

  function onExport() {
    if (toExport.length === 0) {
      setFlash({ kind: "err", text: "Nothing to export yet." });
      return;
    }
    downloadCsv(exportFilename, exportPortfolioCsv(toExport, lotsBySymbol));
    setFlash({ kind: "ok", text: "CSV downloaded." });
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
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={onExport}
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          Export CSV
        </button>
      </div>
      {flash ? (
        <p className={`${compact ? "text-xs" : "text-sm"} ${flash.kind === "err" ? "text-error" : "text-subtle"}`} role="status">
          {flash.text}
        </p>
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
            {CSV_IMPORT_FIELDS.map((field) => (
              <div key={field.key} className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {field.label}
                    {field.required ? " *" : ""}
                  </p>
                  <p className="mt-1 text-xs text-subtle">{field.description}</p>
                </div>
                <select
                  value={pendingMappingImport?.mapping[field.key] ?? "none"}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPendingMappingImport((current) =>
                      current
                        ? {
                            ...current,
                            mapping: {
                              ...current.mapping,
                              [field.key]: value,
                            },
                          }
                        : current
                    );
                  }}
                  className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
                >
                  <option value="none">None</option>
                  {(pendingMappingImport?.headers ?? []).map((header) => (
                    <option key={`${field.key}:${header}`} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <p className="text-sm font-medium text-foreground">Default Retirement</p>
                <p className="mt-1 text-xs text-subtle">Applied to holding lots when no retirement column is mapped.</p>
              </div>
              <select
                value={pendingMappingImport?.defaultRetirementAccount ?? "no"}
                onChange={(e) => {
                  const value = e.target.value as "no" | "yes";
                  setPendingMappingImport((current) => (current ? { ...current, defaultRetirementAccount: value } : current));
                }}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
        </ModalSection>
        <ModalSection className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 dark:border-foreground/10">
          <button
            type="button"
            onClick={() => setPendingMappingImport(null)}
            className="ui-hover-pop rounded-lg border border-border px-4 py-2 text-sm text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!pendingMappingImport) return;
              void (async () => {
                saveMappingMemory(pendingMappingImport.mapping);
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
                  pendingMappingImport.mapping.retirementAccount &&
                    pendingMappingImport.mapping.retirementAccount.toLowerCase() !== "none"
                    ? undefined
                    : pendingMappingImport.defaultRetirementAccount === "yes"
                );
                setPendingMappingImport(null);
              })();
            }}
            className="ui-hover-spotlight rounded-lg border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Import CSV
          </button>
        </ModalSection>
      </AppModal>
    </div>
  );
}
