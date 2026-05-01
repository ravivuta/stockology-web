"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Neutral in-app placeholder for `(app)/loading.tsx` while a child route’s own `loading.tsx`
 * has not replaced this yet — avoids flashing the dashboard-specific skeleton on every navigation.
 */
export function AppShellContentSkeleton() {
  return (
    <div className="w-full space-y-6 pb-4" {...routeBusy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Sk className="h-8 w-44 rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Sk className="h-10 w-28 rounded-full" />
          <Sk className="h-10 w-24 rounded-lg border border-border/60" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-elevated p-5 shadow-[var(--theme-shadow-card)] sm:p-6 dark:border-white/[0.08]">
        <Sk className="h-4 w-52 rounded-md" />
        <div className="mt-4 space-y-3">
          <Sk className="h-3 w-full rounded-md" />
          <Sk className="h-3 w-[96%] max-w-full rounded-md" />
          <Sk className="h-3 w-[88%] max-w-full rounded-md" />
        </div>
        <Sk className="mt-6 h-36 w-full rounded-xl border border-border/50 dark:border-white/[0.06]" />
      </div>
      <div className="rounded-2xl border border-border bg-elevated p-5 sm:p-6 dark:border-white/[0.08]">
        <Sk className="h-4 w-40 rounded-md" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Sk key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
