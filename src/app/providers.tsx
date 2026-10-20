"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { LandingViewTransition } from "@/components/LandingViewTransition";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteButtonInteractions } from "@/components/SiteButtonInteractions";
import { normalizeAppPathname } from "@/lib/base-path";
import {
  THEME_MODE_STORAGE,
} from "@/lib/theme-mode";

/**
 * Marketing `/` stays light; `/login` and `/signup` stay dark.
 * Those routes use forcedTheme so they do not overwrite the saved Auto/Light/Dark choice.
 * Elsewhere next-themes follows `system` for Auto.
 */
function ThemeBridge({ children }: { children: React.ReactNode }) {
  const pathname = normalizeAppPathname(usePathname());
  const forcedTheme =
    pathname === "/login" || pathname === "/signup" ? "dark" : pathname === "/" ? "light" : undefined;

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const next = localStorage.getItem(THEME_MODE_STORAGE);
      const legacy = localStorage.getItem("theme");
      if (!next && legacy && (legacy === "light" || legacy === "dark")) {
        localStorage.setItem(THEME_MODE_STORAGE, legacy);
      }
      if (next === "auto") localStorage.setItem(THEME_MODE_STORAGE, "system");
      localStorage.removeItem("stocks-pm-ui-theme-active");
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      forcedTheme={forcedTheme}
      themes={["light", "dark"]}
      storageKey={THEME_MODE_STORAGE}
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
