"use client";

import { Fragment } from "react";
import { motion, useReducedMotion, type MotionValue } from "framer-motion";
import {
  ArrowRight,
  Compass,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const PERSONALIZED_MANAGEMENT_STEPS = [
  {
    icon: Wallet,
    title: "Grounded in your book",
    body: "Everything keys off the positions, cash, and watchlist you actually track—not a demo portfolio or static template.",
    micro: "Real holdings context",
  },
  {
    icon: SlidersHorizontal,
    title: "Parameters that follow you",
    body: "Targets, moving averages, and bands stay tied to your allocation as it shifts, so the math behind hints doesn’t go stale.",
    micro: "Dynamic thresholds",
  },
  {
    icon: Compass,
    title: "A clearer strategy frame",
    body: "See a consistent, rules-based read on adds, trims, and when to wait—built to support disciplined trading decisions you still control.",
    micro: "Rules-first clarity",
  },
] as const;

const inViewSoft = { once: true, amount: 0.2, margin: "0px 0px -40px 0px" } as const;
const easeOut = [0.22, 1, 0.36, 1] as const;

const flowNodes = [
  { label: "Your book", sub: "Holdings · cash · list" },
  { label: "Your rules", sub: "Targets & averages" },
  { label: "Hints", sub: "Same logic app-wide" },
] as const;

const paramRows = [
  {
    icon: Target,
    label: "Targets & bands",
    detail: "Buy, trim, and wait zones reflect the weights and averages you set.",
  },
  {
    icon: SlidersHorizontal,
    label: "Recalibrated as you trade",
    detail: "As sizes and cash change, the framework updates so signals stay in context.",
  },
  {
    icon: Sparkles,
    label: "One strategy thread",
    detail: "Dashboard, news, and recommendations pull from the same rule stack—not mixed defaults.",
  },
] as const;

const trustPills = ["Portfolio-aware", "Your rules drive the math", "Web + iOS parity"] as const;

function StrategyAdaptPreviewCard({ className, tourDense }: { className?: string; tourDense?: boolean }) {
  if (tourDense) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-zinc-900/95 via-zinc-900/98 to-[#1a1f2c] shadow-[0_20px_50px_-36px_rgba(10,12,18,0.72),inset_0_1px_0_rgba(255,255,255,0.05)]",
          className
        )}
      >
        <div className="relative px-3 py-3 sm:px-3.5 sm:py-3.5">
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/[0.12] ring-1 ring-emerald-400/20">
              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-300/90" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Adaptive parameters</p>
              <p className="truncate text-xs font-semibold text-zinc-100">Strategy follows your book</p>
            </div>
            <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-500/[0.07] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200/90">
              In sync
            </span>
          </div>
          <p className="mt-2.5 text-center text-[10px] leading-snug text-zinc-500">
            <span className="text-zinc-300">Your book</span>
            <span className="mx-1.5 text-zinc-600">→</span>
            <span className="text-zinc-300">Your rules</span>
            <span className="mx-1.5 text-zinc-600">→</span>
            <span className="text-zinc-300">Hints</span>
          </p>
          <ul className="mt-2.5 space-y-1.5" aria-hidden>
            {paramRows.slice(0, 2).map((row) => {
              const RowIcon = row.icon;
              return (
                <li
                  key={row.label}
                  className="flex gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
                >
                  <RowIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/80" strokeWidth={1.5} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-zinc-200">{row.label}</p>
                    <p className="text-[9px] leading-snug text-zinc-500 line-clamp-2">{row.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[9px] leading-snug text-zinc-500">
            <span className="font-medium text-zinc-400">You trade.</span> Parameters stay aligned with your portfolio—not autopilot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-zinc-900/95 via-zinc-900/98 to-[#1a1f2c] shadow-[0_32px_90px_-40px_rgba(10,12,18,0.75),inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-1/4 -top-1/3 h-[85%] w-[85%] rounded-full opacity-[0.45]"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(52,211,153,0.14), transparent 55%), radial-gradient(circle at 70% 60%, rgba(34,211,238,0.09), transparent 50%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04)_0%,transparent_42%,transparent_58%,rgba(255,255,255,0.02)_100%)]" aria-hidden />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.12] ring-1 ring-emerald-400/20">
              <SlidersHorizontal className="h-4 w-4 text-emerald-300/90" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Adaptive parameters</p>
              <p className="truncate text-sm font-semibold tracking-tight text-zinc-100 sm:whitespace-normal">
                Strategy context follows your portfolio
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/22 bg-cyan-500/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/45 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </span>
            In sync
          </span>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">How it lines up</p>
        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-stretch sm:justify-between sm:gap-2" aria-hidden>
          {flowNodes.map((n, i) => (
            <Fragment key={n.label}>
              <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#1a1d28]/55 px-3 py-2.5 text-left sm:px-3.5">
                <p className="text-xs font-semibold text-zinc-100">{n.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{n.sub}</p>
              </div>
              {i < flowNodes.length - 1 && (
                <>
                  <div className="flex shrink-0 items-center justify-center py-1 sm:px-0.5 sm:py-0" aria-hidden>
                    <ArrowRight className="hidden h-4 w-4 text-emerald-500/50 sm:block" strokeWidth={1.75} />
                    <div className="h-px w-full max-w-[4rem] bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent sm:hidden" />
                  </div>
                </>
              )}
            </Fragment>
          ))}
        </div>

        <ul className="mt-6 space-y-3" aria-hidden>
          {paramRows.map((row) => {
            const RowIcon = row.icon;
            return (
              <li
                key={row.label}
                className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:px-3.5 sm:py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.1] ring-1 ring-emerald-400/15">
                  <RowIcon className="h-4 w-4 text-emerald-300/85" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-200">{row.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 sm:text-xs">{row.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-emerald-400/12 bg-emerald-500/[0.04] px-3 py-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/80" strokeWidth={1.5} aria-hidden />
          <p className="text-[12px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-300">Not autopilot.</span> You set the rules; the app keeps parameters and
            framing aligned with your book so each screen speaks the same strategy language.
          </p>
        </div>
      </div>
    </div>
  );
}

function TimelineSteps({
  reduce,
  stepMotion,
  compact,
  tourUltraCompact,
}: {
  reduce: boolean;
  compact?: boolean;
  tourUltraCompact?: boolean;
  /** Optional per-step motion `y` for scroll tour */
  stepMotion?: readonly [MotionValue<number>, MotionValue<number>, MotionValue<number>];
}) {
  return (
    <div className={cn("relative", compact ? "pl-0" : "pl-1 sm:pl-2")}>
      {!compact && (
        <div
          className="pointer-events-none absolute left-[1.15rem] top-10 bottom-10 hidden w-px bg-gradient-to-b from-emerald-400/55 via-cyan-400/25 to-transparent sm:block sm:left-[1.35rem]"
          aria-hidden
        />
      )}
      <ul className={cn(tourUltraCompact ? "space-y-2" : "space-y-4 sm:space-y-5")}>
        {PERSONALIZED_MANAGEMENT_STEPS.map((s, i) => {
          const Icon = s.icon;
          const inner = (
            <div
              className={cn(
                "relative rounded-2xl border border-white/[0.08] bg-zinc-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_48px_-36px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.03] transition-[border-color,transform,box-shadow] duration-300",
                tourUltraCompact
                  ? "p-2.5 sm:p-3"
                  : "p-4 sm:p-5 hover:-translate-y-0.5 hover:border-emerald-400/18 hover:shadow-[0_20px_56px_-32px_rgba(34,197,94,0.12)]"
              )}
            >
              {!compact && (
                <span
                  className="absolute -left-1 top-1/2 hidden h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#101219] bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.45)] sm:block sm:-left-[0.05rem]"
                  aria-hidden
                />
              )}
              <div className={cn("flex items-start", tourUltraCompact ? "gap-2.5" : "gap-4")}>
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 ring-1 ring-emerald-400/20",
                    tourUltraCompact ? "h-8 w-8" : "h-11 w-11"
                  )}
                >
                  <Icon
                    className={cn("text-emerald-200/95", tourUltraCompact ? "h-3.5 w-3.5" : "h-5 w-5")}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70">{s.micro}</span>
                  </div>
                  <h3
                    className={cn(
                      "font-semibold tracking-tight text-white",
                      tourUltraCompact ? "mt-0.5 text-xs sm:text-sm" : compact ? "mt-1 text-base" : "mt-1.5 text-lg"
                    )}
                  >
                    {s.title}
                  </h3>
                  <p
                    className={cn(
                      "leading-snug text-zinc-500",
                      tourUltraCompact
                        ? "mt-0.5 text-[9px] sm:text-[10px] line-clamp-2"
                        : compact
                          ? "mt-1 text-xs sm:text-sm"
                          : "mt-2 text-sm"
                    )}
                  >
                    {s.body}
                  </p>
                </div>
              </div>
            </div>
          );

          if (stepMotion) {
            return (
              <motion.li key={s.title} className="list-none" style={{ y: stepMotion[i] }}>
                {inner}
              </motion.li>
            );
          }

          return (
            <motion.li
              key={s.title}
              className="list-none"
              initial={reduce ? false : { opacity: 0, x: -12 }}
              whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
              viewport={inViewSoft}
              transition={{ duration: 0.45, delay: i * 0.08, ease: easeOut }}
            >
              {inner}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** Scroll-tour panel (narrow) — uses parent motion values for step lift-in. */
export function LandingPersonalizedScrollPanel({
  introY,
  stepYs,
  headlineClass,
  bodyClass,
  tourUltraCompact,
}: {
  introY: MotionValue<number>;
  stepYs: readonly [MotionValue<number>, MotionValue<number>, MotionValue<number>];
  headlineClass: string;
  bodyClass: string;
  /** Single-screen tour: tighter layout so beat 4 fits without inner scroll. */
  tourUltraCompact?: boolean;
}) {
  const reduce = useReducedMotion();
  const h2Class = tourUltraCompact
    ? "text-balance text-lg font-bold tracking-tight text-white sm:text-xl md:text-2xl"
    : headlineClass;
  const introBodyClass = tourUltraCompact
    ? "text-pretty text-xs leading-relaxed text-zinc-400 sm:text-sm"
    : bodyClass;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl px-2 sm:px-3",
        tourUltraCompact ? "py-1 sm:py-2" : "py-4 sm:py-6"
      )}
    >
      <motion.div className="text-center" style={{ y: introY }}>
        <div className="flex justify-center">
          <p
            className={cn(
              "inline-flex items-center gap-2 font-semibold uppercase tracking-[0.18em] text-emerald-400/90",
              tourUltraCompact ? "mb-1 text-[9px] sm:text-[10px]" : "mb-2 gap-2.5 text-[10px] sm:mb-3 sm:text-[11px]"
            )}
          >
            <span
              className={cn("h-px bg-gradient-to-r from-emerald-400/50 to-transparent", tourUltraCompact ? "w-5 sm:w-6" : "w-6 sm:w-8")}
              aria-hidden
            />
            Personalized management
          </p>
        </div>
        <h2 className={cn(h2Class, "mt-0.5")}>Parameters that stay in step</h2>
        <p className={cn("mx-auto max-w-lg px-1", introBodyClass, tourUltraCompact ? "mt-1.5" : "mt-3")}>
          {tourUltraCompact
            ? "Thresholds follow your book as it changes—rules-based hints, not autopilot."
            : "Strategy framing and thresholds adapt to your actual portfolio—so hints stay coherent as you trade, without pretending to run the book for you."}
        </p>
        <div
          className={cn(
            "mx-auto flex max-w-md flex-wrap justify-center gap-1.5",
            tourUltraCompact ? "mt-2" : "mt-5 gap-2"
          )}
        >
          {trustPills.map((t) => (
            <span
              key={t}
              className={cn(
                "rounded-full border border-white/[0.08] bg-white/[0.03] font-semibold uppercase tracking-wider text-zinc-400",
                tourUltraCompact ? "px-2 py-0.5 text-[8px] sm:text-[9px]" : "px-3 py-1 text-[10px]"
              )}
            >
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      <div
        className={cn(
          "grid",
          tourUltraCompact ? "mt-3 grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4" : "mt-8 gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-6"
        )}
      >
        <div className={tourUltraCompact ? "min-w-0 lg:col-span-5 lg:order-2" : "lg:col-span-5 lg:order-2"}>
          <TimelineSteps reduce={!!reduce} compact tourUltraCompact={tourUltraCompact} stepMotion={stepYs} />
        </div>
        <div className={cn("min-w-0", tourUltraCompact ? "lg:col-span-7 lg:order-1" : "lg:col-span-7 lg:order-1")}>
          <StrategyAdaptPreviewCard tourDense={tourUltraCompact} className={tourUltraCompact ? "h-full" : "h-full min-h-[200px]"} />
        </div>
      </div>
    </div>
  );
}

/** Full-width landing section below the fold. */
export function LandingPersonalizedManagementSection({ reduce }: { reduce: boolean }) {
  const headline =
    "text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.35rem] md:leading-[1.12]";
  const body = "text-pretty text-[15px] leading-relaxed text-zinc-400 sm:text-base";

  return (
    <>
      <motion.div
        className="mx-auto max-w-2xl px-2 text-center sm:px-3"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={inViewSoft}
        transition={{ duration: 0.48, ease: easeOut }}
      >
        <div className="flex justify-center">
          <p className="mb-2 inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90 sm:text-[12px]">
            <span className="h-px w-8 bg-gradient-to-r from-emerald-400/50 to-transparent" aria-hidden />
            Personalized management
          </p>
        </div>
        <h2 className={`${headline} mt-1`}>Parameters that stay in step</h2>
        <p className={`mt-4 ${body}`}>
          Targets, averages, and guardrails stay tied to your book as it changes—so you get a consistent rules-based frame for
          decisions across the app, without features we don’t actually ship.
        </p>
        <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {trustPills.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="mt-12 grid gap-8 px-2 sm:px-3 lg:mt-16 lg:grid-cols-12 lg:items-start lg:gap-10"
        initial={reduce ? false : { opacity: 0, y: 20 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={inViewSoft}
        transition={{ duration: 0.5, delay: 0.06, ease: easeOut }}
      >
        <div className="min-w-0 lg:col-span-7">
          <StrategyAdaptPreviewCard />
        </div>
        <div className="lg:col-span-5">
          <TimelineSteps reduce={reduce} />
        </div>
      </motion.div>
    </>
  );
}
