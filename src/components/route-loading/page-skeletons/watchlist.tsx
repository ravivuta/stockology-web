"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/watchlist/page.tsx`: title + subtitle, action row, add card,
 * filter input, 8-column table (Symbol, Last, Change, Analyst, Upside, Mkt cap, Signal, Actions).
 */
export function WatchlistPageSkeleton() {
  return (
    <div className="w-full space-y-6 px-1 py-2" {...routeBusy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Sk className="h-8 w-36 rounded-lg" />
          <Sk className="mt-1 h-3 w-full max-w-xl rounded-md" />
          <Sk className="mt-2 h-3 w-full max-w-lg rounded-md" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Sk className="h-10 w-40 rounded-full" />
          <div className="flex flex-wrap gap-2">
            <Sk className="h-10 w-28 rounded-lg" />
            <Sk className="h-10 w-24 rounded-lg" />
          </div>
          <Sk className="h-4 w-16 rounded-md" />
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <Sk className="h-5 w-40 rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-2xl rounded-md" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Sk className="h-10 min-w-[8rem] flex-1 rounded-lg sm:max-w-xs" />
          <Sk className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Sk className="h-10 min-w-[10rem] flex-1 rounded-lg sm:max-w-xs" />
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm lg:min-w-full">
          <colgroup>
            {Array.from({ length: 8 }, (_, i) => (
              <col key={i} style={{ width: "12.5%" }} />
            ))}
          </colgroup>
          <thead className="text-xs font-semibold uppercase tracking-wide text-subtle">
            <tr>
              <th scope="col" className="px-2 py-3 pl-4 text-left sm:px-3 sm:pl-5">
                <Sk className="h-3 w-14 rounded" />
              </th>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <th key={i} scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                  <Sk className={`ml-auto h-3 rounded ${i >= 6 ? "w-8" : "w-12"}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5, 6].map((r) => (
              <tr key={r} className="border-t border-border/40 dark:border-white/[0.05]">
                <td className="px-2 py-3 pl-4 sm:px-3 sm:pl-5">
                  <Sk className="h-4 w-20 rounded-md" />
                </td>
                {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                  <td key={c} className="px-2 py-3 text-right sm:px-3">
                    {c === 6 ? (
                      <Sk className="ml-auto h-8 w-16 rounded-lg" />
                    ) : (
                      <Sk className="ml-auto h-3.5 w-14 rounded-md" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
