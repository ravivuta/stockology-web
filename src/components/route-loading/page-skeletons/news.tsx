"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/news/page.tsx`: bordered header with icon + title,
 * xl 12-column grid (main article grid sm:2, sticky aside with View tabs, Search, Symbol detail).
 */
export function NewsPageSkeleton() {
  return (
    <div className="w-full space-y-8 px-1 py-2 pb-10" {...routeBusy}>
      <div className="flex flex-col gap-6 border-b border-border/60 pb-8 dark:border-white/[0.06] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Sk className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="space-y-2">
              <Sk className="h-8 w-24 rounded-lg sm:h-9 sm:w-28" />
              <Sk className="h-3 w-full max-w-md rounded-md" />
            </div>
          </div>
          <Sk className="mt-4 hidden h-3 w-full max-w-2xl rounded-md sm:block" />
          <Sk className="mt-2 hidden h-3 w-full max-w-xl rounded-md sm:block" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12 xl:gap-10">
        <div className="order-2 min-w-0 xl:order-1 xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <Sk className="h-4 w-32 rounded-md" />
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="list-none">
                <div className="flex h-full flex-col rounded-2xl border border-border/80 bg-elevated p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Sk className="h-7 w-16 rounded-lg" />
                    <Sk className="h-7 w-20 rounded-full" />
                  </div>
                  <Sk className="h-4 w-full rounded-md" />
                  <Sk className="mt-2 h-4 w-full rounded-md" />
                  <Sk className="mt-2 h-4 w-[88%] rounded-md" />
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Sk className="h-3 w-20 rounded" />
                    <Sk className="h-3 w-16 rounded" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="order-1 min-w-0 space-y-6 xl:order-2 xl:col-span-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-border/80 bg-elevated p-1 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <Sk className="mx-4 mt-3 h-2.5 w-8 rounded" />
            <div className="mt-2 flex flex-col gap-1 p-1 sm:flex-row sm:flex-wrap xl:flex-col">
              {[0, 1, 2].map((i) => (
                <Sk key={i} className="h-11 w-full rounded-xl sm:min-w-[7.5rem] sm:w-auto xl:w-full" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-elevated p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <Sk className="h-2.5 w-14 rounded" />
            <Sk className="mt-3 h-11 w-full rounded-xl" />
          </div>

          <div className="rounded-2xl border border-border/80 bg-elevated p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <Sk className="h-2.5 w-24 rounded" />
            <Sk className="mt-2 h-3 w-full rounded-md" />
            <div className="mt-3 flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Sk key={i} className="h-8 w-14 rounded-lg" />
              ))}
            </div>
            <Sk className="mt-4 h-32 w-full rounded-xl border-t border-border/60 pt-4 dark:border-white/[0.06]" />
          </div>
        </aside>
      </div>
    </div>
  );
}
