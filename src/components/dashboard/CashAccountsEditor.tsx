"use client";

import { useMemo, useState } from "react";
import { usePortfolioStore } from "@/store/portfolioStore";
import { cashByAccount, displayAccount, knownCashAccounts, CASH_SYMBOL } from "@/lib/cash-accounts";
import { recordExternalCashFlow } from "@/lib/external-cash-flows";
import { snapshotSaveBlockReason } from "@/lib/portfolio-cloud-sync";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { formatCurrency } from "@/lib/numberFormat";
import { appCtaButton } from "@/lib/appCtaClasses";
import { fieldInputClass } from "@/lib/field-input";

export function CashAccountsEditor({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const stocks = usePortfolioStore((s) => s.stocks);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const applyCashLotsEdit = usePortfolioStore((s) => s.applyCashLotsEdit);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);

  const accounts = useMemo(
    () => knownCashAccounts(lotsBySymbol, stocks.map((stock) => stock.symbol)),
    [lotsBySymbol, stocks]
  );
  const startingCash = useMemo(() => cashByAccount(lotsBySymbol[CASH_SYMBOL]), [lotsBySymbol]);
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const values = drafts ?? Object.fromEntries(
    accounts.map((account) => {
      const accountKey = displayAccount(account).toLowerCase();
      const amount =
        startingCash[account] ??
        Object.entries(startingCash).find(([name]) => displayAccount(name).toLowerCase() === accountKey)?.[1] ??
        0;
      return [account, amount > 0.005 ? String(amount) : ""];
    })
  );

  const total = accounts.reduce((sum, account) => {
    const n = parseFloat(String(values[account] ?? "0").replace(/,/g, "").replace(/\$/g, ""));
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  if (!open) return null;

  function parseAmount(raw: string): number {
    const n = parseFloat(raw.replace(/,/g, "").replace(/\$/g, "").trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function snapshotFailureText(reason: string | null): string | null {
    if (reason === "prices-not-loaded") return "quotes are not loaded yet";
    if (reason === "empty") return "the portfolio looked empty";
    if (reason === "negative-total") return "the portfolio total was negative";
    if (reason === "negative-cash") return "cash was too far below zero";
    if (reason === "negative-limits") return "a holding limit was invalid";
    return reason;
  }

  async function save() {
    const amounts: Record<string, number> = {};
    for (const account of accounts) {
      amounts[account] = parseAmount(values[account] ?? "0");
    }
    setSaving(true);
    setSaveError(null);
    const result = applyCashLotsEdit(amounts);
    recalc();
    const saved = await flushCurrentPortfolioSnapshotNow(true);
    if (saved.error || saved.skipped) {
      const state = usePortfolioStore.getState();
      const reason =
        saved.error?.message ??
        snapshotSaveBlockReason({
          cashBalance: state.cashBalance,
          fixedIncomeByAccount: state.fixedIncomeByAccount,
          stocks: state.stocks,
          lotsBySymbol: state.lotsBySymbol,
        });
      setSaving(false);
      const detail = snapshotFailureText(reason)?.replace(/\.$/, "");
      setSaveError(
        detail
          ? `Cash is updated on this device, but the snapshot was not saved: ${detail}.`
          : "Cash is updated on this device, but the snapshot was not saved."
      );
      return;
    }
    const delta = result.nextCash - result.previousCash;
    if (Math.abs(delta) >= 0.005) {
      await recordExternalCashFlow({
        amount: delta,
        source: "web_home_cash_edit",
        balanceBefore: result.previousCash,
        balanceAfter: result.nextCash,
      });
    }
    setSaving(false);
    setDrafts(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cash-editor-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-5 shadow-xl">
        <h2 id="cash-editor-title" className="text-base font-semibold text-foreground">Edit cash</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-subtle">
          Totals roll up to Dashboard cash. Moving cash between accounts is not a deposit or withdrawal.
        </p>
        <div className="mt-4 space-y-3">
          {accounts.map((account) => (
            <label key={account} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{account}</span>
              <input
                value={values[account] ?? ""}
                placeholder="0"
                onFocus={() => {
                  if (parseAmount(values[account] ?? "") === 0) {
                    setDrafts({ ...values, [account]: "" });
                  }
                }}
                onChange={(e) => setDrafts({ ...values, [account]: e.target.value })}
                inputMode="decimal"
                className={`${fieldInputClass} w-32 rounded-lg px-2.5 py-1.5 text-right text-sm tabular-nums`}
                aria-label={`${account} cash`}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border/80 pt-3 text-sm">
          <span className="font-semibold text-foreground">Total</span>
          <span className="tabular-nums font-semibold text-[color:var(--dashboard-chart-cash)]">{formatCurrency(total)}</span>
        </div>
        {saveError ? <p className="mt-3 text-sm text-error">{saveError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDrafts(null);
              setSaveError(null);
              onClose();
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-subtle hover:text-foreground"
          >
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className={appCtaButton("px-3 py-1.5 text-sm")}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
