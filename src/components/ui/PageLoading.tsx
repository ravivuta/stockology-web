"use client";

import { UiSkeleton } from "@/components/route-loading/SkeletonPrimitives";

type PageLoadingProps = {
  message?: string;
  compact?: boolean;
};

/**
 * Immediate layout + shimmer while gated routes resolve (onboarding, subscription checks).
 */
export function PageLoading({ message = "Loading…", compact = false }: PageLoadingProps) {
  return (
    <div
      className={
        compact
          ? "flex min-h-[40vh] flex-col items-center justify-center gap-6 px-4 py-12"
          : "flex min-h-[min(70dvh,32rem)] flex-col items-center justify-center gap-8 px-4 py-16"
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <div className="flex items-center gap-3">
          <UiSkeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <UiSkeleton className="h-3 w-24 rounded-md" />
            <UiSkeleton className="h-4 w-32 rounded-md" />
          </div>
        </div>
        <UiSkeleton className="h-28 w-full rounded-2xl" />
        <div className="flex w-full justify-center gap-2">
          <UiSkeleton className="h-2 w-2 rounded-full" />
          <UiSkeleton className="h-2 w-2 rounded-full" />
          <UiSkeleton className="h-2 w-2 rounded-full" />
        </div>
      </div>
      <p className="max-w-xs text-center text-sm font-medium tracking-tight text-subtle">{message}</p>
    </div>
  );
}
