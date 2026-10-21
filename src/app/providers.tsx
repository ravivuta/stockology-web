"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { LandingViewTransition } from "@/components/LandingViewTransition";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteButtonInteractions } from "@/components/SiteButtonInteractions";
import { normalizeAppPathname } from "@/lib/base-path";
import {
  THEME_MODE_EVENT,
  THEME_MODE_STORAGE,
  THEME_RESOLVED_STORAGE,
  readStoredAppearanceMode,
  resolveAppearanceTheme,
} from "@/lib/theme-mode";

/**
 * Marketing `/` stays light; `/login` and `/signup` stay dark.
 * Those routes use forcedTheme so they do not overwrite the saved Auto/Light/Dark choice.
 * Auto is light from 7:00 to 19:00 local time and dark at night.
 */
function AutoDaypartSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const sync = () => {
      if (readStoredAppearanceMode() !== "auto") return;
      setTheme(resolveAppearanceTheme("auto"));
    };
    sync();
    const timer = window.setInterval(sync, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener(THEME_MODE_EVENT, sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(THEME_MODE_EVENT, sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setTheme]);

  return null;
}

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
      defaultTheme="light"
      enableSystem={false}
      forcedTheme={forcedTheme}
      themes={["light", "dark"]}
      storageKey={THEME_RESOLVED_STORAGE}
      disableTransitionOnChange
    >
      <AutoDaypartSync />
      <NavigationProgress />
      <SiteButtonInteractions />
      <LandingViewTransition>{children}</LandingViewTransition>
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeBridge>{children}</ThemeBridge>;
}
