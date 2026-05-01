"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `stock/[symbol]/page.tsx` + `StockDetailExpandPanel` (non-embedded): back link, header,
 * position stat tiles (5-up grid), tab row (Recommendation / Chart / Snapshot), panel body.
 */
export function StockDetailPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-1 py-2" {...routeBusy}>
      <div className="rounded-2xl border border-border bg-muted/20 text-foreground ui-hover-lift">
        <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 dark:border-white/[0.08] sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Sk className="mb-2 h-3 w-24 rounded-md" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Sk className="h-8 w-20 rounded-lg" />
              <Sk className="h-5 w-40 max-w-full rounded-md" />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <Sk className="h-9 w-28 rounded-md" />
              <Sk className="h-5 w-24 rounded-md" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sk className="h-11 w-28 rounded-xl" />
            <Sk className="h-10 w-10 rounded-xl" />
          </div>
        </div>

        <div className="max-h-[min(72vh,920px)] space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <Sk className="mb-3 h-3 w-16 rounded" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/80 bg-background/70 px-4 py-3.5 dark:border-white/[0.08] dark:bg-white/[0.04]"
                >
                  <Sk className="h-2.5 w-20 rounded" />
                  <Sk className="mt-2 h-6 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border/80 bg-elevated shadow-sm dark:border-white/[0.08]">
            <div className="flex flex-wrap gap-1 border-b border-border/60 p-2 dark:border-white/[0.06]" role="tablist">
              <Sk className="min-h-10 flex-1 rounded-xl px-5 sm:flex-none sm:w-[9.5rem]" />
              <Sk className="min-h-10 flex-1 rounded-xl px-5 sm:flex-none sm:w-24" />
              <Sk className="min-h-10 flex-1 rounded-xl px-5 sm:flex-none sm:w-28" />
            </div>
            <div className="space-y-4 p-5">
              <Sk className="h-3 w-full rounded-md" />
              <Sk className="h-3 w-full rounded-md" />
              <Sk className="h-8 w-24 rounded-lg" />
              <Sk className="h-4 w-full rounded-md" />
              <Sk className="h-4 w-full rounded-md" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-border/80 px-3 py-2.5 dark:border-white/[0.08]">
                    <Sk className="h-2.5 w-20 rounded" />
                    <Sk className="mt-2 h-5 w-24 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
