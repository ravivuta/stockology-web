"use client";

import { useMemo, useState } from "react";
import { usePortfolioStore } from "@/store/portfolioStore";
import { cashByAccount, knownCashAccounts, CASH_SYMBOL } from "@/lib/cash-accounts";
import { recordExternalCashFlow } from "@/lib/external-cash-flows";
import { patchCurrentPortfolioSnapshotCash, patchCurrentPortfolioSnapshotHoldings } from "@/lib/portfolio-snapshot-client";
import { formatCurrency } from "@/lib/numberFormat";
import { appCtaButton } from "@/lib/appCtaClasses";

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
  const values = drafts ?? Object.fromEntries(
    accounts.map((account) => {
      const amount =
        startingCash[account] ??
        Object.entries(startingCash).find(([name]) => name.toLowerCase() === account.toLowerCase())?.[1] ??
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

  async function save() {
    const amounts: Record<string, number> = {};
    for (const account of accounts) {
      amounts[account] = parseAmount(values[account] ?? "0");
    }
    const result = applyCashLotsEdit(amounts);
    recalc();
    await patchCurrentPortfolioSnapshotHoldings();
    await patchCurrentPortfolioSnapshotCash(result.markedPending);
    const delta = result.nextCash - result.previousCash;
    if (Math.abs(delta) >= 0.005) {
      await recordExternalCashFlow({
        amount: delta,
        source: "web_home_cash_edit",
        balanceBefore: result.previousCash,
        balanceAfter: result.nextCash,
      });
    }
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
                className="w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-right text-sm tabular-nums text-foreground"
                aria-label={`${account} cash`}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border/80 pt-3 text-sm">
          <span className="font-semibold text-foreground">Total</span>
          <span className="tabular-nums font-semibold text-[color:var(--dashboard-chart-cash)]">{formatCurrency(total)}</span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDrafts(null);
              onClose();
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-subtle hover:text-foreground"
          >
            Cancel
          </button>
          <button type="button" onClick={() => void save()} className={appCtaButton("px-3 py-1.5 text-sm")}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
