"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
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
import { APP_MANAGED_TRIAL_PERIOD } from "@/lib/trial-config";

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
            <Link href="/#features" className={linkQuiet + " hidden md:inline-flex"}>Features</Link>
            <Link href="/#pricing" className={linkQuiet + " hidden md:inline-flex"}>Pricing</Link>
            <Link href="/about" className={linkQuiet}>About</Link>
            <Link href="/contact" className={linkQuiet + " hidden sm:inline-flex"}>Contact</Link>
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

        {/* ── Company overview ── quick entry point before the long product story */}
        <section id="about-summary" className="relative z-10 border-b border-white/[0.05] bg-[#0d1018]/90 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-10 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">AppAiTech</p>
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">Built for everyday investors</h2>
                <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                  Stocks PM combines rules-based portfolio optimisation, backtesting simulation, and real-time market data into one accessible web app — companion to the Stocks PM iOS app.
                </p>
                <p className="mb-8 text-xs text-zinc-600">
                  ⚠️ Educational &amp; practice trading only. Not financial advice. No real money or actual trades involved.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/about" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-white/10">About us</Link>
                  <Link href="/contact" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-white/10">Contact</Link>
                  <Link href="/privacy" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-white/10">Privacy policy</Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: "📊", label: "Real-time dashboard" },
                  { icon: "⚙️", label: "Optimisation engine" },
                  { icon: "📈", label: "Backtesting & simulation" },
                  { icon: "⭐", label: "Watchlist management" },
                  { icon: "📍", label: "S&P 500 comparison" },
                  { icon: "🎯", label: "Smart filtering" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-medium text-zinc-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

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

          {/* ── Features ── */}
          <section id="features" className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <motion.h2
              className="mb-12 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={scrollAppearViewport}
              transition={{ duration: 0.6, ease }}
            >
              Powerful features built for investors
            </motion.h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: "📊", title: "Real-Time Dashboard", body: "Track your portfolio with live market data. Monitor holdings, gains/losses, and performance metrics all in one place." },
                { icon: "⚙️", title: "Optimization Engine", body: "Advanced optimization analyzes your portfolio and delivers data-driven buy/sell/hold recommendations tailored to your investments." },
                { icon: "📈", title: "Backtesting & Simulation", body: "Test investment strategies against years of historical data with paper trading. Practice risk-free before committing capital." },
                { icon: "⭐", title: "Watchlist Management", body: "Monitor stocks before investing. Create custom watchlists and analyze multiple symbols with advanced filtering." },
                { icon: "📍", title: "Portfolio Comparison", body: "Compare your portfolio performance against S&P 500 benchmarks. Understand how you're doing versus the market." },
                { icon: "🎯", title: "Smart Filtering", body: "Organize stocks by actionable recommendations, holdings, or custom filters. Focus on what matters most for your strategy." },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-emerald-400/20 hover:bg-white/[0.05]"
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={scrollAppearViewport}
                  transition={{ duration: 0.55, ease, delay: i * 0.06 }}
                >
                  <div className="mb-3 text-2xl">{f.icon}</div>
                  <h3 className="mb-2 text-base font-semibold text-white">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Screenshots ── */}
          <section className="relative overflow-hidden border-y border-white/[0.05] bg-white/[0.018] py-20 sm:py-28">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 className="mb-4 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">See Stocks PM in action</h2>
              <p className="mx-auto mb-12 max-w-xl text-center text-sm text-zinc-400">Manage your portfolio, get personalised recommendations, and backtest strategies—all from one app.</p>
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  { src: "/images/portfolio_graph.png", label: "Portfolio Performance" },
                  { src: "/images/portfolio_vs_sp_graph.png", label: "vs. S&P 500" },
                  { src: "/images/recommended_actions.png", label: "Recommendations" },
                ].map((img) => (
                  <div key={img.src} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                    <Image src={img.src} alt={img.label} width={600} height={192} className="h-48 w-full object-cover" />
                    <p className="px-4 py-3 text-center text-sm font-medium text-zinc-300">{img.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Pricing ── */}
          <section id="pricing" className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <motion.h2
              className="mb-4 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={scrollAppearViewport}
              transition={{ duration: 0.6, ease }}
            >
              Simple, transparent pricing
            </motion.h2>
            <p className="mx-auto mb-12 max-w-md text-center text-sm text-zinc-400">Start free for {APP_MANAGED_TRIAL_PERIOD}—no credit card required.</p>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  name: "Free Trial", period: APP_MANAGED_TRIAL_PERIOD, price: "Free", note: "Full access, no card needed",
                  features: ["Full Dashboard & Portfolio", "Optimization Engine", "Backtesting & Simulation", "Up to 100 stocks", "Real-time market data"],
                  highlight: false,
                },
                {
                  name: "Monthly", period: "Auto-renews", price: "$3.99", note: "per month",
                  features: ["Everything in Free Trial", "Unlimited stocks", "Advanced analytics", "Priority support", "Continuous updates"],
                  highlight: true,
                },
                {
                  name: "Yearly", period: "Save 27%", price: "$34.99", note: "per year",
                  features: ["Everything in Monthly", "27% savings vs monthly", "Dedicated support email", "Early feature access", "Annual portfolio report"],
                  highlight: false,
                },
              ].map((plan, i) => (
                <motion.div
                  key={plan.name}
                  className={`flex flex-col rounded-2xl border p-7 ${plan.highlight ? "border-emerald-400/35 bg-emerald-500/[0.07] shadow-[0_0_40px_-12px_rgba(52,211,153,0.2)]" : "border-white/[0.08] bg-white/[0.03]"}`}
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={scrollAppearViewport}
                  transition={{ duration: 0.55, ease, delay: i * 0.08 }}
                >
                  <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">{plan.period}</div>
                  <div className="mb-1 text-xl font-bold text-white">{plan.name}</div>
                  <div className="mb-1 text-3xl font-bold text-white">{plan.price}</div>
                  <div className="mb-5 text-xs text-zinc-500">{plan.note}</div>
                  <ul className="mb-8 flex flex-col gap-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <TransitionLink
                    href="/signup"
                    prefetch={false}
                    className={`mt-auto rounded-xl px-5 py-2.5 text-center text-sm font-semibold no-underline transition-colors ${plan.highlight ? "bg-emerald-500 text-white hover:bg-emerald-400" : "border border-white/15 bg-white/5 text-white hover:bg-white/10"}`}
                  >
                    Get started
                  </TransitionLink>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── FAQ ── */}
          <section id="faq" className="relative overflow-hidden border-t border-white/[0.05] bg-white/[0.018] py-20 sm:py-28">
            <div className="mx-auto max-w-3xl px-4 sm:px-6">
              <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">Frequently asked questions</h2>
              <div className="flex flex-col gap-4">
                {[
                  { q: "How secure is my portfolio data?", a: "Your data is encrypted with industry-standard AES-256 encryption in transit (HTTPS) and at rest. We never sell your data." },
                  { q: "Can I export my data?", a: "Yes! You can export your portfolio holdings as a CSV file at any time. Your data belongs to you." },
                  { q: "Do I need technical knowledge?", a: "No. Stocks PM is designed for everyone, from beginners to experienced investors, with clear explanations at every step." },
                  { q: "Can I cancel my subscription anytime?", a: "Yes. Cancel anytime from the Profile settings page—no questions asked." },
                  { q: "Does Stocks PM execute trades automatically?", a: "No. Stocks PM provides recommendations and analysis only. All trades are executed by you through your brokerage." },
                  { q: "What data sources does Stocks PM use?", a: "We pull real-time and historical stock data from trusted financial data providers including MarketStack and Yahoo Finance." },
                  { q: "Can I use Stocks PM on multiple devices?", a: "Your portfolio syncs across all devices. Sign in on any browser and access your data instantly." },
                ].map((item, i) => (
                  <motion.div
                    key={item.q}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={scrollAppearViewport}
                    transition={{ duration: 0.5, ease, delay: i * 0.04 }}
                  >
                    <h4 className="mb-2 text-sm font-semibold text-emerald-300">{item.q}</h4>
                    <p className="text-sm leading-relaxed text-zinc-400">{item.a}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

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

      {/* ── Site footer — outside scroll-lock root so it's always reachable ── */}
      <footer className="border-t border-white/[0.06] bg-[#0b0d13] py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base font-semibold text-white">Stocks <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">PM</span></span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">Smart portfolio optimisation & analysis. Companion to the Stocks PM iOS app.</p>
              <p className="mt-3 text-xs text-zinc-600">© 2026 AppAiTech. All rights reserved.</p>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Company</p>
              <ul className="space-y-2">
                {[
                  { label: "About us", href: "/about" },
                  { label: "Contact", href: "/contact" },
                ].map((l) => (
                  <li key={l.href}><Link href={l.href} className="text-sm text-zinc-400 no-underline transition-colors hover:text-white">{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Legal</p>
              <ul className="space-y-2">
                {[
                  { label: "Privacy policy", href: "/privacy" },
                  { label: "Terms of service", href: "/terms" },
                ].map((l) => (
                  <li key={l.href}><Link href={l.href} className="text-sm text-zinc-400 no-underline transition-colors hover:text-white">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
