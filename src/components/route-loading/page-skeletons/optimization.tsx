"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/optimization/page.tsx`: max-w-2xl, title, body with inline link spans, Coming next card. */
export function OptimizationPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-1 py-2" {...routeBusy}>
      <Sk className="h-8 w-40 rounded-lg" />
      <div className="space-y-2">
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-[94%] rounded-md" />
      </div>
      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-6">
        <Sk className="h-4 w-32 rounded-md" />
        <div className="mt-3 space-y-2 pl-1">
          <Sk className="h-3 w-full rounded-md" />
          <Sk className="h-3 w-full rounded-md" />
          <Sk className="h-3 w-[90%] rounded-md" />
        </div>
      </div>
    </div>
  );
}
