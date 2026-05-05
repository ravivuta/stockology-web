"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { LandingViewTransition } from "@/components/LandingViewTransition";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteButtonInteractions } from "@/components/SiteButtonInteractions";
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

    let timer: ReturnType<typeof setTimeout> | null = null;

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

    const scheduleNextAutoRefresh = () => {
      if (timer) clearTimeout(timer);
      if (readStoredAppearanceMode() !== "auto") return;

      const now = new Date();
      const next = new Date(now);
      if (now.getHours() < 7) {
        next.setHours(7, 0, 0, 0);
      } else if (now.getHours() < 19) {
        next.setHours(19, 0, 0, 0);
      } else {
        next.setDate(next.getDate() + 1);
        next.setHours(7, 0, 0, 0);
      }

      timer = setTimeout(() => {
        applyMode();
        scheduleNextAutoRefresh();
      }, Math.max(1000, next.getTime() - now.getTime()));
    };

    const handleModeChange = () => {
      applyMode();
      scheduleNextAutoRefresh();
    };

    applyMode();
    scheduleNextAutoRefresh();

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
      if (timer) clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(THEME_MODE_EVENT, handleModeChange as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, setTheme]);

  return null;
}

function ThemeBridge({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
