"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
    </div>
  );
}
