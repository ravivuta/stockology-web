"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { LandingViewTransition } from "@/components/LandingViewTransition";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteButtonInteractions } from "@/components/SiteButtonInteractions";
import { normalizeAppPathname } from "@/lib/base-path";
import {
  THEME_ACTIVE_STORAGE,
  THEME_MODE_EVENT,
  THEME_MODE_STORAGE,
  readStoredAppearanceMode,
  resolveAppearanceTheme,
} from "@/lib/theme-mode";

/**
 * Marketing `/` stays light for theme tokens; `/login` + `/signup` are forced dark.
 * Elsewhere the saved `stocks-pm-ui-theme` applies.
 */
function ThemeModeSync({ pathname }: { pathname: string }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") {
      setTheme("dark");
      return;
    }

    if (pathname === "/") {
      setTheme("light");
      return;
    }

    const applyMode = () => {
      const mode = readStoredAppearanceMode();
      const resolved = resolveAppearanceTheme(mode);
      setTheme(resolved);
      try {
        localStorage.setItem(THEME_ACTIVE_STORAGE, resolved);
      } catch {
        /* storage blocked */
      }
    };

    const handleModeChange = () => {
      applyMode();
    };

    applyMode();
    const appearanceQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemAppearance = () => {
      if (readStoredAppearanceMode() === "auto") applyMode();
    };
    appearanceQuery.addEventListener("change", handleSystemAppearance);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_MODE_STORAGE && event.key !== THEME_ACTIVE_STORAGE) return;
      handleModeChange();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleModeChange();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_MODE_EVENT, handleModeChange as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      appearanceQuery.removeEventListener("change", handleSystemAppearance);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(THEME_MODE_EVENT, handleModeChange as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, setTheme]);

  return null;
}

function ThemeBridge({ children }: { children: React.ReactNode }) {
  const pathname = normalizeAppPathname(usePathname());

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const next = localStorage.getItem(THEME_MODE_STORAGE);
      const legacy = localStorage.getItem("theme");
      if (!next && legacy && (legacy === "light" || legacy === "dark")) {
        localStorage.setItem(THEME_MODE_STORAGE, legacy);
      }
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={["light", "dark"]}
      enableSystem={false}
      storageKey={THEME_ACTIVE_STORAGE}
      disableTransitionOnChange
    >
      <ThemeModeSync pathname={pathname} />
      <NavigationProgress />
      <SiteButtonInteractions />
      <LandingViewTransition>{children}</LandingViewTransition>
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeBridge>{children}</ThemeBridge>;
}
