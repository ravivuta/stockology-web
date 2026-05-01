"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/help/page.tsx`: hero header (Guide pill + title + search), xl grid with
 * sticky "On this page" nav (7 categories) and article sections (category header + sm:grid-cols-2 cards).
 */
export function HelpPageSkeleton() {
  return (
    <div className="w-full px-1 py-2 pb-16" {...routeBusy}>
      <header className="relative overflow-hidden rounded-3xl border border-border bg-elevated px-6 py-10 shadow-[var(--theme-shadow-card)] sm:px-10 sm:py-12">
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <Sk className="h-7 w-28 rounded-full" />
            <Sk className="h-10 w-[min(100%,20rem)] rounded-xl sm:h-12 sm:w-80" />
            <Sk className="h-4 w-full max-w-xl rounded-md" />
            <Sk className="h-4 w-full max-w-lg rounded-md sm:hidden" />
          </div>
          <div className="relative w-full shrink-0 lg:max-w-md">
            <Sk className="h-12 w-full rounded-2xl" />
          </div>
        </div>
      </header>

      <div className="mt-8 sm:mt-10 xl:grid xl:grid-cols-12 xl:gap-10">
        <aside className="mb-10 hidden xl:col-span-3 xl:block">
          <nav className="sticky top-6 space-y-1 rounded-2xl border border-border bg-elevated p-3 shadow-[var(--theme-shadow-card)]" aria-hidden>
            <Sk className="mx-2 mb-2 h-3 w-24 rounded" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Sk key={i} className="h-10 w-full rounded-xl" />
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-14 xl:col-span-9">
          {[0, 1].map((sec) => (
            <section key={sec} className="scroll-mt-6">
              <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-4">
                <Sk className="h-11 w-11 rounded-2xl" />
                <div className="space-y-2">
                  <Sk className="h-7 w-40 rounded-lg" />
                  <Sk className="h-3 w-56 rounded-md" />
                </div>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="list-none">
                    <div className="ui-hover-lift flex h-full flex-col rounded-2xl border border-border bg-elevated p-5 dark:border-foreground/10">
                      <Sk className="mb-3 h-0.5 w-10 rounded-full" />
                      <Sk className="h-4 w-full rounded-md" />
                      <Sk className="mt-2 h-3 w-full rounded-md" />
                      <Sk className="mt-2 h-3 w-full rounded-md" />
                      <Sk className="mt-2 h-3 w-[82%] rounded-md" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
