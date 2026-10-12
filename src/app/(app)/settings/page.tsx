"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  CreditCard,
  History,
  Loader2,
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
import { flushCurrentPortfolioSnapshotNow, deleteAllPortfolioSnapshots, setAccountDeletionBlocksSnapshotPush } from "@/lib/portfolio-snapshot-client";
import { wipePortfolioAfterAccountDeletion } from "@/lib/clear-portfolio-client-state";
import { deleteAllExternalCashFlows } from "@/lib/external-cash-flows";
import { saveGlobalSettingsForUser, loadGlobalSettingsForUser } from "@/lib/portfolio-cloud-sync";
import { isPaidSubscriptionTier, paidSubscriptionIsActive } from "@/lib/subscription-state";
import { hasPremiumFeatureAccess } from "@/lib/subscription-limits";
import { APP_MANAGED_TRIAL_LABEL } from "@/lib/trial-config";
import { cn } from "@/lib/utils";
import { fieldInputClass } from "@/lib/field-input";
import { withAppBasePath } from "@/lib/base-path";
import { parseCloudSnapshotForStore } from "@/lib/cloud-snapshot-hydration";
import { SettingsPageSkeleton } from "@/components/route-loading/page-skeletons/settings";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "subscription", label: "Subscription Plan", icon: CreditCard },
  { id: "portfolio", label: "Recommendation Filtering", icon: Briefcase },
] as const;

const TIMEZONES: Record<string, string> = {
  "America/New_York": "Eastern Time (ET)",
  "America/Chicago": "Central Time (CT)",
  "America/Denver": "Mountain Time (MT)",
  "America/Los_Angeles": "Pacific Time (PT)",
  "America/Anchorage": "Alaska Time (AKT)",
  "Pacific/Honolulu": "Hawaii Time (HT)",
  "Europe/London": "London (GMT/BST)",
  "Europe/Paris": "Paris (CET/CEST)",
  "Asia/Tokyo": "Tokyo (JST)",
  "Asia/Shanghai": "Shanghai (CST)",
  "Asia/Kolkata": "India (IST)",
  "Australia/Sydney": "Sydney (AEDT/AEST)",
};

const REGIONS: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "EU", name: "Eurozone" },
  { code: "JP", name: "Japan" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
];

const RISK_APPETITE_DETAILS: Record<"Low" | "Medium" | "High", string> = {
  Low: "Low Risk. Conservative: larger, higher-rated companies.",
  Medium: "Medium Risk. Balanced: includes Low Risk plus more qualified large caps.",
  High: "High Risk. Aggressive: widest universe, including smaller caps and higher-upside names.",
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
  return <span className="mb-0.5 block text-xs font-medium text-foreground">{children}</span>;
}

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | undefined>();
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const { row, loading, allowed } = useSubscriptionGate(userId);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const stockCount = usePortfolioStore((s) => s.stocks.length);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const etfProfitTarget = usePortfolioStore((s) => s.etfProfitTarget);
  const stockProfitTarget = usePortfolioStore((s) => s.stockProfitTarget);
  const useAISentimentForRecommendations = usePortfolioStore((s) => s.useAISentimentForRecommendations);
  const useRSIGatingForRecommendations = usePortfolioStore((s) => s.useRSIGatingForRecommendations);
  const rsiPeriodForRecommendations = usePortfolioStore((s) => s.rsiPeriodForRecommendations);
  const rsiOversoldThresholdForRecommendations = usePortfolioStore((s) => s.rsiOversoldThresholdForRecommendations);
  const rsiOverboughtThresholdForRecommendations = usePortfolioStore((s) => s.rsiOverboughtThresholdForRecommendations);
  const rsiHysteresisPointsForRecommendations = usePortfolioStore((s) => s.rsiHysteresisPointsForRecommendations);
  const rsiMinRisingDaysForRecommendations = usePortfolioStore((s) => s.rsiMinRisingDaysForRecommendations);
  const sellOnlyLongTermQualified = usePortfolioStore((s) => s.sellOnlyLongTermQualified);
  const traderModeEnabled = usePortfolioStore((s) => s.traderModeEnabled);
  const timezone = usePortfolioStore((s) => s.timezone);
  const region = usePortfolioStore((s) => s.region);
  const setSettings = usePortfolioStore((s) => s.setSettings);
  const resetAll = usePortfolioStore((s) => s.resetAll);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const markAllPendingOptimization = usePortfolioStore((s) => s.markAllPendingOptimization);

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const [currentTime, setCurrentTime] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [refreshChartOpen, setRefreshChartOpen] = useState(false);
  const [isRefreshingChart, setIsRefreshingChart] = useState(false);
  const [refreshChartSuccess, setRefreshChartSuccess] = useState(false);
  const [pendingOptOpen, setPendingOptOpen] = useState(false);
  const [pendingOptSuccessCount, setPendingOptSuccessCount] = useState<number | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Array<{
    id: number;
    et_calendar_date: string | null;
    holdings: unknown;
    cash_balance: number;
    total_portfolio_value: number;
    total_cost_basis: number | null;
    total_unrealized_gain: number | null;
  }>>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<typeof snapshots[0] | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [accountDeletedOpen, setAccountDeletedOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const deletedAccountSignOutStarted = useRef(false);
  const replaceFromCloudSync = usePortfolioStore((s) => s.replaceFromCloudSync);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const tick = () => {
      try {
        setCurrentTime(
          new Intl.DateTimeFormat(undefined, {
            timeZone: timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date())
        );
      } catch {
        setCurrentTime("");
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  const billingState = searchParams.get("billing");
  const billingDetail = searchParams.get("billing_detail");
  const idealWatchlistSize = recommendedWatchlistSize(portfolioSize);
  const hasPaidPlan = isPaidSubscriptionTier(row?.subscription_tier);
  const canDeleteAccount = !loading && !paidSubscriptionIsActive(row ?? null);
  const hasBillingExempt = row?.billing_exempt === true;
  const premiumFeatures = hasPremiumFeatureAccess(row ?? null, accountEmail);
  const [aiGateNotice, setAiGateNotice] = useState(false);

  function persistSettingsPatch(
    patch: Parameters<typeof setSettings>[0]
  ) {
    setSettings(patch);
    // Settings live in users.global_settings. Do not rewrite snapshot holdings.
    if (userId) {
      const supabase = supabaseRef.current;
      const store = usePortfolioStore.getState();
      void saveGlobalSettingsForUser(supabase, userId, {
        etfProfitTarget: "etfProfitTarget" in patch ? patch.etfProfitTarget : store.etfProfitTarget,
        stockProfitTarget: "stockProfitTarget" in patch ? patch.stockProfitTarget : store.stockProfitTarget,
        riskAppetite: "riskAppetite" in patch ? patch.riskAppetite : store.riskAppetite,
        enableRiskFilter: "enableRiskFilter" in patch ? patch.enableRiskFilter : store.enableRiskFilter,
        useAISentiment: "useAISentimentForRecommendations" in patch ? patch.useAISentimentForRecommendations : store.useAISentimentForRecommendations,
        useRSIGating: "useRSIGatingForRecommendations" in patch ? patch.useRSIGatingForRecommendations : store.useRSIGatingForRecommendations,
        rsiPeriod: "rsiPeriodForRecommendations" in patch ? patch.rsiPeriodForRecommendations : store.rsiPeriodForRecommendations,
        rsiOversoldThreshold: "rsiOversoldThresholdForRecommendations" in patch ? patch.rsiOversoldThresholdForRecommendations : store.rsiOversoldThresholdForRecommendations,
        rsiOverboughtThreshold: "rsiOverboughtThresholdForRecommendations" in patch ? patch.rsiOverboughtThresholdForRecommendations : store.rsiOverboughtThresholdForRecommendations,
        rsiHysteresisPoints: "rsiHysteresisPointsForRecommendations" in patch ? patch.rsiHysteresisPointsForRecommendations : store.rsiHysteresisPointsForRecommendations,
        rsiMinRisingDays: "rsiMinRisingDaysForRecommendations" in patch ? patch.rsiMinRisingDaysForRecommendations : store.rsiMinRisingDaysForRecommendations,
        sellOnlyLongTerm: "sellOnlyLongTermQualified" in patch ? patch.sellOnlyLongTermQualified : store.sellOnlyLongTermQualified,
        traderModeEnabled: "traderModeEnabled" in patch ? patch.traderModeEnabled : store.traderModeEnabled,
        limitWatchlistSize: "limitWatchlistSize" in patch ? patch.limitWatchlistSize : store.limitWatchlistSize,
        timezone: "timezone" in patch ? patch.timezone : store.timezone,
        region: "region" in patch ? patch.region : store.region,
      });
    }
  }

  async function handleRefreshChartBaseline() {
    setIsRefreshingChart(true);
    try {
      // Delete all snapshot history so the chart starts fresh from today's
      // current portfolio values. Holdings and watchlist are NOT touched.
      await deleteAllPortfolioSnapshots();
      await flushCurrentPortfolioSnapshotNow(true, { allowEmptyHoldings: false });
      await deleteAllExternalCashFlows();
      // Clear localStorage dashboard chart caches so stale lines don't persist.
      try {
        localStorage.removeItem("dash_chart_cloudPts");
        localStorage.removeItem("dash_chart_spySeries");
        localStorage.removeItem("dash_chart_extFlows");
      } catch { /* ignore */ }
    } finally {
      setIsRefreshingChart(false);
      setRefreshChartOpen(false);
      setRefreshChartSuccess(true);
    }
  }

  function handleMarkPendingOptimization() {
    const marked = markAllPendingOptimization();
    setPendingOptOpen(false);
    setPendingOptSuccessCount(marked);
  }

  async function handleResetConfirm() {
    // Preserve CSV mapping presets/memory so reset only clears portfolio state.
    const mappingPresetsKey = "stocks-pm-csv-mapping-presets:v1";
    const mappingMemoryKey = "stocks-pm-csv-mapping-memory:v1";
    const preservedMappingPresets = typeof window !== "undefined" ? localStorage.getItem(mappingPresetsKey) : null;
    const preservedMappingMemory = typeof window !== "undefined" ? localStorage.getItem(mappingMemoryKey) : null;

    const stateBeforeReset = usePortfolioStore.getState();
    const watchlistBeforeReset = stateBeforeReset.stocks.filter((s) => s.quantity === 0);
    console.log(`🔄 Resetting portfolio... Preserving ${watchlistBeforeReset.length} watchlist-only stocks`);
    
    resetAll();
    
    // Verify watchlist was preserved
    const stateAfterReset = usePortfolioStore.getState();
    const watchlistAfterReset = stateAfterReset.stocks.filter((s) => s.quantity === 0);
    console.log(`✅ Reset complete. Watchlist preserved: ${watchlistAfterReset.map((s) => s.symbol).join(", ") || "none"}`);
    
    // Clear dashboard chart localStorage caches so the home chart doesn't render
    // stale pre-reset data (which would cause SPY line to appear outside the new domain).
    try {
      localStorage.removeItem("dash_chart_cloudPts");
      localStorage.removeItem("dash_chart_extFlows");
    } catch { /* ignore */ }
    // Delete snapshot history first so the chart starts fresh, then push the
    // new snapshot as the single starting point. Watchlist will be preserved
    // since resetAll() only clears holdings (quantity > 0), not watchlist (quantity === 0).
    await deleteAllPortfolioSnapshots();
    await flushCurrentPortfolioSnapshotNow(true, { allowEmptyHoldings: true });
    // Clear all cash flow records so subsequent cash edits after reimport don't
    // get counted as external deposits and skew the flow-adjusted SPY comparison chart.
    await deleteAllExternalCashFlows();

    // Restore preserved CSV mapping presets/memory after reset.
    try {
      if (preservedMappingPresets != null) localStorage.setItem(mappingPresetsKey, preservedMappingPresets);
      if (preservedMappingMemory != null) localStorage.setItem(mappingMemoryKey, preservedMappingMemory);
    } catch {
      // ignore storage failures
    }

    setResetOpen(false);
  }

  async function handleOpenRestore() {
    setSnapshotsLoading(true);
    setRestoreOpen(true);
    try {
      const supabase = supabaseRef.current;
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const resolved = await syncStocksPmAuthUser(supabase, uid);
      if (!resolved) return;
      // Fetch last 30 days, take latest 7
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: rows } = await supabase.rpc("get_portfolio_snapshots", {
        p_user_id: resolved,
        p_start_et_date: since.toISOString().slice(0, 10),
      });
      const all = Array.isArray(rows) ? rows : [];
      // Sort newest-first and take 7
      const sorted = [...all]
        .sort((a, b) => (b.et_calendar_date ?? "").localeCompare(a.et_calendar_date ?? ""))
        .slice(0, 7);
      setSnapshots(sorted);
    } finally {
      setSnapshotsLoading(false);
    }
  }

  async function handleRestoreConfirm() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const parsed = parseCloudSnapshotForStore({
        holdings: restoreTarget.holdings,
        cash_balance: restoreTarget.cash_balance,
      });
      replaceFromCloudSync({
        ...parsed,
        onboardingComplete:
          parsed.cashBalance > 0 ||
          Object.values(parsed.fixedIncomeByAccount).some((value) => Number(value) > 0.005) ||
          parsed.stocks.length > 0,
      });
      // Push restored state as today's snapshot so other devices sync
      await flushCurrentPortfolioSnapshotNow(true);
    } finally {
      setRestoring(false);
      setRestoreConfirmOpen(false);
      setRestoreTarget(null);
      setRestoreOpen(false);
    }
  }

  function formatSnapshotDate(etDate: string | null): string {
    if (!etDate) return "Unknown date";
    const d = new Date(etDate + "T12:00:00-05:00");
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
    if (etDate === fmt(today)) return "Today";
    if (etDate === fmt(yesterday)) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  const deletedAccountMessage =
    "Holdings, watchlist, cash, fixed income, and saved snapshots are deleted. Signing in again with the same Apple or Google account starts an empty account. An App Store subscription, if you have one, stays with Apple until you cancel it in Settings, Apple ID, Subscriptions.";

  async function handleDeleteAccount() {
    if (!canDeleteAccount) {
      setDeleteAccountError("Cancel your subscription before deleting this account.");
      setDeleteAccountOpen(false);
      return;
    }
    setDeletingAccount(true);
    setDeleteAccountError(null);
    setAccountDeletionBlocksSnapshotPush(true);
    try {
      const supabase = supabaseRef.current;
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? "";
      const id = userId || data.user?.id || "";
      if (!id) throw new Error("Could not find this account.");
      const { error } = await supabase.rpc("delete_stocks_pm_account", {
        p_user_id: id,
        p_email: email,
      });
      if (error) {
        if (error.message.includes("active_subscription")) {
          throw new Error("Cancel your subscription before deleting this account.");
        }
        throw new Error(error.message);
      }
      wipePortfolioAfterAccountDeletion();
      setDeleteAccountOpen(false);
      setAccountDeletedOpen(true);
    } catch (err) {
      setAccountDeletionBlocksSnapshotPush(false);
      setDeleteAccountError(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleteAccountOpen(false);
    } finally {
      setDeletingAccount(false);
    }
  }

  async function finishDeletedAccountSignOut() {
    if (deletedAccountSignOutStarted.current) return;
    deletedAccountSignOutStarted.current = true;
    setAccountDeletedOpen(false);
    await supabaseRef.current.auth.signOut();
    setAccountDeletionBlocksSnapshotPush(false);
    router.replace("/");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      if (!cancelled) setAccountEmail(data.user?.email ?? null);
      const resolved = await syncStocksPmAuthUser(supabase, uid);
      if (!cancelled) setUserId(resolved);
      if (!resolved || cancelled) return;
      // Load cloud settings and apply to store on page open
      const cloudSettings = await loadGlobalSettingsForUser(supabase, resolved);
      if (cloudSettings && !cancelled) {
        const combinedAiSetting =
          cloudSettings.useAISentiment === true || cloudSettings.useMarketRegimeCashTilt === true
            ? true
            : cloudSettings.useAISentiment === false
              ? false
              : undefined;
        setSettings({
          ...(cloudSettings.etfProfitTarget != null && cloudSettings.etfProfitTarget > 0 ? { etfProfitTarget: cloudSettings.etfProfitTarget } : {}),
          ...(cloudSettings.stockProfitTarget != null && cloudSettings.stockProfitTarget > 0 ? { stockProfitTarget: cloudSettings.stockProfitTarget } : {}),
          ...(cloudSettings.riskAppetite != null ? { riskAppetite: cloudSettings.riskAppetite } : {}),
          ...(cloudSettings.enableRiskFilter != null ? { enableRiskFilter: cloudSettings.enableRiskFilter } : {}),
          ...(combinedAiSetting != null ? { useAISentimentForRecommendations: combinedAiSetting } : {}),
          ...(cloudSettings.useRSIGating != null ? { useRSIGatingForRecommendations: cloudSettings.useRSIGating } : {}),
          ...(cloudSettings.rsiPeriod != null ? { rsiPeriodForRecommendations: cloudSettings.rsiPeriod } : {}),
          ...(cloudSettings.rsiOversoldThreshold != null ? { rsiOversoldThresholdForRecommendations: cloudSettings.rsiOversoldThreshold } : {}),
          ...(cloudSettings.rsiOverboughtThreshold != null ? { rsiOverboughtThresholdForRecommendations: cloudSettings.rsiOverboughtThreshold } : {}),
          ...(cloudSettings.rsiHysteresisPoints != null ? { rsiHysteresisPointsForRecommendations: cloudSettings.rsiHysteresisPoints } : {}),
          ...(cloudSettings.rsiMinRisingDays != null ? { rsiMinRisingDaysForRecommendations: cloudSettings.rsiMinRisingDays } : {}),
          ...(cloudSettings.sellOnlyLongTerm != null ? { sellOnlyLongTermQualified: cloudSettings.sellOnlyLongTerm } : {}),
          ...(cloudSettings.traderModeEnabled != null ? { traderModeEnabled: cloudSettings.traderModeEnabled } : {}),
          ...((combinedAiSetting === true || cloudSettings.useRSIGating === true) ? { traderModeEnabled: true } : {}),
          ...(cloudSettings.traderModeEnabled === false
            ? { traderModeEnabled: false, useAISentimentForRecommendations: false, useRSIGatingForRecommendations: false }
            : {}),
          ...(cloudSettings.limitWatchlistSize != null ? { limitWatchlistSize: cloudSettings.limitWatchlistSize } : {}),
          ...(cloudSettings.timezone ? { timezone: cloudSettings.timezone } : {}),
          ...(cloudSettings.region ? { region: cloudSettings.region } : {}),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (billingState === "success" && !loading && !allowed) {
      router.replace(withAppBasePath("/billing/refresh?next=/dashboard"));
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

  const inputClass = cn(
    fieldInputClass,
    "w-full rounded-md px-2.5 py-1.5 text-sm transition-[border-color,box-shadow]"
  );

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
            >
              <div className="flex flex-col gap-2">
                <ThemeToggle />
                <p className="text-[10px] leading-snug text-subtle">
                  Auto follows your system appearance. Dark mode keeps blue/black gradients. Light mode uses silver/gray gradients.
                </p>
              </div>
            </SettingsCard>

            <SettingsCard
              id="subscription"
              icon={CreditCard}
              title="Subscription Plan"
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
                        ? "Your website subscription is active."
                        : "Your website trial is active. Subscribe on the website when you want to keep access."
                      : "The rest of the website stays locked until you subscribe here. An App Store subscription covers the iOS app only."}
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
                      No website subscription was found for this account. Subscribe here to use Stocks PM on the web. An App Store subscription covers the iOS app only.
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
                        href={withAppBasePath("/billing/start?next=/settings")}
                        className={appCtaButton("ui-hover-spotlight px-3 py-2 text-sm")}
                      >
                        Subscribe now
                      </Link>
                    ) : null}
                    {hasPaidPlan && !hasBillingExempt ? (
                      <Link
                        href={withAppBasePath("/billing/refresh?next=/settings")}
                        className="ui-hover-pop rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                      >
                        Refresh billing status
                      </Link>
                    ) : null}
                    {hasPaidPlan && !hasBillingExempt ? (
                      <Link
                        href={withAppBasePath("/billing/portal")}
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
                  {deleteAccountError ? <p className="text-[11px] leading-snug text-error">{deleteAccountError}</p> : null}
                  {canDeleteAccount ? (
                    <button
                      type="button"
                      onClick={() => setDeleteAccountOpen(true)}
                      className="ui-hover-pop w-fit rounded-lg border border-error/45 px-3 py-2 text-sm font-medium text-error"
                    >
                      Delete Account
                    </button>
                  ) : null}
                </div>
              )}
            </SettingsCard>
          </div>

          <SettingsCard
            id="portfolio"
            icon={Briefcase}
            title="Recommendation Filtering"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="self-start">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={limitWatchlistSize}
                    onChange={(e) => persistSettingsPatch({ limitWatchlistSize: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Shortlist & Limit stocks for Portfolio size</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      Uses your portfolio size to set an ideal shortlist. BUY/ADD are limited to top-scored names (plus ETFs). Holdings outside the shortlist can still REDUCE/SELL. Current ideal watchlist size: {idealWatchlistSize} of {stockCount} stocks.
                    </span>
                  </span>
                </label>
              </div>

              <div className="self-start">
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={enableRiskFilter}
                    onChange={(e) => persistSettingsPatch({ enableRiskFilter: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Shortlist by Risk Appetite</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      Low Risk. Conservative: larger, higher-rated companies. Medium Risk. Balanced: includes Low Risk plus more qualified large caps. High Risk. Aggressive: widest universe, including smaller caps and higher-upside names.
                    </span>
                  </span>
                </label>
              </div>

              {enableRiskFilter ? (
                <div className="self-start">
                  <label className="block">
                    <FieldLabel>Investment Risk Appetite</FieldLabel>
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
              ) : null}

              <div className="md:col-span-2 grid gap-2">
                <div className="rounded-md border border-border/80 bg-background/40 px-2.5 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-foreground">Recommendation mode</span>
                    <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Recommendation mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!traderModeEnabled}
                        onClick={() => {
                          setAiGateNotice(false);
                          persistSettingsPatch({
                            traderModeEnabled: false,
                            useAISentimentForRecommendations: false,
                            useRSIGatingForRecommendations: false,
                          });
                        }}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${!traderModeEnabled ? "bg-primary text-primary-foreground" : "text-subtle"}`}
                      >
                        Long-term
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={traderModeEnabled}
                        onClick={() => persistSettingsPatch({ traderModeEnabled: true })}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${traderModeEnabled ? "bg-primary text-primary-foreground" : "text-subtle"}`}
                      >
                        Active
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-subtle">
                    {traderModeEnabled
                      ? "Active mode: enables RSI and AI guidance. SELL can trigger when RSI is overbought with low upside (<10%), or when score/RSI/AI are all weak with low upside (<15%)."
                      : "Long-term mode: holds until analyst target. RSI and AI guidance are turned off to avoid conflicts."}
                  </p>
                </div>

                {traderModeEnabled ? (
                  <>
                    <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                        checked={useAISentimentForRecommendations && premiumFeatures}
                        onChange={(e) => {
                          if (e.target.checked && !premiumFeatures) {
                            setAiGateNotice(true);
                            return;
                          }
                          setAiGateNotice(false);
                          persistSettingsPatch({ useAISentimentForRecommendations: e.target.checked });
                        }}
                      />
                      <span>
                        <span className="block text-[12px] font-medium leading-snug text-foreground">
                          Use AI to guide recommendations
                          {!premiumFeatures ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Premium</span> : null}
                        </span>
                        <span className="mt-px block text-[10px] leading-snug text-subtle">
                          Premium. Uses stock-specific AI news digest scores and macroeconomic market-outlook factors to pause buys and suggest cash-building when risk rises. The Home outlook icon appears only when this is on. Scores may still be visible without changing recommendations.
                        </span>
                      </span>
                    </label>
                    {aiGateNotice && !premiumFeatures ? (
                      <p className="text-[10px] leading-snug text-subtle">
                        Premium — AI can slow new buys and guide cash-equivalent-building steps when the outlook is weak.{" "}
                        <Link href={withAppBasePath("/billing/start?next=/settings")} className="font-semibold text-primary underline-offset-2 hover:underline">
                          Subscribe
                        </Link>
                      </p>
                    ) : null}
                    <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                        checked={useRSIGatingForRecommendations}
                        onChange={(e) => persistSettingsPatch({ useRSIGatingForRecommendations: e.target.checked })}
                      />
                      <span>
                        <span className="block text-[12px] font-medium leading-snug text-foreground">Use RSI signals for buy/add/sell timing</span>
                        <span className="mt-px block text-[10px] leading-snug text-subtle">
                          RSI does not block the first BUY. It can pause ADD when position size is already above Stock Limit, and it can delay SELL until overbought RSI starts reversing. Off = no RSI impact on recommendations.
                        </span>
                      </span>
                    </label>
                    {useRSIGatingForRecommendations ? (
                      <div className="grid gap-2 rounded-md border border-border/80 bg-background/40 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.03] sm:grid-cols-2">
                        <label className="block">
                          <FieldLabel>RSI lookback period</FieldLabel>
                          <input
                            type="number"
                            min={2}
                            max={30}
                            value={rsiPeriodForRecommendations}
                            onChange={(e) => persistSettingsPatch({ rsiPeriodForRecommendations: Math.max(2, Math.min(30, Number(e.target.value) || 14)) })}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <FieldLabel>Buy trigger threshold (RSI oversold)</FieldLabel>
                          <input
                            type="number"
                            min={10}
                            max={50}
                            value={rsiOversoldThresholdForRecommendations}
                            onChange={(e) => persistSettingsPatch({ rsiOversoldThresholdForRecommendations: Math.max(10, Math.min(50, Number(e.target.value) || 30)) })}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <FieldLabel>Sell trigger threshold (RSI overbought)</FieldLabel>
                          <input
                            type="number"
                            min={50}
                            max={90}
                            value={rsiOverboughtThresholdForRecommendations}
                            onChange={(e) => persistSettingsPatch({ rsiOverboughtThresholdForRecommendations: Math.max(50, Math.min(90, Number(e.target.value) || 70)) })}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <FieldLabel>Signal buffer (RSI points)</FieldLabel>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={rsiHysteresisPointsForRecommendations}
                            onChange={(e) => persistSettingsPatch({ rsiHysteresisPointsForRecommendations: Math.max(0, Math.min(20, Number(e.target.value) || 5)) })}
                            className={inputClass}
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <FieldLabel>Min rising days</FieldLabel>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={rsiMinRisingDaysForRecommendations}
                            onChange={(e) => persistSettingsPatch({ rsiMinRisingDaysForRecommendations: Math.max(1, Math.min(5, Number(e.target.value) || 2)) })}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={sellOnlyLongTermQualified}
                    onChange={(e) => persistSettingsPatch({ sellOnlyLongTermQualified: e.target.checked })}
                  />
                  <span>
                    <span className="block text-[12px] font-medium leading-snug text-foreground">Tax consideration</span>
                    <span className="mt-px block text-[10px] leading-snug text-subtle">
                      Avoids SELL on short-term taxable lots (&lt;365 days). Retirement accounts are not affected. REDUCE can still appear when long-term, retirement, or loss lots can cover the trim.
                    </span>
                  </span>
                </label>
              </div>

              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-foreground">My Profit Target</p>
              </div>
              <div>
                <label className="block">
                  <FieldLabel>ETF Profit Target</FieldLabel>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    step={5}
                    value={etfProfitTarget}
                    onChange={(e) => persistSettingsPatch({ etfProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <p className="mt-1 text-[10px] leading-snug text-subtle">Triggers SELL when ETF gain reaches this %.</p>
              </div>
              <div>
                <label className="block">
                  <FieldLabel>Stock Profit Target (Fallback)</FieldLabel>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    step={5}
                    value={stockProfitTarget}
                    onChange={(e) => persistSettingsPatch({ stockProfitTarget: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <p className="mt-1 text-[10px] leading-snug text-subtle">Used only when an analyst target is unavailable.</p>
              </div>

              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-foreground">Timezone</p>
              </div>
              <div>
                <label className="block">
                  <FieldLabel>Timezone</FieldLabel>
                  <select
                    value={timezone}
                    onChange={(e) => persistSettingsPatch({ timezone: e.target.value })}
                    className={cn(inputClass, "cursor-pointer")}
                  >
                    {!TIMEZONES[timezone] ? <option value={timezone}>{timezone}</option> : null}
                    {Object.keys(TIMEZONES).sort().map((id) => (
                      <option key={id} value={id}>{TIMEZONES[id]}</option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-[10px] leading-snug text-subtle">Current Time: {currentTime || "—"}</p>
              </div>

              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-foreground">Region</p>
              </div>
              <div>
                <label className="block">
                  <FieldLabel>Country/Region</FieldLabel>
                  <select
                    value={region}
                    onChange={(e) => persistSettingsPatch({ region: e.target.value })}
                    className={cn(inputClass, "cursor-pointer")}
                  >
                    {!REGIONS.some((item) => item.code === region) ? <option value={region}>{region}</option> : null}
                    {REGIONS.map((item) => (
                      <option key={item.code} value={item.code}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    recalc();
                  }}
                  className="ui-hover-pop inline-flex items-center gap-1.5 rounded-md border border-primary/35 px-3 py-1.5 text-sm font-medium text-foreground dark:border-primary/28"
                >
                  <RefreshCw className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  Re-run recommendations
                </button>
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-col rounded-md border border-error/30 bg-error-bg/80 p-2.5 dark:border-error/35 dark:bg-error-bg/50">
                <p className="text-[10px] leading-snug text-error/80">
                  Re-optimize on Next Refresh marks every tracked stock pendingOptimization without changing cash. The next app refresh will re-grid SMA and factor. Reset Chart Baseline clears old snapshot history and starts fresh from today&apos;s values. Holdings and watchlist are preserved. Restore rolls back to any of your last 7 saved snapshots. Reset permanently deletes all data.
                </p>
                {refreshChartSuccess && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 text-xs text-green-700 dark:border-green-400/25 dark:text-green-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Chart History Cleared. Your performance chart has been reset. It will now rebuild from today&apos;s portfolio values as a new baseline.</span>
                    <button type="button" onClick={() => setRefreshChartSuccess(false)} className="ml-auto shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">✕</button>
                  </div>
                )}
                {pendingOptSuccessCount != null && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-2 text-xs text-green-700 dark:border-green-400/25 dark:text-green-400">
                    <span>Marked for Optimization. {pendingOptSuccessCount} stocks will be optimized on the next refresh.</span>
                    <button type="button" onClick={() => setPendingOptSuccessCount(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">Dismiss</button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleOpenRestore()}
                  className="ui-hover-surface mt-2 w-full rounded-md border border-primary/35 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground dark:border-primary/28 dark:bg-yale/40 inline-flex items-center justify-center gap-1.5"
                >
                  <History className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  Restore from Backup
                </button>
                <button
                  type="button"
                  disabled={isRefreshingChart}
                  onClick={() => setRefreshChartOpen(true)}
                  className="ui-hover-surface mt-1.5 w-full rounded-md border border-primary/35 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground dark:border-primary/28 dark:bg-yale/40 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isRefreshingChart ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  )}
                  Reset Chart Baseline
                </button>
                <button
                  type="button"
                  disabled={stockCount === 0}
                  onClick={() => setPendingOptOpen(true)}
                  className="ui-hover-surface mt-1.5 w-full rounded-md border border-primary/35 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground dark:border-primary/28 dark:bg-yale/40 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  Re-optimize on Next Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="ui-hover-surface mt-1.5 w-full rounded-md border border-error/45 bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-error dark:border-error/40 dark:bg-yale/40"
                >
                  Reset App Data
                </button>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>
      </div>

      <ConfirmModal
        open={deleteAccountOpen}
        onClose={() => {
          if (!deletingAccount) setDeleteAccountOpen(false);
        }}
        onConfirm={() => {
          void handleDeleteAccount();
        }}
        title="Delete Account"
        description="This deletes your Stocks PM holdings, watchlist, cash, fixed income, and saved snapshots. This cannot be undone."
        confirmLabel={deletingAccount ? "Deleting..." : "Delete Account"}
        cancelLabel="Cancel"
        variant="danger"
      />

      <ConfirmModal
        open={accountDeletedOpen}
        onClose={() => {
          void finishDeletedAccountSignOut();
        }}
        onConfirm={() => {
          void finishDeletedAccountSignOut();
        }}
        title="Account data deleted"
        description={deletedAccountMessage}
        confirmLabel="OK"
        cancelLabel="OK"
        variant="default"
      />

      <ConfirmModal
        open={refreshChartOpen}
        onClose={() => setRefreshChartOpen(false)}
        onConfirm={handleRefreshChartBaseline}
        title="Clear Chart History?"
        description="Your entire performance chart history will be permanently deleted and restarted from today's values. Will be deleted: all chart snapshot history and cash flow records. Will NOT be affected: your stocks and holdings, watchlist, and trade history."
        confirmLabel="Yes, Clear History"
        cancelLabel="Cancel"
        variant="default"
      />

      <ConfirmModal
        open={pendingOptOpen}
        onClose={() => setPendingOptOpen(false)}
        onConfirm={handleMarkPendingOptimization}
        title="Re-optimize on Next Refresh?"
        description="All tracked stocks will be marked so the next refresh runs auto-optimization. Cash, holdings, and current SMA/factor values are not changed."
        confirmLabel="Mark for Optimization"
        cancelLabel="Cancel"
        variant="default"
      />

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetConfirm}
        title="Reset All App Data"
        description="This will permanently delete all stocks, holdings, historical data, portfolio metrics, and saved settings. This action cannot be undone."
        confirmLabel="Reset Everything"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Restore from backup modal */}
      {restoreOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !restoring && setRestoreOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-elevated shadow-2xl sm:rounded-2xl dark:border-white/[0.1]">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 dark:border-white/[0.07]">
              <h3 className="text-sm font-semibold text-foreground">Restore Portfolio</h3>
              <button
                onClick={() => !restoring && setRestoreOpen(false)}
                className="rounded-md p-1 text-subtle hover:bg-surface-hover"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {snapshotsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-subtle text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading snapshots…
                </div>
              ) : snapshots.length === 0 ? (
                <p className="py-8 text-center text-sm text-subtle">No saved snapshots found. Snapshots are saved automatically when your portfolio changes.</p>
              ) : (
                <ul className="divide-y divide-border/50 dark:divide-white/[0.06]">
                  {snapshots.map((s) => (
                    <li key={s.id} className="py-3">
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={() => { setRestoreTarget(s); setRestoreConfirmOpen(true); }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{formatSnapshotDate(s.et_calendar_date)}</p>
                            <p className="mt-0.5 text-[11px] text-subtle">
                              {s.holdings && Array.isArray(s.holdings)
                                ? `${(s.holdings as Array<{quantity?: number}>).filter(h => (h.quantity ?? 0) > 0).length} positions · ${(s.holdings as Array<{quantity?: number}>).filter(h => (h.quantity ?? 0) === 0).length} watchlist`
                                : "—"}
                              {" · "}{formatCurrency(s.cash_balance)} cash
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(s.total_portfolio_value)}</p>
                            <p className="text-[10px] text-subtle">total value</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 px-4 py-3 text-[10px] text-subtle dark:border-white/[0.07]">
              Restoring replaces your current portfolio with the selected snapshot and saves it as today&apos;s version.
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={restoreConfirmOpen}
        onClose={() => { setRestoreConfirmOpen(false); setRestoreTarget(null); }}
        onConfirm={() => void handleRestoreConfirm()}
        title="Restore this snapshot?"
        description={`This will replace your current portfolio with the ${formatSnapshotDate(restoreTarget?.et_calendar_date ?? null)} snapshot. Your current state will be overwritten.`}
        confirmLabel={restoring ? "Restoring…" : "Restore"}
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsInner />
    </Suspense>
  );
}
