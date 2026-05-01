"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { LandingViewTransition } from "@/components/LandingViewTransition";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteButtonInteractions } from "@/components/SiteButtonInteractions";

const THEME_STORAGE = "stocks-pm-ui-theme";

/**
 * Marketing `/` stays light for theme tokens; `/login` + `/signup` are forced dark.
 * Elsewhere the saved `stocks-pm-ui-theme` applies.
 */
function ThemeBridge({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const next = localStorage.getItem(THEME_STORAGE);
      const legacy = localStorage.getItem("theme");
      if (!next && legacy && (legacy === "light" || legacy === "dark")) {
        localStorage.setItem(THEME_STORAGE, legacy);
      }
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  const forcedTheme =
    pathname === "/login" || pathname === "/signup"
      ? ("dark" as const)
      : pathname === "/"
        ? ("light" as const)
        : undefined;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={["light", "dark"]}
      enableSystem={false}
      storageKey={THEME_STORAGE}
      forcedTheme={forcedTheme}
      disableTransitionOnChange
    >
      <NavigationProgress />
      <SiteButtonInteractions />
      <LandingViewTransition>{children}</LandingViewTransition>
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeBridge>{children}</ThemeBridge>;
}
