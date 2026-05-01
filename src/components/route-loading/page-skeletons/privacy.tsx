"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/** Mirrors `app/(app)/privacy/page.tsx`: max-w-2xl, title + two short paragraphs (different widths than Terms). */
export function PrivacyPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 py-2" {...routeBusy}>
      <Sk className="h-8 w-28 rounded-lg" />
      <div className="space-y-2">
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-[88%] rounded-md" />
      </div>
      <div className="space-y-2 pt-1">
        <Sk className="h-3 w-full rounded-md" />
        <Sk className="h-3 w-[72%] rounded-md" />
      </div>
    </div>
  );
}
