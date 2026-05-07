"use client";

export const THEME_MODE_STORAGE = "stocks-pm-ui-theme";
export const THEME_ACTIVE_STORAGE = "stocks-pm-ui-theme-active";
export const THEME_MODE_EVENT = "stocks-pm:theme-mode-change";

export type AppearanceMode = "light" | "dark" | "auto";
export type ResolvedAppearanceTheme = "light" | "dark";

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "auto";
}

export function resolveAppearanceTheme(mode: AppearanceMode, now: Date = new Date()): ResolvedAppearanceTheme {
  if (mode === "light" || mode === "dark") return mode;
  const hour = now.getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

export function readStoredAppearanceMode(): AppearanceMode {
  if (typeof window === "undefined") return "auto";

  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE);
    if (isAppearanceMode(stored)) return stored;

    const legacy = localStorage.getItem("theme");
    if (isAppearanceMode(legacy)) return legacy;

    const active = localStorage.getItem(THEME_ACTIVE_STORAGE);
    if (active === "light" || active === "dark") return active;
  } catch {
    /* storage blocked */
  }

  return "auto";
}

export function writeAppearanceMode(mode: AppearanceMode) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(THEME_MODE_STORAGE, mode);
    window.dispatchEvent(new CustomEvent(THEME_MODE_EVENT, { detail: mode }));
  } catch {
    /* storage blocked */
  }
}
