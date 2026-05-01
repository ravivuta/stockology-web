"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, type MotionValue } from "framer-motion";
import { TransitionLink } from "@/components/TransitionLink";
import { ArrowRight, Sparkles } from "lucide-react";
import { LandingHeroAmbientWatermarks } from "@/components/landing/LandingHeroAmbientWatermarks";
import { LandingAmbientBackground } from "@/components/landing/LandingAmbientBackground";
import { CssMarqueeRibbon } from "@/components/landing/CssMarqueeRibbon";
import { LandingProductDepth } from "@/components/landing/LandingProductDepth";
import { LandingTutorialJourney } from "@/components/landing/LandingTutorialJourney";
import { appCtaButton } from "@/lib/appCtaClasses";

const LineWaves = dynamic(() => import("@/components/landing/LineWaves"), { ssr: false });

/** Shared landing ease — smooth deceleration, no snap at the end */
const ease = [0.33, 1, 0.68, 1] as const;

/** Once + generous root margin so below-fold content resolves before it feels “missing”. */
const scrollAppearViewport = {
  once: true as const,
  amount: 0.06 as const,
  margin: "140px 0px 100px 0px" as const,
};

/** Single in-view root for the CTA card (stagger lives on visible transition). */
const ctaBlockVariants = {
  hidden: { opacity: 0, y: 26, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.62, ease, staggerChildren: 0.095, delayChildren: 0.2 },
  },
};

const ctaReduced = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
};

const ctaChild = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.56, ease } },
};

const disclaimerVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease } },
};

/** Slim fixed chrome: read progress + minimal nav (outside scroll-lock root → viewport-stable). */
function LandingMarketingTopChrome({
  scrollSmoothed,
  hasSession,
}: {
  scrollSmoothed: MotionValue<number>;
  hasSession: boolean;
}) {
  const linkQuiet =
    "no-ui-hover rounded-md px-2 py-1.5 text-[13px] font-medium text-zinc-500 no-underline transition-colors hover:text-zinc-200";
  const pillOutline =
    "no-ui-hover rounded-full border border-emerald-400/35 bg-transparent px-3.5 py-1.5 text-[13px] font-semibold text-zinc-100 no-underline shadow-[0_0_20px_-8px_rgba(52,211,153,0.35)] transition-colors hover:border-emerald-400/55 hover:bg-emerald-500/[0.08]";

  return (
    <div
      className="landing-marketing-top-chrome pointer-events-none fixed left-0 right-0 top-0 z-[120]"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <motion.div
        className="pointer-events-none h-px w-full origin-left bg-gradient-to-r from-emerald-400/90 via-cyan-400/75 to-fuchsia-500/60 will-change-transform"
        style={{ scaleX: scrollSmoothed }}
        aria-hidden
      />
      <header
        className="pointer-events-auto border-b border-white/[0.05] bg-[#101219]/55 backdrop-blur-xl supports-[backdrop-filter]:bg-[#101219]/45"
        role="banner"
      >
        <div className="mx-auto flex h-10 max-w-6xl items-center justify-between gap-3 px-4 sm:h-11 sm:px-6">
          <Link href="/" className="group flex min-w-0 items-center gap-2 no-underline">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/[0.12] ring-1 ring-emerald-400/20"
              aria-hidden
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400/90" strokeWidth={2} />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-white sm:text-base">
              Stocks{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">PM</span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Marketing">
            {hasSession ? (
              <TransitionLink href="/dashboard" prefetch={false} className={pillOutline}>
                Dashboard
              </TransitionLink>
            ) : (
              <>
                <TransitionLink href="/login" prefetch={false} className={linkQuiet}>
                  Sign in
                </TransitionLink>
                <TransitionLink href="/signup" prefetch={false} className={pillOutline}>
                  Sign up
                </TransitionLink>
              </>
            )}
          </nav>
        </div>
      </header>
    </div>
  );
}

export function Landing({ hasSession }: { hasSession: boolean }) {
  const reduce = useReducedMotion();
  const landingScrollLockRootRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const scrollSmoothed = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.42 });

  const heroPrimaryCtaClass = appCtaButton(
    "group no-ui-hover px-8 py-3.5 text-base no-underline transition-transform duration-300 hover:scale-[1.02]"
  );

  const primaryCta = hasSession ? (
    <TransitionLink href="/dashboard" prefetch={false} className={heroPrimaryCtaClass}>
      Open app
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </TransitionLink>
  ) : (
    <TransitionLink href="/signup" prefetch={false} className={heroPrimaryCtaClass}>
      Start free
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </TransitionLink>
  );

  return (
    <div className="landing-marketing relative isolate min-h-screen overflow-x-hidden text-zinc-100">
      <LandingMarketingTopChrome scrollSmoothed={scrollSmoothed} hasSession={hasSession} />
      <div ref={landingScrollLockRootRef} className="relative min-h-screen">
      <LandingAmbientBackground />
      <main className="relative z-10">
        {/* Line waves + scrims only behind hero + ribbon band */}
        <div className="relative isolate overflow-hidden">
          <div
            className={`pointer-events-none absolute inset-0 z-0 ${reduce ? "opacity-0" : "opacity-100"}`}
            aria-hidden
          >
            {!reduce && (
              <LineWaves
                speed={0.18}
                innerLineCount={14}
                outerLineCount={20}
                warpIntensity={0.28}
                rotation={-42}
                edgeFadeWidth={0.12}
                colorCycleSpeed={0.55}
                brightness={0.085}
                color1="#4ade80"
                color2="#3f3f46"
                color3="#22c55e"
                enableMouseInteraction={false}
                mouseInfluence={0.85}
              />
            )}
          </div>

          {/* Vignette: center readable; edges a touch lighter for flanking UI */}
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-[#101219]/78 via-[#101219]/42 via-48% to-[#101219]/90"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_76%_84%_at_50%_42%,rgba(15,17,24,0.92),rgba(15,17,24,0.38)_58%,rgba(15,17,24,0.12)_70%,transparent_78%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_85%_50%_at_50%_-12%,rgba(34,197,94,0.05),transparent_58%)]"
            aria-hidden
          />

          <div className="relative">
          {/* Hero: copy z-10; flanking graphics z-11 (after section in DOM) sit over faded overlap */}
          <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.5rem+min(10vh,5rem))] max-w-6xl flex-col px-4 pb-16 pt-[calc(3rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-20 sm:pt-[calc(3.25rem+env(safe-area-inset-top,0px))] lg:pt-[calc(3.5rem+env(safe-area-inset-top,0px))]">
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-9 sm:gap-11">
              <div className="flex w-full flex-col items-center text-center">
                <motion.h1
                  className="text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[2.65rem] lg:leading-[1.1] xl:text-6xl"
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.72, ease, delay: 0.04 }}
                >
                  <span className="text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.92),0_14px_56px_rgba(0,0,0,0.62),0_0_2px_rgba(0,0,0,0.95)]">
                    Transform your portfolio into a{" "}
                    <span className="text-emerald-300 [text-shadow:0_0_28px_rgba(52,211,153,0.5),0_2px_4px_rgba(0,0,0,0.85)]">
                      system
                    </span>
                    .
                  </span>
                </motion.h1>

                <motion.div
                  className="relative mx-auto mt-7 w-full max-w-xl rounded-2xl border border-white/[0.09] bg-[#1a1d28]/65 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_80px_-20px_rgba(10,12,18,0.65)] backdrop-blur-xl sm:mt-8 sm:p-6"
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.62, ease, delay: 0.12 }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40"
                    style={{
                      background:
                        "radial-gradient(120% 80% at 50% -20%, rgba(52, 211, 153, 0.12), transparent 55%)",
                    }}
                    aria-hidden
                  />
                  <p className="relative text-pretty text-center text-base font-medium leading-relaxed text-zinc-100/95 sm:text-lg sm:leading-relaxed">
                    Manage, allocate, and invest with precision.
                  </p>
                </motion.div>
              </div>

              <motion.div
                className="flex w-full max-w-xl flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5"
                initial={reduce ? false : { opacity: 0, y: 13 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.62, ease, delay: 0.2 }}
              >
                {primaryCta}
                {!hasSession && (
                  <TransitionLink
                    href="/login"
                    prefetch={false}
                    className="no-ui-hover text-sm font-semibold text-zinc-400 no-underline underline-offset-4 transition-colors hover:text-white"
                  >
                    Already have an account?
                  </TransitionLink>
                )}
              </motion.div>
            </div>
          </section>
          <LandingHeroAmbientWatermarks active={!reduce} />
          </div>

        </div>

        {!reduce && (
          <section className="relative z-10 overflow-hidden border-y border-white/[0.04] bg-gradient-to-b from-[#0e1118]/95 via-[#0b0e15]/92 to-[#0a0d12]/95 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[6px] sm:py-6">
            <div
              className="pointer-events-none absolute inset-x-0 -top-14 h-14 bg-gradient-to-b from-[#101219] to-transparent opacity-90"
              aria-hidden
            />
            <div className="landing-marquee-atmosphere" aria-hidden />
            <div className="landing-mesh-fine opacity-[0.4]" aria-hidden />
            <div className="landing-lower-grid opacity-[0.08]" aria-hidden />
            <div className="landing-texture-grain opacity-[0.042]" aria-hidden />
            <div className="relative z-10">
              <CssMarqueeRibbon
                row1="Allocation · Watchlist · Fundamentals"
                row2="Diversification · Position sizing · Cost basis · Rebalancing"
                textClassName="text-3xl font-semibold tracking-tight md:text-5xl bg-gradient-to-r from-emerald-200/90 via-white to-cyan-200/90 bg-clip-text text-transparent"
              />
            </div>
          </section>
        )}

        {reduce && (
          <section className="relative z-10 overflow-hidden border-y border-white/[0.04] bg-gradient-to-b from-[#0e1118]/95 to-[#0a0d12]/95 py-6 backdrop-blur-[6px]">
            <div className="landing-marquee-atmosphere opacity-80" aria-hidden />
            <div className="landing-mesh-fine opacity-[0.35]" aria-hidden />
            <p className="relative z-10 text-center text-sm text-zinc-600">
              Allocation · Watchlist · Fundamentals · Diversification · Position sizing · Cost basis · Rebalancing
            </p>
          </section>
        )}

        {/* Product story: wheel-driven chapters (touch: long-scroll fallback inside LandingProductDepth) */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-[#090c11]/65 via-transparent to-transparent"
            aria-hidden
          />
          <div className="landing-lower-slab" aria-hidden />
          <div className="landing-lower-grid" aria-hidden />
          <div className="landing-lower-glow" aria-hidden />
          <div className="landing-texture-grain" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.018] via-transparent to-[#070a10]/55"
            aria-hidden
          />
          {!reduce && (
            <motion.div
              className="pointer-events-none mx-auto mb-10 mt-2 h-[2px] max-w-md origin-center rounded-full bg-gradient-to-r from-transparent via-emerald-400/45 to-transparent shadow-[0_0_20px_rgba(52,211,153,0.25)] sm:mb-12 sm:max-w-lg"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.15, margin: "80px 0px" }}
              transition={{ duration: 0.9, ease }}
              aria-hidden
            />
          )}

          <LandingProductDepth reduce={reduce ?? false} scrollLockRootRef={landingScrollLockRootRef} />

          <LandingTutorialJourney reduce={reduce ?? false} />

          {/* CTA band */}
          <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
            <div className="landing-cta-halo" aria-hidden />
            <div
              className="pointer-events-none absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent sm:inset-x-16"
              aria-hidden
            />
              <div className="relative w-full rounded-[28px] border border-white/10 bg-landing-raised shadow-[0_32px_80px_-24px_rgba(10,12,18,0.58)]">
                <motion.div
                  className="flex w-full flex-col items-center gap-6 px-6 py-14 text-center sm:px-12 sm:py-16"
                  variants={reduce ? ctaReduced : ctaBlockVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={scrollAppearViewport}
                >
                  <motion.h2
                    className="max-w-lg text-2xl font-bold tracking-tight text-white sm:text-3xl"
                    variants={reduce ? { hidden: { opacity: 1 }, visible: { opacity: 1 } } : ctaChild}
                  >
                    Get started
                  </motion.h2>
                  <motion.p
                    className="max-w-md text-sm text-zinc-500"
                    variants={reduce ? { hidden: { opacity: 1 }, visible: { opacity: 1 } } : ctaChild}
                  >
                    No card required for the basics.
                  </motion.p>
                  <motion.div
                    className="flex flex-wrap items-center justify-center gap-3"
                    variants={reduce ? { hidden: { opacity: 1 }, visible: { opacity: 1 } } : ctaChild}
                  >
                    {hasSession ? (
                      <TransitionLink
                        href="/dashboard"
                        prefetch={false}
                        className={appCtaButton("no-ui-hover gap-2 px-6 py-3 text-sm no-underline")}
                      >
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </TransitionLink>
                    ) : (
                      <>
                        <TransitionLink
                          href="/signup"
                          prefetch={false}
                          className={appCtaButton("no-ui-hover gap-2 px-6 py-3 text-sm no-underline")}
                        >
                          Create account
                          <ArrowRight className="h-4 w-4" />
                        </TransitionLink>
                        <TransitionLink
                          href="/login"
                          prefetch={false}
                          className="no-ui-hover rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/10"
                        >
                          Sign in
                        </TransitionLink>
                      </>
                    )}
                  </motion.div>
                </motion.div>
              </div>

            <motion.p
              className="mt-10 text-center text-xs leading-relaxed text-zinc-600"
              variants={disclaimerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={scrollAppearViewport}
            >
              No trades or money movement. Educational only—not investment advice. Companion to the Stocks PM iOS app.
            </motion.p>
          </section>
        </div>
      </main>
      </div>
    </div>
  );
}
