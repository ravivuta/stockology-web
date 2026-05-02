"use client";

import { useRef, useState } from "react";
import { usePortfolioStore } from "@/store/portfolioStore";
import {
  parsePortfolioCsv,
  exportPortfolioCsv,
  downloadCsv,
  type CsvExportStock,
  type CsvImportRow,
} from "@/lib/csvPortfolio";
import { runRefreshPipeline } from "@/lib/refresh";

type Props = {
  exportFilename: string;
  /** Defaults to all symbols in the store (same as iOS: full tracked list). */
  exportStocks?: CsvExportStock[];
  compact?: boolean;
  importMode?: "portfolio" | "watchlist";
};

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

  async function applyImport(rows: CsvImportRow[], skipped: string[]) {
    const normalizedRows = importMode === "watchlist" ? dedupeSymbolRows(rows) : rows;
    const outcome = importCsvRows(normalizedRows, importMode);

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
    </div>
  );
}
