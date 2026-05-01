"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/terms/page.tsx`: max-w-2xl, title + two short paragraphs. */
export function TermsPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 py-2" {...routeBusy}>
      <Sk className="h-8 w-44 rounded-lg" />
      <div className="space-y-2">
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-[96%] rounded-md" />
        <Sk className="h-3 w-full rounded-md" />
      </div>
      <Sk className="h-3 w-full rounded-md" />
    </div>
  );
}
