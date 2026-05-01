"use client";

import { useId } from "react";
import {
  LandingHeroPreviewChartSection,
  LandingHeroPreviewHoldingsTargetsSection,
} from "@/components/landing/LandingHeroPreviewPanels";

/**
 * Full-width illustrative dashboard slab (e.g. below hero or marketing sections).
 */
export function LandingHeroProductPreview() {
  const uid = useId().replace(/:/g, "");

  return (
    <div className="relative w-full max-w-5xl">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[min(100%,42rem)] -translate-x-1/2 rounded-full bg-emerald-500/[0.12] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent sm:left-12 sm:right-12"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-zinc-950/85 shadow-[0_32px_100px_-36px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:rounded-3xl">
        <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-white/[0.06]">
          <div className="flex flex-col">
            <LandingHeroPreviewChartSection chartId={`${uid}full`} />
          </div>
          <div className="flex flex-col border-t border-white/[0.06] lg:border-t-0">
            <LandingHeroPreviewHoldingsTargetsSection />
          </div>
        </div>

        <p className="border-t border-white/[0.06] px-4 py-2.5 text-center text-[10px] leading-relaxed text-zinc-600 sm:px-5">
          Illustrative only — not investment advice. Your real data and rules live in the app after you sign up.
        </p>
      </div>
    </div>
  );
}
