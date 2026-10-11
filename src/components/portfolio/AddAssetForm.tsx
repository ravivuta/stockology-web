"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { cashByAccount, displayAccount, isCashSymbol, CASH_SYMBOL } from "@/lib/cash-accounts";
import { isValidTicker } from "@/lib/csvPortfolio";
import { recordExternalCashFlow } from "@/lib/external-cash-flows";
import { isFixedIncomeSymbol } from "@/lib/fixed-income-accounts";
import { formatCurrency } from "@/lib/numberFormat";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { hasPremiumFeatureAccess, trackedStockLimitMessage } from "@/lib/subscription-limits";
import { withAppBasePath } from "@/lib/base-path";
import { appCtaButton } from "@/lib/appCtaClasses";
import { fieldInputClass } from "@/lib/field-input";
import { AppModal } from "@/components/ui/AppModal";

type AssetKind = "stock" | "cash" | "fixedIncome";

const RETURN_RATE_KEY = "fixedIncomeReturnRateByAccount.v1";

function todayInputDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").replace(/\$/g, "").trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

function rememberReturnRate(account: string, rate: number) {
  try {
    const current = JSON.parse(localStorage.getItem(RETURN_RATE_KEY) ?? "{}") as Record<string, number>;
    current[account] = rate;
    localStorage.setItem(RETURN_RATE_KEY, JSON.stringify(current));
  } catch {
    /* local preference only */
  }
}

export function AddAssetForm({ idPrefix }: { idPrefix: string }) {
  const stocks = usePortfolioStore((s) => s.stocks);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const addStock = usePortfolioStore((s) => s.addStock);
  const recordTrade = usePortfolioStore((s) => s.recordTrade);
  const applyCashLotsEdit = usePortfolioStore((s) => s.applyCashLotsEdit);
  const applyFixedIncomeLotsEdit = usePortfolioStore((s) => s.applyFixedIncomeLotsEdit);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);

  const [userId, setUserId] = useState<string | undefined>();
  const { row } = useSubscriptionGate(userId);
  const [kind, setKind] = useState<AssetKind>("stock");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [tradeDate, setTradeDate] = useState(todayInputDate);
  const [profileChoice, setProfileChoice] = useState("__new__");
  const [newAccount, setNewAccount] = useState("");
  const [accountType, setAccountType] = useState<"unknown" | "retirement" | "taxable">("unknown");
  const [amountText, setAmountText] = useState("");
  const [returnRateText, setReturnRateText] = useState("");
  const [deductFromCash, setDeductFromCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const resolved = await syncStocksPmAuthUser(supabase, uid);
      if (!cancelled) setUserId(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accounts = useMemo(() => {
    const names = new Map<string, string>();
    const remember = (account: string | null | undefined) => {
      const name = displayAccount(account);
      names.set(name.toLowerCase(), name);
    };
    for (const bundle of Object.values(lotsBySymbol)) {
      for (const lot of bundle.open ?? []) {
        if ((Number(lot.quantity) || 0) > 0.005) remember(lot.account);
      }
    }
    for (const account of Object.keys(cashByAccount(lotsBySymbol[CASH_SYMBOL]))) remember(account);
    for (const [account, amount] of Object.entries(fixedIncomeByAccount)) {
      if (Number(amount) > 0.005) remember(account);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [fixedIncomeByAccount, lotsBySymbol]);

  const accountName = profileChoice === "__new__" ? newAccount.trim() : profileChoice;
  const retirementFlag = accountType === "retirement" ? true : accountType === "taxable" ? false : null;

  function resetStockFields() {
    setSymbol("");
    setQuantity("");
    setAverageCost("");
    setTradeDate(todayInputDate());
  }

  async function submitStock() {
    const sym = symbol.trim().toUpperCase();
    if (!isValidTicker(sym)) {
      setError("Enter a valid symbol.");
      return;
    }
    const qtyRaw = quantity.trim();
    const priceRaw = averageCost.trim();
    const hasQty = qtyRaw.length > 0;
    const hasPrice = priceRaw.length > 0;
    if (hasQty !== hasPrice) {
      setError("Enter both quantity and average cost, or leave both empty.");
      return;
    }
    const qty = hasQty ? parseAmount(qtyRaw) : 0;
    const price = hasPrice ? parseAmount(priceRaw) : 0;
    if (hasQty && (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0)) {
      setError("Quantity and average cost must be greater than 0.");
      return;
    }
    if (hasQty) {
      if (!accountName) {
        setError("Account/Profile is required when adding holdings.");
        return;
      }
      if (retirementFlag == null) {
        setError("Select account type (Retirement or Taxable) when adding holdings.");
        return;
      }
    }

    const tracked = stocks.filter((stock) => !isCashSymbol(stock.symbol) && !isFixedIncomeSymbol(stock.symbol));
    const exists = tracked.some((stock) => stock.symbol.toUpperCase() === sym);
    if (!exists && tracked.length >= (hasPremiumFeatureAccess(row ?? null) ? 200 : 25)) {
      setError(trackedStockLimitMessage(tracked.length, row ?? null));
      return;
    }

    setSaving(true);
    if (!exists) {
      addStock({
        symbol: sym,
        quantity: 0,
        averageCost: 0,
        lastPrice: hasQty ? price : 0,
        pendingOptimization: true,
      });
    }
    if (hasQty) {
      recordTrade(sym, "BUY", qty, price, tradeDate, {
        account: accountName,
        isRetirementAccount: retirementFlag,
      });
    }
    recalc();
    await flushCurrentPortfolioSnapshotNow(true);
    setSaving(false);
    setStatus(hasQty ? `Added ${qty} ${sym} @ ${formatCurrency(price)}.` : `Added ${sym} without a holding.`);
    resetStockFields();
  }

  async function submitCashLike() {
    const amount = parseAmount(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    if (!accountName) {
      setError("Enter an account/profile name.");
      return;
    }
    const cash = cashByAccount(lotsBySymbol[CASH_SYMBOL]);
    const matched = Object.entries(cash).find(([name]) => displayAccount(name).toLowerCase() === accountName.toLowerCase());
    const cashKey = matched?.[0] ?? accountName;
    const available = matched?.[1] ?? 0;

    if (kind === "fixedIncome") {
      if (!returnRateText.trim()) {
        setError("Enter expected return rate for fixed income.");
        return;
      }
      const rate = parseAmount(returnRateText);
      if (!Number.isFinite(rate) || rate < 0) {
        setError("Return rate must be 0 or higher.");
        return;
      }
      if (deductFromCash && available + 0.0001 < amount) {
        setError(`Insufficient cash in ${accountName}. Available: ${formatCurrency(available)}`);
        return;
      }
      const nextFixed = { ...fixedIncomeByAccount };
      const existingFixed = Object.entries(nextFixed).find(([name]) => displayAccount(name).toLowerCase() === accountName.toLowerCase());
      const fixedKey = existingFixed?.[0] ?? accountName;
      nextFixed[fixedKey] = (existingFixed?.[1] ?? 0) + amount;
      setSaving(true);
      applyFixedIncomeLotsEdit(nextFixed, { adjustCash: deductFromCash });
      rememberReturnRate(accountName, rate);
      recalc();
      await flushCurrentPortfolioSnapshotNow(true);
      setSaving(false);
      setStatus(
        deductFromCash
          ? `Moved ${formatCurrency(amount)} from cash to fixed income in ${accountName}.`
          : `Added ${formatCurrency(amount)} fixed income in ${accountName}.`
      );
      setAmountText("");
      setReturnRateText("");
      return;
    }

    const nextCash = { ...cash };
    nextCash[cashKey] = available + amount;
    setSaving(true);
    const result = applyCashLotsEdit(nextCash);
    recalc();
    await flushCurrentPortfolioSnapshotNow(true);
    const delta = result.nextCash - result.previousCash;
    if (Math.abs(delta) >= 0.005) {
      await recordExternalCashFlow({
        amount: delta,
        source: "web_add_cash",
        balanceBefore: result.previousCash,
        balanceAfter: result.nextCash,
      });
    }
    setSaving(false);
    setStatus(`Added ${formatCurrency(amount)} cash to ${accountName}.`);
    setAmountText("");
  }

  async function submit() {
    setError(null);
    setStatus(null);
    if (kind === "stock") await submitStock();
    else await submitCashLike();
  }

  const inputClass = `${fieldInputClass} rounded-lg px-3 py-2 text-sm`;

  return (
    <div className="w-full space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">What are you adding?</p>
        <div className="mt-1 inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Asset type">
          {(
            [
              ["stock", "Stock"],
              ["cash", "Cash"],
              ["fixedIncome", "Fixed Income"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => {
                setKind(value);
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                kind === value ? "bg-primary text-primary-foreground" : "text-subtle"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
      {status ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{status}</p> : null}

      {kind === "stock" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle md:col-span-2">
            Company name or symbol
            <SymbolTradeCombobox id={`${idPrefix}-symbol`} value={symbol} onChange={setSymbol} portfolioStocks={stocks} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
            Quantity
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Number of shares" className={inputClass} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
            Average cost per share
            <input value={averageCost} onChange={(e) => setAverageCost(e.target.value)} placeholder="Purchase price" className={inputClass} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
            Trade date
            <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} className={inputClass} />
          </label>
          <p className="text-[10px] leading-snug text-subtle md:col-span-2">
            Leave quantity and price empty to add without holdings. If entering holding info, fill both quantity and price.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-foreground">{kind === "cash" ? "Cash details" : "Fixed income details"}</p>
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
            {kind === "cash" ? "Dollar amount" : "Invested amount"}
            <input value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0" className={inputClass} />
          </label>
          {kind === "fixedIncome" ? (
            <>
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input type="checkbox" className="mt-0.5" checked={deductFromCash} onChange={(e) => setDeductFromCash(e.target.checked)} />
                <span>
                  <span className="block font-medium">Deduct from cash in this account</span>
                  <span className="text-[10px] text-subtle">Turn off if this fixed-income position is funded externally.</span>
                </span>
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
                Expected return rate (%)
                <input value={returnRateText} onChange={(e) => setReturnRateText(e.target.value)} placeholder="e.g. 4.8" className={inputClass} />
              </label>
            </>
          ) : null}
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
          Account/Profile
          <select value={profileChoice} onChange={(e) => setProfileChoice(e.target.value)} className={inputClass}>
            <option value="__new__">Add new account/profile</option>
            {accounts.map((account) => (
              <option key={account} value={account}>{account}</option>
            ))}
          </select>
        </label>
        {profileChoice === "__new__" ? (
          <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
            New account name
            <input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="Brokerage, IRA, 401k" className={inputClass} />
          </label>
        ) : null}
        <label className="flex flex-col gap-0.5 text-[10px] text-subtle">
          Account type
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)} className={inputClass}>
            <option value="unknown">Select type</option>
            <option value="retirement">Retirement</option>
            <option value="taxable">Taxable</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] leading-snug text-subtle">Account and type map balances into the account allocation summary.</p>

      {!hasPremiumFeatureAccess(row ?? null) && kind === "stock" ? (
        <p className="text-[10px] leading-snug text-subtle">
          Free plan tracks up to 25 companies.{" "}
          <Link href={withAppBasePath("/billing/start?next=/portfolio")} className="font-semibold text-primary underline-offset-2 hover:underline">
            Subscribe
          </Link>{" "}
          to raise the cap to 200.
        </p>
      ) : null}

      <button type="button" disabled={saving} onClick={() => void submit()} className={appCtaButton("ui-hover-pop px-3 py-2 text-sm")}>
        {saving ? "Saving..." : kind === "stock" ? "Add stock" : kind === "cash" ? "Add cash" : "Add fixed income"}
      </button>
    </div>
  );
}

export function AddAssetButton({ idPrefix }: { idPrefix: string }) {
  const [open, setOpen] = useState(false);
  const titleId = `${idPrefix}-title`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={appCtaButton("ui-hover-pop px-3 py-1.5 text-sm")}
      >
        Add stock
      </button>
      <AppModal open={open} onClose={() => setOpen(false)} size="lg" stagger={false} titleId={titleId}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-foreground">Add asset</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1 text-sm text-subtle hover:bg-muted/60 hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          <AddAssetForm idPrefix={idPrefix} />
        </div>
      </AppModal>
    </>
  );
}
