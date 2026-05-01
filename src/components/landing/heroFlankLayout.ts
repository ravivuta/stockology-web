/** Fixed height so left/right hero flank cards stay aligned; kept shorter so they read as “ambient” not competing with hero copy. */
export const HERO_FLANK_CARD_H = "h-[23.5rem] xl:h-[25rem]";

/** Vertically center both flanks with the hero block (parent is the full hero min-height). */
export const HERO_FLANK_V_ALIGN = "top-1/2 -translate-y-1/2" as const;

/** Narrower cards + hug the viewport edges — more clearance around center headline. */
export const HERO_FLANK_OUTER_W = "w-[min(46vw,26rem)] xl:w-[min(42vw,27.5rem)]" as const;

/** Less inward shift than before: graphics stay “just out of reach” of the center text. */
export const HERO_FLANK_TRANSLATE_L =
  "translate-x-6 sm:translate-x-8 lg:translate-x-10 xl:translate-x-12 2xl:translate-x-14" as const;

export const HERO_FLANK_TRANSLATE_R =
  "-translate-x-6 sm:-translate-x-8 lg:-translate-x-10 xl:-translate-x-12 2xl:-translate-x-14" as const;
