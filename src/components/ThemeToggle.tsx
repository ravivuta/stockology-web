"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  readStoredAppearanceMode,
  writeAppearanceMode,
  type AppearanceMode,
} from "@/lib/theme-mode";

const OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<AppearanceMode>("auto");

  useEffect(() => {
    setMounted(true);
    setMode(readStoredAppearanceMode());
  }, []);

  function applyMode(nextMode: AppearanceMode) {
    setMode(nextMode);
    writeAppearanceMode(nextMode);
    setTheme(nextMode === "auto" ? "system" : nextMode);
  }

  if (!mounted) return <span className="inline-block h-11 w-full rounded-xl bg-muted sm:w-80" />;

  return (
    <div className="w-full max-w-md space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => applyMode(option.value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary/35 bg-primary/12 text-foreground shadow-sm dark:bg-primary/16"
                  : "border-border bg-elevated text-subtle hover:border-primary/20 hover:text-foreground dark:border-white/[0.08]"
              )}
              aria-pressed={active}
            >
              <span className="block text-center text-sm font-semibold">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
