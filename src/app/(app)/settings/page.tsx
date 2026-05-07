"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  CreditCard,
  Palette,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { appCtaButton } from "@/lib/appCtaClasses";
import { recommendedWatchlistSize } from "@/lib/ios-recommendation";
import { formatCurrency } from "@/lib/numberFormat";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { isPaidSubscriptionTier } from "@/lib/subscription-state";
import { APP_MANAGED_TRIAL_LABEL } from "@/lib/trial-config";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
] as const;

const RISK_APPETITE_DETAILS: Record<"Low" | "Medium" | "High", string> = {
  Low: "Conservative. Holdings, ETFs, and large-cap stocks with roughly $100B+ market cap and 4.5+ analyst ratings.",
  Medium: "Balanced. Includes low-risk names plus large-cap stocks around $50B+ market cap with 4.0+ analyst ratings.",
  High: "Aggressive. Includes low and medium profiles plus smaller caps around $10B+ with 3.5+ analyst ratings or names showing 25%+ upside.",
};

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | undefined>();
  const { row, loading, allowed } = useSubscriptionGate(userId);
  const cashBalance = usePortfolioStore((s) => s.cashBalance);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const stockCount = usePortfolioStore((s) => s.stocks.length);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useAISentimentForRecommendations = usePortfolioStore((s) => s.useAISentimentForRecommendations);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const timezone = usePortfolioStore((s) => s.timezone);
  const region = usePortfolioStore((s) => s.region);
  const setSettings = usePortfolioStore((s) => s.setSettings);
  const resetAll = usePortfolioStore((s) => s.resetAll);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const [resetOpen, setResetOpen] = useState(false);
  const billingState = searchParams.get("billing");
  const billingDetail = searchParams.get("billing_detail");
  const idealWatchlistSize = recommendedWatchlistSize(portfolioSize);
  const hasPaidPlan = isPaidSubscriptionTier(row?.subscription_tier);
  const hasBillingExempt = row?.billing_exempt === true;

  function persistSettingsPatch(
    patch: Parameters<typeof setSettings>[0]
  ) {
    setSettings(patch);
    void flushCurrentPortfolioSnapshotNow(true);
  }

  async function handleResetConfirm() {
    resetAll();
    await flushCurrentPortfolioSnapshotNow(true, { allowEmptyHoldings: true });
    setResetOpen(false);
  }

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

  useEffect(() => {
    if (billingState === "success" && !loading && !allowed) {
      router.replace("/billing/refresh?next=/dashboard");
    }
  }, [allowed, billingState, loading, router]);

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
            {!loading && !allowed ? (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/12 px-3 py-2 text-[11px] leading-snug text-red-700 dark:text-red-200 sm:text-xs">
                <span className="font-semibold uppercase tracking-wide">Limited Access</span>{" "}
                Your account does not have an active trial or subscription, so navigation is locked to Settings until billing is activated.
              </div>
            ) : null}
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
              description="Choose light, dark, or auto mode for this device. Auto switches by time of day and your choice is remembered for future sessions."
            >
              <div className="flex flex-col gap-2">
                <ThemeToggle />
                <p className="text-[10px] leading-snug text-subtle">
                  Light mode keeps the brighter silver surface treatment. Dark mode keeps the deeper blue and black presentation used across Stocks PM.
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
                        : "bg-red-500/12 text-red-700 ring-1 ring-red-500/30 dark:bg-red-500/16 dark:text-red-200"
                    )}
                  >
                    {allowed ? "Access active" : "Limited Access"}
                  </div>
                  <p className="text-[11px] leading-snug text-subtle sm:text-xs sm:leading-snug">
                    {hasBillingExempt
                      ? "This account is marked billing-exempt. Access stays active and Stripe billing is bypassed."
                      : allowed
                      ? hasPaidPlan
                        ? "Your paid subscription is active from Stripe or a synced iOS subscription."
                        : "Your app-managed free trial is active. Subscribe from Stripe anytime without losing access."
                      : "You were redirected here because the rest of the app is locked until you start a subscription or an existing mobile subscription is synced."}
                  </p>
                  {billingState === "admin_access" ? (
                    <p className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-2 text-[11px] text-primary">
                      This account is billing-exempt, so Stripe billing management is not used.
                    </p>
                  ) : null}
                  {billingState === "success" ? (
                    <p className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-2 text-[11px] text-primary">
                      Checkout completed. If access does not update within a few seconds, refresh this page.
                    </p>
                  ) : null}
                  {billingState === "cancelled" ? (
                    <p className="rounded-md border border-border/70 bg-background/50 px-2.5 py-2 text-[11px] text-subtle">
                      Checkout was cancelled before the paid subscription started.
                    </p>
                  ) : null}
                  {billingState === "missing_customer" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      No Stripe customer record was found for this account yet. Start the paid subscription first.
                    </p>
                  ) : null}
                  {billingState === "missing_subscription" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Stripe billing was reached, but no subscription record could be found for this account yet. Try refresh billing status once more.
                    </p>
                  ) : null}
                  {billingState === "portal_unavailable" ? (
                    <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-200">
                      No Stripe-managed subscription was found for this account. If your access comes from the iOS app, manage billing in Apple subscriptions; otherwise start the Stripe subscription first.
                    </p>
                  ) : null}
                  {billingState === "portal_not_configured" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Stripe Billing Portal is not configured yet. Enable the customer portal and create a default configuration in Stripe Dashboard, then try again.
                    </p>
                  ) : null}
                  {billingState === "portal_env_missing" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Stripe secret key is missing on the server, so the billing portal cannot be opened.
                    </p>
                  ) : null}
                  {billingState === "portal_error" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Billing portal could not be opened due to a Stripe server error. Check the deployment logs and try again.
                    </p>
                  ) : null}
                  {billingState === "refresh_error" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Billing status could not be refreshed from Stripe. Check the detail below and deployment logs.
                    </p>
                  ) : null}
                  {billingState === "billing_env_missing" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Stripe secret key is missing on the server, so checkout cannot be started.
                    </p>
                  ) : null}
                  {billingState === "billing_price_missing" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      `STRIPE_PRICE_ID` is missing on the server, so checkout cannot be started.
                    </p>
                  ) : null}
                  {billingState === "billing_price_invalid" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      The configured Stripe price id is invalid for this environment. Check that the price exists and matches the same Stripe mode as the secret key.
                    </p>
                  ) : null}
                  {billingState === "billing_checkout_error" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Stripe Checkout could not be created. Check the Stripe product, recurring price, and customer configuration.
                    </p>
                  ) : null}
                  {billingState === "error" ? (
                    <p className="rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300 dark:text-red-200">
                      Billing could not be started. Check the Stripe environment variables and try again.
                    </p>
                  ) : null}
                  {billingDetail ? (
                    <p className="rounded-md border border-border/70 bg-background/50 px-2.5 py-2 font-mono text-[10px] leading-snug text-subtle dark:border-white/[0.08] dark:bg-yale/25 sm:text-[11px]">
                      {billingDetail}
                    </p>
                  ) : null}
                  {row ? (
                    <ul className="space-y-1 rounded-md border border-border/70 bg-background/50 px-2.5 py-2 text-[10px] text-subtle dark:border-white/[0.08] dark:bg-yale/25 sm:text-[11px]">
                      {row.subscription_tier ? (
                        <li className="flex justify-between gap-4">
                          <span className="text-subtle">Tier</span>
                          <span className="font-medium capitalize tabular-nums text-foreground">{row.subscription_tier}</span>
                        </li>
                      ) : null}
                      {row.is_active != null ? (
                        <li className="flex justify-between gap-4">
                          <span className="text-subtle">Active flag</span>
                          <span className="font-medium tabular-nums text-foreground">{row.is_active ? "Yes" : "No"}</span>
                        </li>
                      ) : null}
                      {row.billing_exempt === true ? (
                        <li className="flex justify-between gap-4">
                          <span className="text-subtle">Billing exempt</span>
                          <span className="font-medium tabular-nums text-foreground">Yes</span>
                        </li>
                      ) : null}
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
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!hasPaidPlan && !hasBillingExempt ? (
                      <Link
                        href="/billing/start?next=/settings"
                        className={appCtaButton("ui-hover-spotlight px-3 py-2 text-sm")}
                      >
                        Subscribe now
                      </Link>
                    ) : null}
                    {hasPaidPlan && !hasBillingExempt ? (
                      <Link
                        href="/billing/refresh?next=/settings"
                        className="ui-hover-pop rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                      >
                        Refresh billing status
                      </Link>
                    ) : null}
                    {hasPaidPlan && !hasBillingExempt ? (
                      <Link
                        href="/billing/portal"
                        className="ui-hover-pop rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                      >
                        Manage billing
                      </Link>
                    ) : null}
                  </div>
                  {!hasBillingExempt ? (
                    <p className="text-[10px] leading-snug text-subtle">
                      Website signup now grants a {APP_MANAGED_TRIAL_LABEL} app-managed trial with no credit card required. Stripe Checkout is only used when you choose to start a paid subscription.
                    </p>
                  ) : null}
                </div>
              )}
            </SettingsCard>
          </div>

          <SettingsCard
            id="portfolio"
            icon={Briefcase}
            title="Portfolio and Recommendations Settings"
            description="Recommendation filters, profit targets, and locale fields aligned with the Stocks PM decision logic."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="self-start">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={enableRiskFilter}
                    onChange={(e) => persistSettingsPatch({ enableRiskFilter: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Filter by risk appetite</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      When enabled, non-holdings are screened by market cap, analyst rating, and upside rules before they can qualify for recommendations.
                    </span>
                  </span>
                </label>
              </div>

              <div className="self-start">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={limitWatchlistSize}
                    onChange={(e) => persistSettingsPatch({ limitWatchlistSize: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Enforce ideal watchlist size</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      Uses portfolio size to shortlist top-scored stocks. Recommendations are limited to that shortlist. Current ideal size: {idealWatchlistSize} of {stockCount} tracked symbols.
                    </span>
                  </span>
                </label>
              </div>

              {enableRiskFilter ? (
                <div className="self-start">
                  <label className="block">
                    <FieldLabel>Investment risk appetite</FieldLabel>
                    <select
                      value={riskAppetite}
                      onChange={(e) => persistSettingsPatch({ riskAppetite: e.target.value as "Low" | "Medium" | "High" })}
                      className={cn(inputClass, "cursor-pointer")}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>
                  <p className="mt-1 text-[10px] leading-snug text-subtle">{RISK_APPETITE_DETAILS[riskAppetite]}</p>
                </div>
              ) : (
                <div className="self-start rounded-md border border-dashed border-border/80 bg-background/30 px-2.5 py-2 text-[10px] leading-snug text-subtle dark:border-white/[0.08] dark:bg-white/[0.02]">
                  Risk appetite selection is hidden until the filter is enabled, matching iOS behavior.
                </div>
              )}

              <div>
                <label className="block">
                  <FieldLabel>ETF profit target (%)</FieldLabel>
                  <input
                    type="number"
                    value={etfProfitTarget}
                    onChange={(e) => persistSettingsPatch({ etfProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <p className="mt-1 text-[10px] leading-snug text-subtle">
                  ETFs use this target directly. A SELL can trigger once ETF profit reaches this percentage.
                </p>
              </div>

              <div>
                <label className="block">
                  <FieldLabel>Stock profit target (%)</FieldLabel>
                  <input
                    type="number"
                    value={stockProfitTarget}
                    onChange={(e) => persistSettingsPatch({ stockProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <p className="mt-1 text-[10px] leading-snug text-subtle">
                  Stocks use this only as fallback when no Analyst Target (Median) price is available.
                </p>
              </div>

              <div className="md:col-span-2 grid gap-2">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={useAISentimentForRecommendations}
                    onChange={(e) => persistSettingsPatch({ useAISentimentForRecommendations: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Use AI sentiment gate</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      AI sentiment from the latest news digest can suppress BUY or ADD when sentiment is bearish. When disabled, AI data may still load but it does not block recommendations.
                    </span>
                  </span>
                </label>
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={useRSIGatingForRecommendations}
                    onChange={(e) => persistSettingsPatch({ useRSIGatingForRecommendations: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Use RSI reversal gating</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      RSI reversal confirmation can suppress BUY or ADD until oversold momentum reversal is confirmed. When disabled, RSI will not block recommendations.
                    </span>
                  </span>
                </label>
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={sellOnlyLongTermQualified}
                    onChange={(e) => persistSettingsPatch({ sellOnlyLongTermQualified: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Only sell long-term qualified lots</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      SELL and REDUCE stay blocked until holdings are older than 365 days, while retirement-account lots remain eligible regardless of holding period.
                    </span>
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
                  onClick={() => {
                    recalc();
                    void flushCurrentPortfolioSnapshotNow(true);
                  }}
                  className="ui-hover-pop inline-flex items-center gap-1.5 rounded-md border border-primary/35 px-3 py-1.5 text-sm font-medium text-foreground dark:border-primary/28"
                >
                  <RefreshCw className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  Re-run recommendations
                </button>
              </div>
              <div className="md:col-span-2">
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
            </div>
          </SettingsCard>
        </div>
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetConfirm}
        title="Reset local portfolio?"
        description="This removes tracked symbols, trades, and local preferences in this browser. Sign in again or import CSV to rebuild."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
