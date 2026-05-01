"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CreditCard,
  Database,
  Palette,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { appCtaButton } from "@/lib/appCtaClasses";
import { formatCurrency } from "@/lib/numberFormat";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
  { id: "data", label: "Data", icon: Database },
] as const;

function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  id: string;
  icon: typeof Palette;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-16 rounded-lg border border-border bg-elevated shadow-[var(--theme-shadow-card)] dark:border-white/[0.08]",
        className
      )}
    >
      <div className="flex gap-2.5 border-b border-border/80 px-3 py-2.5 dark:border-white/[0.06] sm:px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary dark:bg-primary/18">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight tracking-tight text-foreground sm:text-[15px]">{title}</h2>
          {description ? <p className="mt-0.5 text-[11px] leading-snug text-subtle sm:text-xs sm:leading-snug">{description}</p> : null}
        </div>
      </div>
      <div className="px-3 py-3 sm:px-4 sm:py-3">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">{children}</span>;
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | undefined>();
  const { row, loading, allowed } = useSubscriptionGate(userId);
  const cashBalance = usePortfolioStore((s) => s.cashBalance);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useAISentimentForRecommendations = usePortfolioStore((s) => s.useAISentimentForRecommendations);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const timezone = usePortfolioStore((s) => s.timezone);
  const region = usePortfolioStore((s) => s.region);
  const setCash = usePortfolioStore((s) => s.setCash);
  const setSettings = usePortfolioStore((s) => s.setSettings);
  const resetAll = usePortfolioStore((s) => s.resetAll);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const lastRefreshAt = usePortfolioStore((s) => s.lastRefreshAt);

  const [cashInput, setCashInput] = useState(String(cashBalance));
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const resolved = await resolveStocksPmDataUserId(supabase, uid);
      if (!cancelled) setUserId(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCashInput(String(cashBalance));
  }, [cashBalance]);

  const scrollToId = useCallback((id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  function saveCash() {
    const n = parseFloat(cashInput.replace(/,/g, "")) || 0;
    setCash(n);
    recalc();
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/25 dark:border-white/[0.1] dark:bg-yale/30";

  return (
    <div className="mx-auto max-w-6xl pb-4 lg:pb-5">
      <header className="relative mb-3 overflow-hidden rounded-lg border border-border bg-elevated px-3 py-3.5 shadow-[var(--theme-shadow-card)] sm:px-4 sm:py-4 dark:border-white/[0.08] lg:mb-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 0% 0%, color-mix(in srgb, var(--theme-primary) 22%, transparent), transparent 60%), radial-gradient(ellipse 55% 45% at 100% 0%, color-mix(in srgb, var(--theme-primary-light) 14%, transparent), transparent 55%)",
          }}
        />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 max-w-2xl space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary dark:border-primary/25 dark:bg-primary/15">
              <Sparkles className="h-3 w-3" aria-hidden />
              Profile
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Settings</h1>
            <p className="max-w-xl text-[11px] leading-snug text-subtle sm:text-xs sm:leading-snug">
              Account, subscription, and portfolio preferences—aligned with the Stocks PM iOS profile experience.
            </p>
          </div>
          <div className="flex shrink-0 sm:justify-end">
            <div className="rounded-md border border-border/80 bg-background/80 px-2.5 py-1.5 text-right dark:border-white/[0.08] dark:bg-white/[0.04]">
              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-subtle">Cash (saved)</p>
              <p className="mt-px text-sm font-semibold tabular-nums text-foreground">{formatCurrency(cashBalance)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-4 xl:gap-5">
        <aside className="mb-3 lg:col-span-4 xl:col-span-3 lg:mb-0">
          <div className="lg:sticky lg:top-16">
            <p className="mb-1.5 hidden text-[9px] font-semibold uppercase tracking-[0.12em] text-subtle lg:block">On this page</p>
            <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-px lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={activeSection === id ? "true" : undefined}
                  onClick={() => scrollToId(id)}
                  className={cn(
                    "flex min-w-[max-content] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors lg:w-full lg:min-w-0",
                    activeSection === id
                      ? "border-primary/35 bg-primary/10 text-foreground dark:border-primary/30 dark:bg-primary/12"
                      : "border-transparent bg-muted/40 text-subtle hover:border-border hover:bg-muted/70 hover:text-foreground dark:bg-white/[0.04] dark:hover:border-white/[0.1] dark:hover:bg-white/[0.07]"
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-3 lg:col-span-8 xl:col-span-9 lg:space-y-4">
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            <SettingsCard
              id="appearance"
              icon={Palette}
              title="Appearance"
              description="Light or dark mode for this browser. Your choice is remembered on this device."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <ThemeToggle />
                <p className="max-w-sm text-[10px] leading-snug text-subtle sm:text-right sm:text-[11px]">
                  Applies to this browser only; pick light or dark explicitly.
                </p>
              </div>
            </SettingsCard>

            <SettingsCard
              id="subscription"
              icon={CreditCard}
              title="Subscription"
              description="Trial and subscription status from your account."
            >
              {loading ? (
                <p className="text-xs text-subtle">Checking…</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div
                    className={cn(
                      "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      allowed
                        ? "bg-primary/12 text-primary ring-1 ring-primary/25 dark:bg-primary/15"
                        : "bg-muted text-subtle ring-1 ring-border dark:ring-white/[0.08]"
                    )}
                  >
                    {allowed ? "Access active" : "Limited access"}
                  </div>
                  <p className="text-[11px] leading-snug text-subtle sm:text-xs sm:leading-snug">
                    {allowed
                      ? "Trial or subscription is active. Billing and restore will connect here as production features ship."
                      : "Access is limited here—renew or start a trial when billing is connected."}
                  </p>
                  {row ? (
                    <ul className="space-y-1 rounded-md border border-border/70 bg-background/50 px-2.5 py-2 text-[10px] text-subtle dark:border-white/[0.08] dark:bg-yale/25 sm:text-[11px]">
                      {row.trial_expires_at ? (
                        <li className="flex justify-between gap-4">
                          <span className="text-subtle">Trial until</span>
                          <span className="font-medium tabular-nums text-foreground">{new Date(row.trial_expires_at).toLocaleString()}</span>
                        </li>
                      ) : null}
                      {row.subscription_expires_at ? (
                        <li className="flex justify-between gap-4">
                          <span className="text-subtle">Subscription until</span>
                          <span className="font-medium tabular-nums text-foreground">{new Date(row.subscription_expires_at).toLocaleString()}</span>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                  <p className="text-[10px] leading-snug text-subtle">
                    Restore purchases will refresh this row once store billing is wired up.
                  </p>
                </div>
              )}
            </SettingsCard>
          </div>

          <SettingsCard
            id="portfolio"
            icon={Briefcase}
            title="Portfolio"
            description="Cash, risk posture, profit targets, and locale fields used across recommendations."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block">
                  <FieldLabel>Cash balance</FieldLabel>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                    <input
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className={cn(inputClass, "min-w-0")}
                    />
                    <button
                      type="button"
                      onClick={saveCash}
                      className={appCtaButton("ui-hover-spotlight w-fit justify-self-start px-4 py-1.5 text-sm sm:justify-self-auto")}
                    >
                      Save cash
                    </button>
                  </div>
                </label>
              </div>

              <div className="self-start">
                <label className="block">
                  <FieldLabel>Risk appetite</FieldLabel>
                  <select
                    value={riskAppetite}
                    onChange={(e) => setSettings({ riskAppetite: e.target.value as "Low" | "Medium" | "High" })}
                    className={cn(inputClass, "cursor-pointer")}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </label>
              </div>

              <div className="self-start">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={limitWatchlistSize}
                    onChange={(e) => setSettings({ limitWatchlistSize: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Enforce ideal watchlist size</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">Aligns with strategy caps.</span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block">
                  <FieldLabel>ETF profit target (%)</FieldLabel>
                  <input
                    type="number"
                    value={etfProfitTarget}
                    onChange={(e) => setSettings({ etfProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <FieldLabel>Stock profit target (%)</FieldLabel>
                  <input
                    type="number"
                    value={stockProfitTarget}
                    onChange={(e) => setSettings({ stockProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="md:col-span-2 grid gap-2">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={useAISentimentForRecommendations}
                    onChange={(e) => setSettings({ useAISentimentForRecommendations: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Use AI sentiment gate</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">Matches the iOS BUY/ADD sentiment override.</span>
                  </span>
                </label>
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={useRSIGatingForRecommendations}
                    onChange={(e) => setSettings({ useRSIGatingForRecommendations: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Use RSI reversal gating</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">Applies the same RSI confirmation rules iOS uses for entries and trims.</span>
                  </span>
                </label>
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={sellOnlyLongTermQualified}
                    onChange={(e) => setSettings({ sellOnlyLongTermQualified: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Only sell long-term qualified lots</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">Matches the iOS long-term SELL/REDUCE restriction.</span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block">
                  <FieldLabel>Timezone</FieldLabel>
                  <input value={timezone} onChange={(e) => setSettings({ timezone: e.target.value })} className={inputClass} placeholder="e.g. America/New_York" />
                </label>
              </div>

              <div>
                <label className="block">
                  <FieldLabel>Region</FieldLabel>
                  <input value={region} onChange={(e) => setSettings({ region: e.target.value })} className={inputClass} placeholder="e.g. US" />
                </label>
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => recalc()}
                  className="ui-hover-pop inline-flex items-center gap-1.5 rounded-md border border-primary/35 px-3 py-1.5 text-sm font-medium text-foreground dark:border-primary/28"
                >
                  <RefreshCw className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  Re-run recommendations
                </button>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            id="data"
            icon={Database}
            title="Data & import"
            description="Refresh metadata and CSV formats. Destructive actions are isolated below."
          >
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-border/70 bg-background/40 px-2.5 py-2 dark:border-white/[0.08] dark:bg-yale/20">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-subtle">Last quote refresh</p>
                  <p className="mt-px text-xs font-medium leading-snug text-foreground">{lastRefreshAt ? new Date(lastRefreshAt).toLocaleString() : "—"}</p>
                </div>
                <p className="text-[11px] leading-snug text-subtle">
                  CSV formats:{" "}
                  <Link href="/csv-help" className="ui-hover-text font-medium text-primary underline-offset-2 hover:underline">
                    Import &amp; export help
                  </Link>
                </p>
              </div>
              <div className="flex flex-col rounded-md border border-error/30 bg-error-bg/80 p-2.5 dark:border-error/35 dark:bg-error-bg/50">
                <p className="text-xs font-semibold text-error">Danger zone</p>
                <p className="mt-0.5 text-[10px] leading-snug text-subtle">
                  Clears local portfolio in this browser. Cloud sync may repopulate when signed in.
                </p>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="ui-hover-surface mt-2 w-full rounded-md border border-error/45 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-error dark:border-error/40 dark:bg-yale/40"
                >
                  Reset local portfolio
                </button>
              </div>
            </div>
          </SettingsCard>
        </div>
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => resetAll()}
        title="Reset local portfolio?"
        description="This removes tracked symbols, trades, and local preferences in this browser. Sign in again or import CSV to rebuild."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
