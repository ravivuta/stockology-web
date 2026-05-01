"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSubscriptionGate, type SubRow } from "@/hooks/useSubscriptionGate";
import type { User } from "@supabase/supabase-js";
import Sidebar from "@/components/nav/Sidebar";
import { STOCKS_PM_ONBOARDING_USER_META_KEY } from "@/lib/onboarding-meta";
import { PageLoading } from "@/components/ui/PageLoading";
import { useHydrateTickerFundamentals } from "@/hooks/useHydrateTickerFundamentals";

function planFromSubscription(row: SubRow, allowed: boolean): { label: string; variant: "free" | "trial" | "pro" | "max" } {
  const now = Date.now();
  if (!allowed) return { label: "Free", variant: "free" };
  const paid = row?.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : 0;
  const trial = row?.trial_expires_at ? new Date(row.trial_expires_at).getTime() : 0;
  if (paid && paid > now) return { label: "Pro", variant: "pro" };
  if (trial && trial > now) return { label: "Trial", variant: "trial" };
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
  const pathname = usePathname();
  const router = useRouter();
  useHydrateTickerFundamentals();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const localOnboardingDone = usePortfolioStore((s) => s.onboardingComplete);
  const { row, allowed, loading } = useSubscriptionGate(dataUserId, serverSubscription);
  const onExpand = useCallback(() => setSidebarExpanded(true), []);
  const onCollapse = useCallback(() => setSidebarExpanded(false), []);

  const serverOnboardingDone = user.user_metadata?.[STOCKS_PM_ONBOARDING_USER_META_KEY] === true;
  const onboardingDone = serverOnboardingDone || localOnboardingDone || hasCloudPortfolio;

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
    if (pathname === "/onboarding" && onboardingDone) {
      router.replace("/dashboard");
    }
  }, [pathname, onboardingDone, router]);

  useEffect(() => {
    if (!onboardingDone && pathname !== "/onboarding") router.replace("/onboarding");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingDone, pathname]);

  useEffect(() => {
    if (!loading && !allowed && pathname !== "/settings" && pathname !== "/onboarding") {
      router.replace("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allowed, pathname]);

  if (!onboardingDone && pathname !== "/onboarding") {
    return (
      <div className="app-interactive-ui min-h-dvh bg-background">
        <PageLoading message="Preparing your workspace…" compact />
      </div>
    );
  }

  if (!loading && !allowed && pathname !== "/settings") {
    return (
      <div className="app-interactive-ui min-h-dvh bg-background">
        <PageLoading message="Checking subscription…" compact />
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
