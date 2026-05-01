"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/settings/page.tsx`: max-w-6xl hero header (badge, title, cash tile),
 * lg 12-col grid with sticky nav + main (2-up cards, full-width Portfolio, Data & import).
 */
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl pb-6 lg:pb-8" {...routeBusy}>
      <header className="relative mb-5 overflow-hidden rounded-xl border border-border bg-elevated px-4 py-5 shadow-[var(--theme-shadow-card)] sm:px-6 sm:py-6 dark:border-white/[0.08] lg:mb-6">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-2xl space-y-2">
            <Sk className="h-6 w-28 rounded-full" />
            <Sk className="h-9 w-40 rounded-lg sm:h-10 sm:w-48" />
            <Sk className="h-3 w-full max-w-lg rounded-md" />
            <Sk className="h-3 w-full max-w-md rounded-md sm:hidden" />
          </div>
          <Sk className="h-[4.25rem] w-[7.5rem] shrink-0 rounded-lg border border-border/80 dark:border-white/[0.08]" />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6 xl:gap-8">
        <aside className="mb-4 lg:col-span-4 xl:col-span-3 lg:mb-0">
          <div className="lg:sticky lg:top-20">
            <Sk className="mb-2 hidden h-3 w-28 rounded-md lg:block" />
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {[0, 1, 2, 3].map((i) => (
                <Sk key={i} className="h-10 min-w-[7.5rem] shrink-0 rounded-lg lg:w-full lg:min-w-0" />
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-4 lg:col-span-8 xl:col-span-9 lg:space-y-5">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex h-full flex-col rounded-xl border border-border bg-elevated shadow-[var(--theme-shadow-card)] dark:border-white/[0.08]"
              >
                <div className="flex gap-3 border-b border-border/80 px-4 py-3 dark:border-white/[0.06] sm:px-5">
                  <Sk className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Sk className="h-4 w-36 rounded-md" />
                    <Sk className="h-3 w-full rounded-md" />
                    <Sk className="h-3 w-[90%] rounded-md" />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
                  <Sk className="h-10 w-full max-w-xs rounded-xl" />
                  <Sk className="h-3 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>

          <section className="flex flex-col rounded-xl border border-border bg-elevated shadow-[var(--theme-shadow-card)] dark:border-white/[0.08]">
            <div className="flex gap-3 border-b border-border/80 px-4 py-3 dark:border-white/[0.06] sm:px-5">
              <Sk className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Sk className="h-4 w-28 rounded-md" />
                <Sk className="h-3 w-full max-w-xl rounded-md" />
              </div>
            </div>
            <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Sk className="h-2.5 w-24 rounded-md" />
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Sk className="h-10 flex-1 rounded-lg" />
                  <Sk className="h-10 w-28 rounded-full" />
                </div>
              </div>
              <div>
                <Sk className="h-2.5 w-20 rounded-md" />
                <Sk className="mt-1 h-10 w-full rounded-lg" />
              </div>
              <div className="flex items-stretch md:col-span-2">
                <Sk className="h-[2.75rem] w-full rounded-lg" />
              </div>
              <div>
                <Sk className="h-2.5 w-28 rounded-md" />
                <Sk className="mt-1 h-10 w-full rounded-lg" />
              </div>
              <div>
                <Sk className="h-2.5 w-32 rounded-md" />
                <Sk className="mt-1 h-10 w-full rounded-lg" />
              </div>
              <div>
                <Sk className="h-2.5 w-20 rounded-md" />
                <Sk className="mt-1 h-10 w-full rounded-lg" />
              </div>
              <div>
                <Sk className="h-2.5 w-16 rounded-md" />
                <Sk className="mt-1 h-10 w-full rounded-lg" />
              </div>
              <div className="md:col-span-2">
                <Sk className="h-10 w-56 rounded-lg" />
              </div>
            </div>
          </section>

          <section className="flex flex-col rounded-xl border border-border bg-elevated shadow-[var(--theme-shadow-card)] dark:border-white/[0.08]">
            <div className="flex gap-3 border-b border-border/80 px-4 py-3 dark:border-white/[0.06] sm:px-5">
              <Sk className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Sk className="h-4 w-36 rounded-md" />
                <Sk className="h-3 w-full max-w-2xl rounded-md" />
              </div>
            </div>
            <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:items-stretch">
              <div className="flex flex-col gap-3">
                <Sk className="h-20 w-full rounded-lg border border-border/70 dark:border-white/[0.08]" />
                <Sk className="h-3 w-full rounded-md" />
              </div>
              <Sk className="min-h-[7rem] w-full rounded-lg border border-border/60 dark:border-white/[0.08]" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
