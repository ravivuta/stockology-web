"use client";

import { AppPathLoadingSkeleton } from "@/components/route-loading/AppPathLoadingSkeleton";

export { AuthLoginPageSkeleton, AuthRouteLoadingSkeleton, AuthSignupPageSkeleton } from "@/components/route-loading/page-skeletons/auth-oauth-shell";
export { CsvHelpPageSkeleton } from "@/components/route-loading/page-skeletons/csv-help";
export { DashboardPageSkeleton } from "@/components/route-loading/page-skeletons/dashboard";
export { HelpPageSkeleton } from "@/components/route-loading/page-skeletons/help";
export { NewsPageSkeleton, NewsPageSkeleton as NewsRouteSkeleton } from "@/components/route-loading/page-skeletons/news";
export {
  OnboardingPageSkeleton,
  OnboardingPageSkeleton as OnboardingRouteSkeleton,
} from "@/components/route-loading/page-skeletons/onboarding";
export {
  OptimizationPageSkeleton,
  OptimizationPageSkeleton as AnalysisRouteSkeleton,
} from "@/components/route-loading/page-skeletons/optimization";
export {
  PortfolioPageSkeleton,
  PortfolioPageSkeleton as PortfolioRouteSkeleton,
} from "@/components/route-loading/page-skeletons/portfolio";
export { PrivacyPageSkeleton } from "@/components/route-loading/page-skeletons/privacy";
export {
  SettingsPageSkeleton,
  SettingsPageSkeleton as SettingsRouteSkeleton,
} from "@/components/route-loading/page-skeletons/settings";
export { SimulationPageSkeleton } from "@/components/route-loading/page-skeletons/simulation";
export {
  StockDetailPageSkeleton,
  StockDetailPageSkeleton as StockDetailRouteSkeleton,
} from "@/components/route-loading/page-skeletons/stock-detail";
export { TermsPageSkeleton } from "@/components/route-loading/page-skeletons/terms";
export {
  WatchlistPageSkeleton,
  WatchlistPageSkeleton as WatchlistRouteSkeleton,
} from "@/components/route-loading/page-skeletons/watchlist";

export { AppShellContentSkeleton } from "@/components/route-loading/page-skeletons/app-generic";

export { AppPathLoadingSkeleton };

/** Parent `(app)/loading.tsx` and `RouteLoadingFallback`: match destination route, not a generic shell. */
export const AppRouteLoadingSkeleton = AppPathLoadingSkeleton;

