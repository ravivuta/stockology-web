"use client";

export const THEME_MODE_STORAGE = "stocks-pm-ui-theme";
export const THEME_RESOLVED_STORAGE = "stocks-pm-ui-theme-resolved";
export const THEME_ACTIVE_STORAGE = "stocks-pm-ui-theme-active";
export const THEME_MODE_EVENT = "stocks-pm:theme-mode-change";

/** Local daytime is light. Night is dark. Auto does not follow the OS appearance. */
export const DAYTIME_START_HOUR = 7;
export const DAYTIME_END_HOUR = 19;

export type AppearanceMode = "light" | "dark" | "auto";
export type ResolvedAppearanceTheme = "light" | "dark";

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "auto";
}

export function themeForLocalTime(date = new Date()): ResolvedAppearanceTheme {
  const hour = date.getHours();
  return hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR ? "light" : "dark";
}

export function resolveAppearanceTheme(mode: AppearanceMode): ResolvedAppearanceTheme {
  if (mode === "light" || mode === "dark") return mode;
  return themeForLocalTime();
}

export function readStoredAppearanceMode(): AppearanceMode {
  if (typeof window === "undefined") return "auto";

  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE);
    if (stored === "auto" || stored === "system") return "auto";
    if (stored === "light" || stored === "dark") return stored;

    const legacy = localStorage.getItem("theme");
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* storage blocked */
  }

  return "auto";
}

export function writeAppearanceMode(mode: AppearanceMode) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(THEME_MODE_STORAGE, mode === "auto" ? "system" : mode);
    localStorage.removeItem(THEME_ACTIVE_STORAGE);
    window.dispatchEvent(new CustomEvent(THEME_MODE_EVENT, { detail: mode }));
  } catch {
    /* storage blocked */
  }
}
