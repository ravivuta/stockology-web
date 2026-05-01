"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/simulation/page.tsx`: max-w-lg, title, intro, form card (Symbol, Capital, Run, optional result pre). */
export function SimulationPageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-1 py-2" {...routeBusy}>
      <Sk className="h-8 w-36 rounded-lg" />
      <Sk className="h-3 w-full rounded-md" />
      <Sk className="h-3 w-[95%] rounded-md" />
      <div className="ui-hover-lift space-y-4 rounded-2xl border border-border bg-elevated p-6">
        <div>
          <Sk className="h-3 w-16 rounded-md" />
          <Sk className="mt-1 h-10 w-full rounded-lg" />
        </div>
        <div>
          <Sk className="h-3 w-28 rounded-md" />
          <Sk className="mt-1 h-10 w-full rounded-lg" />
        </div>
        <Sk className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
