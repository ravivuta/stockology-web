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
