"use client";

import { routeBusy, Sk } from "@/components/route-loading/page-skeletons/_common";

/**
 * Mirrors `app/(app)/portfolio/page.tsx`: header, 4 KPI cards, CSV card, buy/sell card,
 * filter row, holdings table, transaction history, net worth, allocation.
 */
export function PortfolioPageSkeleton() {
  return (
    <div className="w-full space-y-8 px-1 py-2" {...routeBusy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Sk className="h-8 w-32 rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Sk className="h-10 w-24 rounded-lg" />
          <Sk className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
            <Sk className="h-2.5 w-24 rounded" />
            <Sk className="mt-2 h-7 w-28 rounded-md" />
            {i === 1 || i === 2 || i === 3 ? <Sk className="mt-2 h-2.5 w-36 rounded" /> : null}
          </div>
        ))}
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <Sk className="h-5 w-48 rounded-md" />
            <Sk className="h-3 w-full max-w-xl rounded-md" />
            <Sk className="h-3 w-full max-w-lg rounded-md" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Sk className="h-10 w-28 rounded-lg" />
            <Sk className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <Sk className="h-5 w-28 rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-2xl rounded-md" />
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <Sk className="h-2.5 w-10 rounded" />
              <Sk className={`h-10 rounded-lg ${i === 2 ? "w-20" : i === 3 ? "min-w-[8rem] flex-1" : "w-[7.5rem]"}`} />
            </div>
          ))}
          <Sk className="h-10 w-32 rounded-full self-end" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Sk className="h-10 min-w-[10rem] flex-1 rounded-lg sm:max-w-xs" />
        <Sk className="h-10 w-[13rem] rounded-lg" />
        <Sk className="h-10 w-[8.5rem] rounded-lg" />
      </div>

      <div className="ui-hover-lift overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-subtle dark:bg-white/[0.05]">
            <tr>
              <th scope="col" className="px-4 pb-2 pt-3 text-left text-xs font-semibold tracking-wide">
                <Sk className="h-3 w-14 rounded" />
              </th>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <th key={i} scope="col" className="px-4 pb-2 pt-3 text-right text-xs font-semibold tabular-nums tracking-wide">
                  <Sk className="ml-auto h-3 w-10 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <tr key={r} className="border-t border-border/40 dark:border-white/[0.05]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sk className="h-4 w-14 rounded-md" />
                    <Sk className="h-5 w-16 rounded-full" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-4 w-8 rounded-md" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-4 w-14 rounded-md" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-4 w-14 rounded-md" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-4 w-12 rounded-md" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-4 w-14 rounded-md" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Sk className="ml-auto h-3 w-14 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Sk className="h-5 w-48 rounded-md" />
          <Sk className="h-9 w-36 rounded-lg" />
        </div>
        <Sk className="mt-2 h-3 w-full max-w-md rounded-md" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <th key={i} scope="col" className="px-3 py-2">
                    <Sk className="h-2.5 w-12 rounded" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((r) => (
                <tr key={r}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                    <td key={c} className="px-3 py-2.5">
                      <Sk className="h-3 w-full rounded-md" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4 sm:p-5">
        <Sk className="h-5 w-52 rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-2xl rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-xl rounded-md" />
        <Sk className="mt-4 h-[220px] w-full rounded-xl" />
      </section>

      <section className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4 sm:p-5">
        <Sk className="h-5 w-48 rounded-md" />
        <Sk className="mt-2 h-3 w-full max-w-lg rounded-md" />
        <Sk className="mt-4 h-[200px] w-full rounded-xl" />
      </section>
    </div>
  );
}
