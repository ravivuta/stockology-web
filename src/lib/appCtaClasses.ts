import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils";

/**
 * Landing hero CTA fill: mint → teal gradient + near-black label.
 * Use with `ui-hover-spotlight` / `ui-hover-pop` where appropriate.
 */
export const APP_CTA_FILL =
  "bg-gradient-to-r from-[var(--landing-cta-from)] to-[var(--landing-cta-to)] font-semibold text-[color:var(--landing-cta-text)] shadow-[var(--landing-cta-shadow)]";

/** Default primary action control (pill, hover brighten). */
export function appCtaButton(...extra: ClassValue[]) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full transition-[filter] hover:brightness-[1.05] disabled:opacity-50",
    APP_CTA_FILL,
    ...extra
  );
}

export function glassFilterToggle(active: boolean, tone: "amber" | "emerald" = "emerald", ...extra: ClassValue[]) {
  const activeClass =
    tone === "amber"
      ? "border-amber-400/55 bg-amber-200/70 text-amber-950 shadow-[0_14px_34px_rgba(245,158,11,0.20)] dark:border-amber-300/35 dark:bg-amber-400/18 dark:text-amber-100 dark:shadow-[0_14px_34px_rgba(245,158,11,0.18)]"
      : "border-emerald-400/55 bg-emerald-200/70 text-emerald-950 shadow-[0_14px_34px_rgba(16,185,129,0.20)] dark:border-emerald-300/35 dark:bg-emerald-400/18 dark:text-emerald-100 dark:shadow-[0_14px_34px_rgba(16,185,129,0.18)]";

  const idleClass =
    tone === "amber"
      ? "border-slate-300/80 bg-white/72 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:border-amber-300/65 hover:bg-amber-50/90 hover:text-amber-900 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)] dark:hover:border-amber-300/30 dark:hover:bg-amber-400/10 dark:hover:text-amber-100"
      : "border-slate-300/80 bg-white/72 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:border-emerald-300/65 hover:bg-emerald-50/90 hover:text-emerald-900 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)] dark:hover:border-emerald-300/30 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-100";

  return cn(
    "rounded-full border px-3 py-2 text-xs font-semibold backdrop-blur-md transition-all duration-200",
    active ? activeClass : idleClass,
    extra
  );
}
