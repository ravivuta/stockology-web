"use client";

import { cn } from "@/lib/utils";
import { UiSkeleton } from "@/components/route-loading/SkeletonPrimitives";

export const routeBusy = {
  role: "status" as const,
  "aria-live": "polite" as const,
  "aria-busy": true as const,
  "aria-label": "Loading page" as const,
};

/** Shimmer block — use with Tailwind size/radius utilities. */
export function Sk({ className }: { className?: string }) {
  return <UiSkeleton className={cn(className)} />;
}
