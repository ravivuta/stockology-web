"use client";

import { useId } from "react";
import {
  HERO_FLANK_CARD_H,
  HERO_FLANK_OUTER_W,
  HERO_FLANK_V_ALIGN,
  HERO_FLANK_TRANSLATE_L,
  HERO_FLANK_TRANSLATE_R,
} from "@/components/landing/heroFlankLayout";
import { LandingHeroFlankRightPanels } from "@/components/landing/LandingHeroFlankRightPanels";
import { LandingHeroPreviewChartSection } from "@/components/landing/LandingHeroPreviewPanels";

/** Same width/height shells for both sides; inner masks handle fade. */
const flankCardShellShared = `flex w-full min-w-0 flex-col rounded-2xl border border-white/[0.1] bg-zinc-950/92 shadow-[0_32px_90px_-36px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md xl:rounded-3xl ${HERO_FLANK_CARD_H} min-h-0`;

const flankCardShellRight = `${flankCardShellShared} overflow-hidden`;

const flankCardShellLeft = `${flankCardShellShared} overflow-visible`;

/**
 * Mirrored fades: solid band reaches further toward center, then soft falloff (matches left ↔ right).
 * 90deg: outer left → center right; 270deg: outer right → center left.
 */
/** Fade starts earlier toward center so less UI sits under the headline. */
const fadeChartTowardCenter = {
  WebkitMaskImage:
    "linear-gradient(90deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,1) 3%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.45) 64%, rgba(0,0,0,0.18) 78%, rgba(0,0,0,0.05) 88%, transparent 100%)",
  maskImage:
    "linear-gradient(90deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,1) 3%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.45) 64%, rgba(0,0,0,0.18) 78%, rgba(0,0,0,0.05) 88%, transparent 100%)",
} as const;

const fadeHoldingsTowardCenter = {
  WebkitMaskImage:
    "linear-gradient(270deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,1) 3%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.45) 64%, rgba(0,0,0,0.18) 78%, rgba(0,0,0,0.05) 88%, transparent 100%)",
  maskImage:
    "linear-gradient(270deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,1) 3%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.45) 64%, rgba(0,0,0,0.18) 78%, rgba(0,0,0,0.05) 88%, transparent 100%)",
} as const;

export function LandingHeroAmbientWatermarks({ active }: { active: boolean }) {
  const uid = useId().replace(/:/g, "");

  if (!active) return null;

  const flankOuter = `absolute ${HERO_FLANK_V_ALIGN} ${HERO_FLANK_OUTER_W} min-w-0 shrink-0 will-change-transform`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[11] hidden overflow-visible lg:block"
      aria-hidden
    >
      <div className={`${flankOuter} left-0 ${HERO_FLANK_TRANSLATE_L}`} style={fadeChartTowardCenter}>
        <div className={flankCardShellLeft}>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-emerald-400/25 via-white/20 to-transparent" />
          <LandingHeroPreviewChartSection chartId={`${uid}chart`} variant="heroFlank" />
        </div>
      </div>

      <div className={`${flankOuter} right-0 ${HERO_FLANK_TRANSLATE_R}`} style={fadeHoldingsTowardCenter}>
        <div className={flankCardShellRight}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-cyan-400/20 via-white/12 to-transparent" />
          <LandingHeroFlankRightPanels />
        </div>
      </div>
    </div>
  );
}
