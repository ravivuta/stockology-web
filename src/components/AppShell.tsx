"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, LayoutDashboard, ListOrdered, Newspaper, Settings, PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeAppPathname } from "@/lib/base-path";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSubscriptionGate, type SubRow } from "@/hooks/useSubscriptionGate";
import type { User } from "@supabase/supabase-js";
import Sidebar from "@/components/nav/Sidebar";
import { STOCKS_PM_ONBOARDING_USER_META_KEY } from "@/lib/onboarding-meta";
import { PageLoading } from "@/components/ui/PageLoading";
import { useHydrateTickerFundamentals } from "@/hooks/useHydrateTickerFundamentals";
import { isPaidSubscriptionTier } from "@/lib/subscription-state";
import { AppLogo } from "@/components/AppLogo";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/watchlist", label: "Watchlist", icon: ListOrdered },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function pageTitleFromPath(pathname: string) {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/portfolio") return "Portfolio";
  if (pathname === "/watchlist") return "Watchlist";
  if (pathname === "/news") return "News";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/help") return "Help";
  if (pathname === "/simulation") return "Simulation";
  if (pathname === "/optimization") return "Optimization";
  return "Stocks PM";
}

function MobileHeader({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <AppLogo size={30} rounded="rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">{pageTitleFromPath(pathname)}</p>
            <p className="text-[11px] text-subtle">Stocks PM</p>
          </div>
        </div>
        <Link
          href={pathname === "/settings" ? "/help" : "/settings"}
          className="ui-hover-pop inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-foreground shadow-sm"
          aria-label={pathname === "/settings" ? "Help" : "Settings"}
        >
          {pathname === "/settings" ? <HelpCircle className="h-4 w-4" aria-hidden /> : <Settings className="h-4 w-4" aria-hidden />}
        </Link>
      </div>
    </header>
  );
}

function MobileBottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/96 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.35)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-2">
        {MOBILE_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium",
                active ? "bg-primary/12 text-foreground" : "text-subtle"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function planFromSubscription(row: SubRow, allowed: boolean): { label: string; variant: "free" | "trial" | "pro" | "max" } {
  if (!allowed) return { label: "Free", variant: "free" };
  if (row?.billing_exempt) return { label: "Admin", variant: "max" };
  if (isPaidSubscriptionTier(row?.subscription_tier)) {
    const tier = row?.subscription_tier?.trim().toLowerCase();
    if (tier === "monthly") return { label: "Monthly", variant: "pro" };
    if (tier === "yearly") return { label: "Yearly", variant: "pro" };
    return { label: "Pro", variant: "pro" };
  }
  if (row?.trial_expires_at) return { label: "Trial", variant: "trial" };
  return { label: "Free", variant: "free" };
}

export function AppShell({
  user,
  dataUserId,
  children,
  serverSubscription,
  hasCloudPortfolio = false,
}: {
  user: User;
  /** `public.users.id` / snapshot owner: may differ from `user.id` when mobile used Google sub / Apple id. */
  dataUserId: string;
  children: React.ReactNode;
  serverSubscription: SubRow;
  /** True when Supabase has portfolio snapshots for this user (e.g. synced from iOS) — skip web onboarding. */
  hasCloudPortfolio?: boolean;
}) {
  const pathname = normalizeAppPathname(usePathname());
  const router = useRouter();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const localOnboardingDone = usePortfolioStore((s) => s.onboardingComplete);
  const { row, allowed, loading } = useSubscriptionGate(dataUserId, serverSubscription);
  const onExpand = useCallback(() => setSidebarExpanded(true), []);
  const onCollapse = useCallback(() => setSidebarExpanded(false), []);

  const serverOnboardingDone = user.user_metadata?.[STOCKS_PM_ONBOARDING_USER_META_KEY] === true;
  const onboardingDone = serverOnboardingDone || localOnboardingDone || hasCloudPortfolio;
  useHydrateTickerFundamentals({ enabled: allowed && onboardingDone });

  const metaDone = serverOnboardingDone;
  useEffect(() => {
    if (metaDone) return;
    const local = usePortfolioStore.getState().onboardingComplete;
    if (!local && !hasCloudPortfolio) return;
    void createClient()
      .auth.updateUser({ data: { [STOCKS_PM_ONBOARDING_USER_META_KEY]: true } })
      .then(() => router.refresh());
  }, [metaDone, user.id, hasCloudPortfolio, router]);

  useEffect(() => {
    if (!loading && !allowed && pathname !== "/settings") {
      router.replace("/settings");
      return;
    }
    if (pathname === "/onboarding" && onboardingDone) {
      router.replace("/dashboard");
    }
  }, [allowed, loading, pathname, onboardingDone, router]);

  useEffect(() => {
    if (!allowed) return;
    if (!onboardingDone && pathname !== "/onboarding") router.replace("/onboarding");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, onboardingDone, pathname]);

  useEffect(() => {
    if (!allowed || !onboardingDone) return;
    usePortfolioStore.getState().recalcMetrics();
  }, [allowed, onboardingDone]);

  if (!loading && !allowed && pathname !== "/settings") {
    return (
      <div className="app-interactive-ui min-h-dvh bg-background">
        <PageLoading message="Checking subscription…" compact />
      </div>
    );
  }

  if (!allowed && pathname === "/onboarding") {
    return (
      <div className="app-interactive-ui min-h-dvh bg-background">
        <PageLoading message="Redirecting to billing…" compact />
      </div>
    );
  }

  if (allowed && !onboardingDone && pathname !== "/onboarding") {
    return (
      <div className="app-interactive-ui min-h-dvh bg-background">
        <PageLoading message="Preparing your workspace…" compact />
      </div>
    );
  }

  const displayName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    "";
  const email = user.email ?? "";
  const { label: planLabel, variant: planVariant } = planFromSubscription(row ?? null, allowed);

  if (pathname === "/onboarding") {
    if (onboardingDone) {
      return (
        <div className="app-interactive-ui min-h-dvh bg-background">
          <PageLoading message="Redirecting…" compact />
        </div>
      );
    }
    return (
      <div className="app-interactive-ui min-h-screen min-h-dvh w-full bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="app-interactive-ui min-h-screen bg-background">
      <MobileHeader pathname={pathname} />
      <Sidebar
        isExpanded={sidebarExpanded}
        onExpand={onExpand}
        onCollapse={onCollapse}
        userDisplayName={displayName}
        userEmail={email}
        planLabel={planLabel}
        planVariant={planVariant}
      />
      <main className="app-shell-main">
        <div className="mx-auto w-full max-w-6xl pb-2">
          {children}
        </div>
      </main>
      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
