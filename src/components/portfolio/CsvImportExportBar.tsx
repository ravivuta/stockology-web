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
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type Props = {
  exportFilename: string;
  /** Defaults to all symbols in the store (same as iOS: full tracked list). */
  exportStocks?: CsvExportStock[];
  compact?: boolean;
};

export function CsvImportExportBar({ exportFilename, exportStocks, compact = false }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importHoldings = usePortfolioStore((s) => s.importHoldings);
  const storeStocks = usePortfolioStore((s) => s.stocks);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const toExport = exportStocks ?? storeStocks;
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ rows: CsvImportRow[]; skipped: string[] } | null>(null);

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
        if (storeStocks.length > 0) {
          setPendingImport({ rows: res.rows, skipped: res.skipped });
          return;
        }
        importHoldings(res.rows);
        const importedSymbols = new Set(res.rows.map((row) => row.symbol)).size;
        const skipNote =
          res.skipped.length > 0
            ? ` Skipped invalid tickers: ${res.skipped.slice(0, 8).join(", ")}${res.skipped.length > 8 ? "…" : ""}.`
            : "";
        setFlash({ kind: "ok", text: `Imported ${importedSymbols} symbol(s).${skipNote}` });
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

      <ConfirmModal
        open={pendingImport != null}
        onClose={() => setPendingImport(null)}
        onConfirm={() => {
          if (!pendingImport) return;
          const { rows, skipped } = pendingImport;
          importHoldings(rows);
          const importedSymbols = new Set(rows.map((row) => row.symbol)).size;
          const skipNote =
            skipped.length > 0
              ? ` Skipped invalid tickers: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}.`
              : "";
          setFlash({ kind: "ok", text: `Imported ${importedSymbols} symbol(s).${skipNote}` });
        }}
        title="Replace portfolio from CSV?"
        description={
          <>
            You already track {storeStocks.length} symbol{storeStocks.length === 1 ? "" : "s"}. Importing applies the file as the new snapshot (quantities, costs, and strategy
            columns). This cannot be undone automatically.
          </>
        }
        confirmLabel="Import and replace"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
