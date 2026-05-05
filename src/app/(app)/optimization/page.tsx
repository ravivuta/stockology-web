"use client";

import Link from "next/link";

export default function OptimizationPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Optimization</h1>
      <p className="text-sm text-subtle">
        In the mobile app, Optimization runs scenario tuning against your watchlist and logs suggested trades. On the web, use{" "}
        <Link href="/simulation" className="ui-hover-text text-primary underline">
          Simulation
        </Link>{" "}
        for horizon-style checks and the refresh tools on{" "}
        <Link href="/dashboard" className="ui-hover-text text-primary underline">
          Dashboard
        </Link>{" "}
        /{" "}
        <Link href="/portfolio" className="ui-hover-text text-primary underline">
          Portfolio
        </Link>{" "}
        for quotes and recommendations. While the web app is open, quotes auto-refresh about every 5 minutes in the browser.
      </p>
      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-6 text-sm text-subtle">
        <p className="font-medium text-foreground">Coming next</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Full optimization trade log, matching the mobile Optimization screen</li>
          <li>Server-side optimization jobs so long runs don’t tie up your device</li>
        </ul>
      </div>
    </div>
  );
}
