"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/onboarding/page.tsx`: 5 step bars, large elevated card, Back / Next footer. */
export function OnboardingPageSkeleton() {
  return (
    <div className="box-border flex min-h-[100dvh] min-h-screen w-full flex-col px-5 py-8 sm:px-10 sm:py-10 md:px-14 lg:px-20" {...routeBusy}>
      <div className="mb-8 flex w-full gap-2 sm:mb-10 sm:gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Sk key={i} className="h-2.5 flex-1 rounded-full sm:h-3" />
        ))}
      </div>
      <div className="flex w-full flex-1 flex-col">
        <div className="ui-hover-lift flex min-h-[min(56vh,560px)] flex-1 flex-col rounded-3xl border border-border bg-elevated p-8 dark:border-primary/15 sm:min-h-[min(62vh,720px)] sm:p-12 md:p-16 lg:min-h-[min(68vh,800px)]">
          <Sk className="h-10 w-[min(100%,18rem)] rounded-xl sm:h-12 sm:w-64" />
          <Sk className="mt-6 h-5 w-full max-w-2xl rounded-lg sm:mt-8" />
          <Sk className="mt-3 h-5 w-full max-w-xl rounded-lg" />
          <Sk className="mt-3 h-5 w-full max-w-lg rounded-lg sm:hidden" />
          <Sk className="mt-8 h-14 w-full max-w-xl rounded-xl sm:mt-10" />
        </div>
        <div className="mt-8 flex w-full gap-4 sm:mt-10">
          <Sk className="min-h-[52px] flex-1 rounded-2xl sm:min-h-14" />
          <Sk className="min-h-[52px] flex-1 rounded-2xl sm:min-h-14" />
        </div>
      </div>
    </div>
  );
}
