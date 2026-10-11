"use client";

import Link from "next/link";

/** Simulation entry shown to the left of the Stocks PM logo on the Portfolio tab. */
export function PortfolioSimulateLink() {
  return (
    <Link
      href="/simulation#watchlist-simulation"
      aria-label="Simulate (App Strategy)"
      title="Simulate (App Strategy)"
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-2 text-[11px] font-semibold tracking-wide text-primary transition-colors hover:bg-primary/15 dark:text-[color-mix(in_srgb,var(--theme-primary)_78%,white)]"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path d="M4 16.5L8.2 12.2L11.2 14.4L16.8 8.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.6 8.2H16.8V11.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Simulate
    </Link>
  );
}
