"use client";

import { usePathname } from "next/navigation";
import { AppShellContentSkeleton } from "@/components/route-loading/page-skeletons/app-generic";
import { CsvHelpPageSkeleton } from "@/components/route-loading/page-skeletons/csv-help";
import { DashboardPageSkeleton } from "@/components/route-loading/page-skeletons/dashboard";
import { HelpPageSkeleton } from "@/components/route-loading/page-skeletons/help";
import { NewsPageSkeleton } from "@/components/route-loading/page-skeletons/news";
import { OnboardingPageSkeleton } from "@/components/route-loading/page-skeletons/onboarding";
import { OptimizationPageSkeleton } from "@/components/route-loading/page-skeletons/optimization";
import { PortfolioPageSkeleton } from "@/components/route-loading/page-skeletons/portfolio";
import { PrivacyPageSkeleton } from "@/components/route-loading/page-skeletons/privacy";
import { SettingsPageSkeleton } from "@/components/route-loading/page-skeletons/settings";
import { SimulationPageSkeleton } from "@/components/route-loading/page-skeletons/simulation";
import { StockDetailPageSkeleton } from "@/components/route-loading/page-skeletons/stock-detail";
import { TermsPageSkeleton } from "@/components/route-loading/page-skeletons/terms";
import { WatchlistPageSkeleton } from "@/components/route-loading/page-skeletons/watchlist";

/**
 * Picks the same skeleton as each `(app)` route’s `loading.tsx`, keyed by the **current URL**.
 * Client-only pages often don’t suspend at nested segments, so `(app)/loading.tsx` can be the
 * boundary that actually runs — without this, everyone briefly saw the generic shell (felt like
 * “dashboard”) while chunks load.
 */
export function AppPathLoadingSkeleton() {
  const pathname = usePathname() ?? "";

  if (pathname.startsWith("/stock/")) {
    return <StockDetailPageSkeleton />;
  }

  switch (pathname) {
    case "/dashboard":
      return <DashboardPageSkeleton />;
    case "/settings":
    case "/profile":
      return <SettingsPageSkeleton />;
    case "/portfolio":
      return <PortfolioPageSkeleton />;
    case "/watchlist":
      return <WatchlistPageSkeleton />;
    case "/news":
      return <NewsPageSkeleton />;
    case "/simulation":
      return <SimulationPageSkeleton />;
    case "/optimization":
      return <OptimizationPageSkeleton />;
    case "/onboarding":
      return <OnboardingPageSkeleton />;
    case "/help":
      return <HelpPageSkeleton />;
    case "/csv-help":
      return <CsvHelpPageSkeleton />;
    case "/privacy":
      return <PrivacyPageSkeleton />;
    case "/terms":
      return <TermsPageSkeleton />;
    default:
      return <AppShellContentSkeleton />;
  }
}
