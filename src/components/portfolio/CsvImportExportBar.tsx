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
  defaultRetirementAccount: "no" | "yes";
  savePreset: boolean;
  presetName: string;
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

function upsertSavedMappingPreset(preset: Omit<SavedCsvMappingPreset, "id" | "updatedAt">): SavedCsvMappingPreset[] {
  const trimmedName = preset.name.trim();
  if (!trimmedName) return loadSavedMappingPresets();
  const existing = loadSavedMappingPresets();
  const normalizedName = trimmedName.toLowerCase();
  const match = existing.find((item) => item.name.trim().toLowerCase() === normalizedName);
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
  const [progress, setProgress] = useState<ImportProgress>({ active: false, label: "", value: 0 });
  const [savedPresets, setSavedPresets] = useState<SavedCsvMappingPreset[]>([]);

  function beginImportProgress(label: string, value: number) {
    setProgress({ active: true, label, value });
  }

  function updateImportProgress(label: string, value: number) {
    setProgress({ active: true, label, value });
  }

  function finishImportProgress() {
    setProgress({ active: false, label: "", value: 0 });
  }

  async function applyImport(
    rows: CsvImportRow[],
    skipped: string[],
    defaults?: { defaultRetirementAccount?: boolean; defaultAccountName?: string }
  ) {
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
    const outcome = importCsvRows(
      importMode === "watchlist" ? normalizedRows : normalizedWithDefaults,
      importMode
    );

    if (outcome.importedSymbols.length > 0) {
      updateImportProgress("Refreshing imported symbols", 82);
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
            defaultRetirementAccount: "no",
            savePreset: false,
            presetName: "",
          });
          finishImportProgress();
          return;
          }

          updateImportProgress("Parsing CSV", 36);
          const res = await parsePortfolioCsv(text);
          if (!res.ok) {
            setFlash({ kind: "err", text: res.error });
            finishImportProgress();
            return;
          }
          await applyImport(res.rows, res.skipped);
          updateImportProgress("Finishing import", 100);
        } finally {
          window.setTimeout(() => finishImportProgress(), 350);
        }
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
          disabled={progress.active}
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${progress.active ? "cursor-wait opacity-60" : ""}`}
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={progress.active}
          className={`ui-hover-pop rounded-lg border border-primary/40 bg-background font-medium text-foreground dark:border-primary/30 ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${progress.active ? "cursor-wait opacity-60" : ""}`}
        >
          Export CSV
        </button>
      </div>
      {progress.active ? (
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
                <p className="text-sm font-medium text-foreground">Saved Preset</p>
                <p className="mt-1 text-xs text-subtle">Reuse a saved mapping/profile setup from a prior import.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const presetId = e.target.value;
                    if (!presetId) return;
                    const preset = savedPresets.find((item) => item.id === presetId);
                    if (!preset) return;
                    setPendingMappingImport((current) =>
                      current
                        ? {
                            ...current,
                            mapping: preset.mapping,
                            defaultAccountName: preset.defaultAccountName,
                            defaultRetirementAccount: preset.defaultRetirementAccount,
                            presetName: preset.name,
                          }
                        : current
                    );
                    e.currentTarget.value = "";
                  }}
                  className="min-w-[13rem] rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Load saved preset…</option>
                  {savedPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                {savedPresets.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const presetName = pendingMappingImport?.presetName.trim();
                      if (!presetName) return;
                      const preset = savedPresets.find((item) => item.name.trim().toLowerCase() === presetName.toLowerCase());
                      if (!preset) return;
                      const next = removeSavedMappingPreset(preset.id);
                      setSavedPresets(next);
                      setPendingMappingImport((current) =>
                        current
                          ? {
                              ...current,
                              savePreset: false,
                              presetName: "",
                            }
                          : current
                      );
                    }}
                    className="ui-hover-pop rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                  >
                    Delete preset
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <p className="text-sm font-medium text-foreground">Profile Name</p>
                <p className="mt-1 text-xs text-subtle">Used as the account/profile value for imported lots when the CSV does not provide one.</p>
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
            <div className="grid gap-2 rounded-xl border border-border/80 bg-background/60 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <p className="text-sm font-medium text-foreground">Save For Future</p>
                <p className="mt-1 text-xs text-subtle">Store this mapping and import defaults as a reusable preset.</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={pendingMappingImport?.savePreset ?? false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPendingMappingImport((current) => (current ? { ...current, savePreset: checked } : current));
                    }}
                  />
                  Save this mapping preset
                </label>
                <input
                  value={pendingMappingImport?.presetName ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPendingMappingImport((current) => (current ? { ...current, presetName: value } : current));
                  }}
                  placeholder="Preset name"
                  disabled={!pendingMappingImport?.savePreset}
                  className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground disabled:opacity-50"
                />
              </div>
            </div>
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
                  if (pendingMappingImport.savePreset && pendingMappingImport.presetName.trim()) {
                    const next = upsertSavedMappingPreset({
                      name: pendingMappingImport.presetName,
                      mapping: pendingMappingImport.mapping,
                      defaultAccountName: pendingMappingImport.defaultAccountName,
                      defaultRetirementAccount: pendingMappingImport.defaultRetirementAccount,
                    });
                    setSavedPresets(next);
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
                  }
                );
                  updateImportProgress("Finishing import", 100);
                  setPendingMappingImport(null);
                } finally {
                  window.setTimeout(() => finishImportProgress(), 350);
                }
              })();
            }}
            disabled={progress.active}
            className={`ui-hover-spotlight rounded-lg border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ${
              progress.active ? "cursor-wait opacity-70" : ""
            }`}
          >
            {progress.active ? "Importing…" : "Import CSV"}
          </button>
        </ModalSection>
      </AppModal>
    </div>
  );
}
