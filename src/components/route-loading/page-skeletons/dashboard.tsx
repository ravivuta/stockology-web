"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/dashboard/page.tsx`: header actions, portfolio summary (donut + stats),
 * recommended actions, return comparison (range + chart), top investments (gainers/losers grid).
 */
export function DashboardPageSkeleton() {
  return (
    <div className="w-full space-y-5 px-1 py-2" {...routeBusy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Sk className="h-8 w-36 rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Sk className="h-10 w-[9.5rem] rounded-full" />
          <Sk className="h-10 w-24 rounded-lg border border-border/60 dark:border-white/[0.08]" />
        </div>
      </div>

      <section className="dashboard-panel p-5 text-foreground sm:p-6">
        <Sk className="h-4 w-40 rounded-md" />
        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 lg:min-w-0 lg:flex-1 lg:justify-start">
            <Sk className="h-[140px] w-[140px] shrink-0 rounded-full sm:h-[152px] sm:w-[152px]" />
            <div className="min-w-[9rem] max-w-xs flex-1 space-y-2 sm:min-w-[10.5rem]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Sk className="h-2.5 w-2.5 shrink-0 rounded-sm" />
                  <Sk className="h-3.5 flex-1 rounded-md" />
                  <Sk className="h-3.5 w-9 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <dl className="grid w-full max-w-lg shrink-0 grid-cols-1 gap-0">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex items-baseline justify-between gap-4 py-2.5 ${i < 2 ? "border-b border-border/90 dark:border-foreground/10" : ""}`}
              >
                <Sk className="h-3.5 w-20 rounded-md" />
                <Sk className="h-3.5 w-28 rounded-md" />
              </div>
            ))}
          </dl>
        </div>
        <Sk className="mt-4 h-3 w-full max-w-md rounded-md" />
      </section>

      <section className="dashboard-panel p-5 sm:p-6">
        <Sk className="h-4 w-48 rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-lg rounded-md" />
        <ul className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 dark:bg-white/5">
              <Sk className="h-6 w-11 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Sk className="h-3.5 w-16 rounded-md" />
                <Sk className="h-3 w-full rounded-md" />
                <Sk className="h-3 w-4/5 rounded-md" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard-panel p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Sk className="h-4 w-44 rounded-md" />
            <Sk className="h-3 w-64 max-w-full rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background/80 p-1 dark:bg-white/5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Sk key={i} className="h-7 w-9 rounded-md" />
              ))}
            </div>
            <Sk className="h-8 w-24 rounded-lg" />
          </div>
        </div>
        <div className="relative h-[220px] overflow-hidden rounded-xl border border-border/80 bg-background/40 dark:border-white/[0.08] sm:h-[248px]">
          <div className="absolute left-3 top-3 z-10 flex gap-3 rounded-lg px-2 py-1.5">
            <Sk className="h-3 w-20 rounded" />
            <Sk className="h-3 w-24 rounded" />
          </div>
          <Sk className="absolute bottom-8 left-4 right-4 top-14 rounded-lg opacity-80" />
        </div>
      </section>

      <section className="dashboard-panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Sk className="h-4 w-40 rounded-md" />
          <div className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1">
            <Sk className="h-3 w-10 rounded" />
            <Sk className="h-4 w-4 rounded" />
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="flex min-h-[140px] flex-col">
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <Sk className="h-4 w-24 rounded-md" />
              <Sk className="h-3 w-32 rounded-md" />
            </div>
            <div className="flex flex-1 flex-wrap content-start gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Sk key={i} className="h-[4.25rem] min-w-[7.5rem] flex-1 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="flex min-h-[140px] flex-col">
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <Sk className="h-4 w-20 rounded-md" />
              <Sk className="h-3 w-32 rounded-md" />
            </div>
            <div className="flex flex-1 flex-wrap content-start gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Sk key={i} className="h-[4.25rem] min-w-[7.5rem] flex-1 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
