"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/csv-help/page.tsx`: max-w-2xl, title, intro paragraph, three numbered `ui-hover-lift` cards. */
export function CsvHelpPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-1 py-2" {...routeBusy}>
      <Sk className="h-8 w-56 rounded-lg" />
      <div className="space-y-2">
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-[92%] rounded-md" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="ui-hover-lift rounded-xl border border-border bg-elevated p-4">
          <Sk className="h-4 w-[min(100%,14rem)] rounded-md" />
          <Sk className="mt-3 h-3 w-full rounded-md" />
          <Sk className="mt-2 h-3 w-full rounded-md" />
          <Sk className="mt-2 h-3 w-[85%] rounded-md" />
        </div>
      ))}
    </div>
  );
}
