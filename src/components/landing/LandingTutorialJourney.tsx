"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ListPlus, Sparkles, TrendingUp, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

const inView = {
  once: true as const,
  amount: 0.15 as const,
  margin: "0px 0px -80px 0px" as const,
};

const steps = [
  {
    n: 1,
    title: "Add symbols to your watchlist",
    body:
      "Track what matters before you size a position—enter tickers manually or import a CSV with the same columns as the iOS app.",
    src: "/landing/setup-watchlist.png",
    alt: "Watchlist screen showing ticker rows and add-symbol controls.",
    imgW: 2504,
    imgH: 1476,
    Icon: ListPlus,
    accent: "cyan" as const,
  },
  {
    n: 2,
    title: "Record every trade",
    body:
      "Log buys and sells as they happen, or bulk-import history from CSV so cost basis, allocations, and charts stay honest.",
    src: "/landing/setup-portfolio.png",
    alt: "Portfolio screen with positions, trades, and import options.",
    imgW: 2504,
    imgH: 1476,
    Icon: WalletCards,
    accent: "emerald" as const,
  },
  {
    n: 3,
    title: "Receive sophisticated recommendations",
    body:
      "Signals grounded in your book and watchlist—plain-language rationale, suggested sizing context, and a feed that switches tone when your portfolio is already in good shape.",
    src: "/landing/recommended_actions.png",
    alt: "Recommended actions list with buy suggestions and explanatory copy.",
    imgW: 2294,
    imgH: 782,
    Icon: Sparkles,
    accent: "violet" as const,
  },
] as const;

const accentIconRing: Record<(typeof steps)[number]["accent"], string> = {
  cyan: "ring-cyan-400/35 shadow-[0_0_28px_-6px_rgba(34,211,238,0.4)]",
  emerald: "ring-emerald-400/35 shadow-[0_0_30px_-6px_rgba(52,211,153,0.45)]",
  violet: "ring-fuchsia-400/30 shadow-[0_0_28px_-6px_rgba(192,132,252,0.38)]",
};

const accentText: Record<(typeof steps)[number]["accent"], string> = {
  cyan: "text-cyan-300/95",
  emerald: "text-emerald-300/95",
  violet: "text-fuchsia-200/95",
};

const accentGlow: Record<(typeof steps)[number]["accent"], string> = {
  cyan: "bg-cyan-500/10",
  emerald: "bg-emerald-500/10",
  violet: "bg-fuchsia-500/10",
};

/** Outcomes chart card chrome only — height follows the image. */
const outcomesChartShell =
  "relative w-full overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#080b10] leading-none shadow-[0_32px_100px_-40px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04]";

function StepShot({
  src,
  alt,
  accent,
  reduce,
  width,
  height,
}: {
  src: string;
  alt: string;
  accent: (typeof steps)[number]["accent"];
  reduce: boolean;
  width: number;
  height: number;
}) {
  return (
    <motion.div
      className="group relative w-full min-w-0 [perspective:1200px]"
      initial={reduce ? false : { opacity: 0, scale: 0.985, y: 14 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.65, ease, delay: 0.06 }}
    >
      <div
        className={cn(
          "pointer-events-none absolute -inset-[2px] rounded-[22px] opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-95",
          accentGlow[accent]
        )}
        aria-hidden
      />
      <motion.div
        className="relative overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#080b10] leading-none shadow-[0_28px_90px_-32px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-white/[0.05] will-change-transform"
        whileHover={
          reduce
            ? undefined
            : {
                rotateX: 0.9,
                rotateY: -1.1,
                scale: 1.008,
                transition: { type: "spring", stiffness: 280, damping: 24 },
              }
        }
        style={{ transformStyle: "preserve-3d" as const }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-20 bg-gradient-to-b from-white/[0.05] to-transparent"
          aria-hidden
        />
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 720px"
          className="relative z-[1] block h-auto w-full max-w-full"
          priority={false}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-8 bg-gradient-to-t from-[#06080c]/75 to-transparent"
          aria-hidden
        />
      </motion.div>
    </motion.div>
  );
}

function TimelineRail({ progress }: { progress: MotionValue<number> }) {
  const h = useTransform(progress, [0, 1], ["8%", "100%"]);
  return (
    <div className="absolute left-[15px] top-2 bottom-2 hidden w-px overflow-hidden rounded-full bg-white/[0.08] sm:left-[19px] md:block" aria-hidden>
      <motion.div
        className="absolute left-0 top-0 w-full origin-top rounded-full bg-gradient-to-b from-cyan-400/90 via-emerald-400/85 to-fuchsia-400/70 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
        style={{ height: h }}
      />
    </div>
  );
}

export function LandingTutorialJourney({ reduce }: { reduce: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() || reduce;
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 0.75", "end 0.35"],
  });
  const progressSmooth = useSpring(scrollYProgress, {
    stiffness: reduceMotion ? 500 : 90,
    damping: reduceMotion ? 80 : 28,
    mass: 0.35,
  });

  const fade = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease } },
      };

  return (
    <div className="relative z-10 overflow-hidden">
      {/* Tint stacks on parent slab so the hand-off from the tour is soft, not a hard band */}
      <div className="landing-seam-down" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_42%_at_50%_-5%,rgba(52,211,153,0.07),transparent_52%),radial-gradient(ellipse_70%_48%_at_94%_28%,rgba(34,211,238,0.055),transparent_50%),linear-gradient(180deg,rgba(15,18,25,0.72)_0%,rgba(10,13,20,0.88)_38%,rgba(8,10,16,0.94)_100%)]"
        aria-hidden
      />
      <div className="landing-mesh-fine opacity-[0.55]" aria-hidden />
      <div className="landing-journey-dots" aria-hidden />
      <div className="landing-journey-sheen" aria-hidden />
      <div className="landing-texture-grain opacity-[0.045]" aria-hidden />
      <div className="relative">
        {/* Getting started path */}
        <section ref={trackRef} className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={fade}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/88">Begin here</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.4rem] md:leading-[1.1]">
              A short path from empty account to live intelligence
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Three deliberate steps—each one unlocks the next—so the product never feels like a blank dashboard.
            </p>
          </motion.div>

          <div className="relative mx-auto mt-16 max-w-6xl md:mt-20">
            {!reduceMotion && <TimelineRail progress={progressSmooth} />}

            <ol className="relative flex flex-col gap-16 md:gap-[4.25rem] md:pl-11 lg:pl-14">
              {steps.map((step, i) => {
                const flip = i % 2 === 1;
                const Icon = step.Icon;
                return (
                  <li
                    key={step.n}
                    className="relative grid min-w-0 gap-8 md:grid-cols-2 md:items-center md:gap-x-10 md:gap-y-0 lg:gap-x-12"
                  >
                    <div
                      className={cn(
                        "flex max-w-xl flex-col gap-5 md:max-w-none",
                        flip ? "md:order-2 md:justify-self-end md:pr-2 md:text-right" : "md:order-1 md:pl-2"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3",
                          flip ? "md:flex-row-reverse" : ""
                        )}
                      >
                        <motion.span
                          className={cn(
                            "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-zinc-950/80 text-white ring-2 ring-white/[0.06]",
                            accentText[step.accent],
                            accentIconRing[step.accent]
                          )}
                          initial={reduceMotion ? false : { scale: 0.85, opacity: 0 }}
                          whileInView={{ scale: 1, opacity: 1 }}
                          viewport={inView}
                          transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.05 }}
                        >
                          <Icon className="relative h-5 w-5" strokeWidth={1.75} aria-hidden />
                        </motion.span>
                        <div className={cn("min-w-0", flip ? "md:text-right" : "")}>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums tracking-widest text-zinc-400"
                            )}
                          >
                            Step {String(step.n).padStart(2, "0")}
                          </span>
                          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{step.title}</h3>
                        </div>
                      </div>
                      <motion.p
                        className={cn(
                          "text-pretty text-sm leading-relaxed text-zinc-400 sm:text-[15px] sm:leading-relaxed",
                          flip ? "md:ml-auto" : ""
                        )}
                        initial="hidden"
                        whileInView="visible"
                        viewport={inView}
                        variants={fade}
                      >
                        {step.body}
                      </motion.p>
                    </div>

                    <div className={cn("min-w-0 md:max-w-none", flip ? "md:order-1" : "md:order-2")}>
                      <StepShot
                        src={step.src}
                        alt={step.alt}
                        accent={step.accent}
                        reduce={reduceMotion}
                        width={step.imgW}
                        height={step.imgH}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Real trajectory */}
        <section className="relative overflow-hidden px-4 pb-28 pt-2 sm:px-6 md:pb-32">
          <div className="landing-seam-down opacity-80" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a0d12]/40 via-[#080b10]/95 to-[#06080d]/98"
            aria-hidden
          />
          <div className="landing-outcomes-veil" aria-hidden />
          <div className="landing-mesh-fine opacity-[0.45]" aria-hidden />
          <div className="landing-journey-dots opacity-[0.1]" aria-hidden />
          <div className="landing-texture-grain opacity-[0.04]" aria-hidden />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent"
            aria-hidden
          />
          <motion.div
            className="relative mx-auto max-w-3xl pt-14 text-center md:pt-20"
            initial="hidden"
            whileInView="visible"
            viewport={inView}
            variants={fade}
          >
            <p className="inline-flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400/90" aria-hidden />
              Outcomes
            </p>
            <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-[2.1rem] md:leading-[1.12]">
              Growth from a real account using these recommendations
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
              Past performance does not guarantee future results. The curves below are from an actual book followed in the app—not a
              mock ticker—so you can see how net worth and benchmark-relative return evolved together over time.
            </p>
          </motion.div>

          <div className="relative mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-6">
            {/* lg: flex row + items-center → vertical midpoints of the two cards line up; frames hug each image */}
            <div className="flex flex-col gap-6 lg:col-span-2 lg:flex-row lg:items-center lg:gap-10">
              <motion.div
                className="min-w-0 flex-1"
                initial="hidden"
                whileInView="visible"
                viewport={inView}
                variants={fade}
              >
                <div className={outcomesChartShell}>
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/[0.07] to-transparent"
                    aria-hidden
                  />
                  <Image
                    src="/landing/portfolio_graph.png"
                    alt="Line chart of portfolio net worth rising over several months."
                    width={1472}
                    height={518}
                    sizes="(max-width: 1024px) 100vw, calc(50vw - 1.5rem)"
                    className="relative z-[1] block h-auto w-full max-w-full"
                  />
                </div>
              </motion.div>
              <motion.div
                className="min-w-0 flex-1"
                initial="hidden"
                whileInView="visible"
                viewport={inView}
                variants={fade}
              >
                <div className={outcomesChartShell}>
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-orange-500/[0.06] to-transparent"
                    aria-hidden
                  />
                  <Image
                    src="/landing/portfolio-vs-spy-graph.png"
                    alt="Chart comparing portfolio cumulative return to S and P 500 over one year."
                    width={2288}
                    height={688}
                    sizes="(max-width: 1024px) 100vw, calc(50vw - 1.5rem)"
                    className="relative z-[1] block h-auto w-full max-w-full"
                  />
                </div>
              </motion.div>
            </div>

            <motion.div
              className="flex flex-col gap-1.5 px-0.5 pb-1"
              initial="hidden"
              whileInView="visible"
              viewport={inView}
              variants={fade}
            >
              <p className="text-sm font-medium leading-snug text-zinc-300">Net worth over time</p>
              <p className="min-h-[4.75rem] text-xs leading-relaxed text-zinc-500 sm:min-h-[4.5rem]">
                Total portfolio value in dollars—useful for feeling compounding between trades and after imports refresh.
              </p>
            </motion.div>

            <motion.div
              className="flex flex-col gap-1.5 px-0.5 pb-1"
              initial="hidden"
              whileInView="visible"
              viewport={inView}
              variants={fade}
            >
              <p className="text-sm font-medium leading-snug text-zinc-300">Return vs S&amp;P 500</p>
              <p className="min-h-[4.75rem] text-xs leading-relaxed text-zinc-500 sm:min-h-[4.5rem]">
                The same account on a percentage basis against SPY on your calendar—so &ldquo;keeping up&rdquo; is visible at a glance.
              </p>
            </motion.div>
          </div>
        </section>
        <div className="landing-seam-up" aria-hidden />
      </div>
    </div>
  );
}
