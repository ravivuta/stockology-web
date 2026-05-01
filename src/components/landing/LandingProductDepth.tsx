"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { LandingScrollStages } from "@/components/landing/LandingScrollStages";
import { Brain, Newspaper, PieChart } from "lucide-react";
import { LandingPersonalizedManagementSection } from "@/components/landing/LandingPersonalizedManagement";
import { cn } from "@/lib/utils";
import { sentimentDotClass } from "@/lib/news-feed";

/** Tighter vertical rhythm so bands read as one continuous canvas */
const sectionY = "py-20 md:py-28";
const headline =
  "text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.35rem] md:leading-[1.12]";
const body = "text-pretty text-[15px] leading-relaxed text-zinc-400 sm:text-base";

const inViewSoft = { once: true, amount: 0.2, margin: "0px 0px -40px 0px" } as const;
const easeOut = [0.22, 1, 0.36, 1] as const;

function useSmoothProgress(scrollYProgress: MotionValue<number>, reduce: boolean) {
  return useSpring(scrollYProgress, {
    stiffness: reduce ? 520 : 140,
    damping: reduce ? 85 : 32,
    mass: reduce ? 0.08 : 0.38,
  });
}

const NARRATIVE_PROGRESS_EPS = 0.004;
/** Wheel delta → progress; slightly finer steps read smoother at the same travel. */
const WHEEL_PROGRESS_SENS = 0.00058;

function normalizeWheelDeltaY(e: WheelEvent) {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  if (e.deltaMode === 2) dy *= typeof window !== "undefined" ? window.innerHeight : 600;
  return dy;
}

/** Lenient — wheel can engage while the narrative is “mostly” in view or bottom-docked with the viewport. */
function narrativeSectionReadyForWheel(el: HTMLElement) {
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  if (h <= 0) return false;
  const rect = el.getBoundingClientRect();
  const slack = Math.min(14, h * 0.02);
  const reserve = narrativeMarketingHeaderReservePx();
  const fromAbove = rect.top <= reserve + slack + 10 && rect.bottom >= h * 0.88 - slack;
  const bottomDock =
    rect.bottom >= h - 40 &&
    rect.bottom <= h + 100 &&
    rect.top >= reserve - 40 &&
    rect.top <= reserve + 72;
  return fromAbove || bottomDock;
}

/**
 * Strict — narrative block bottom edge flush with viewport bottom (footer chrome sits on screen bottom),
 * top edge just below fixed marketing header (matches sticky tour inset).
 */
function narrativeSectionFillsViewportStrict(el: HTMLElement) {
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  if (h <= 0) return false;
  const rect = el.getBoundingClientRect();
  const reserve = narrativeMarketingHeaderReservePx();
  const tol = 14;
  const topOk = rect.top >= reserve - tol && rect.top <= reserve + tol + Math.min(36, h * 0.06);
  const bottomOk = rect.bottom >= h - tol && rect.bottom <= h + 10;
  return topOk && bottomOk;
}

function narrativeDocumentTopY(el: HTMLElement) {
  return el.getBoundingClientRect().top + window.scrollY;
}

/** Fixed marketing header + small gap — matches sticky `top` on the in-viewport tour shell. */
function narrativeMarketingHeaderReservePx(): number {
  if (typeof document === "undefined") return 52;
  const header = document.querySelector(".landing-marketing-top-chrome header");
  const h = header?.getBoundingClientRect().height ?? 0;
  const base = h > 8 ? h : 44;
  return Math.min(96, Math.ceil(base + 8));
}

/** Document scrollY so the narrative wrapper’s bottom meets the viewport bottom (progress bar box on screen edge). */
function narrativePinScrollY(el: HTMLElement) {
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  if (h <= 0) return Math.max(0, narrativeDocumentTopY(el) - narrativeMarketingHeaderReservePx());
  const top = narrativeDocumentTopY(el);
  const height = el.offsetHeight;
  return Math.max(0, top + height - h);
}

/**
 * Lock scroll by fixing a content root (not `body`) so `position:fixed` chrome (nav) stays viewport-anchored.
 * Fixing `body` makes fixed descendants use the body as containing block in many browsers — nav “follows” the hijack.
 */
function freezeDocumentScroll(scrollY: number, scrollRoot: HTMLElement) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.dataset.landingNarrativeLock = "true";
  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  scrollRoot.dataset.landingNarrativeLock = "true";
  scrollRoot.style.position = "fixed";
  scrollRoot.style.top = `-${scrollY}px`;
  scrollRoot.style.left = "0";
  scrollRoot.style.right = "0";
  scrollRoot.style.width = "100%";
}

function scrollWindowInstant(y: number) {
  const top = Math.max(0, y);
  window.scrollTo({ top, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}

function unfreezeDocumentScroll(nextScrollY: number, scrollRoot: HTMLElement) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  delete html.dataset.landingNarrativeLock;
  /* Global `html { scroll-behavior: smooth }` animates scrollTo — looks like a jump to top then smooth scroll down. */
  const prevBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";

  html.style.overflow = "";
  html.style.overscrollBehavior = "";
  body.style.overflow = "";
  body.style.overscrollBehavior = "";
  delete scrollRoot.dataset.landingNarrativeLock;
  scrollRoot.style.position = "";
  scrollRoot.style.top = "";
  scrollRoot.style.left = "";
  scrollRoot.style.right = "";
  scrollRoot.style.width = "";

  const y = Math.max(0, nextScrollY);
  scrollWindowInstant(y);

  requestAnimationFrame(() => {
    scrollWindowInstant(y);
    requestAnimationFrame(() => {
      scrollWindowInstant(y);
      html.style.scrollBehavior = prevBehavior;
    });
  });
}

function SectionEyebrow({ children, accent }: { children: React.ReactNode; accent: "emerald" | "cyan" | "violet" }) {
  const colors = {
    emerald: "text-emerald-400/90",
    cyan: "text-cyan-400/90",
    violet: "text-fuchsia-300/85",
  };
  const bar = {
    emerald: "from-emerald-400/50",
    cyan: "from-cyan-400/50",
    violet: "from-fuchsia-400/45",
  };
  return (
    <p
      className={`mb-3 inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${colors[accent]}`}
    >
      <span className={`h-px w-8 bg-gradient-to-r ${bar[accent]} to-transparent`} aria-hidden />
      {children}
    </p>
  );
}

function AllocationDialGlow({ p, reduce }: { p: MotionValue<number>; reduce: boolean }) {
  const op = useTransform(p, [0, 0.5, 1], [0.35, 0.65, 0.45]);
  return (
    <motion.div
      className="absolute inset-[-8%] rounded-full bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10 blur-2xl"
      style={reduce ? { opacity: 0.5 } : { opacity: op }}
      aria-hidden
    />
  );
}

/** Full-block scroll parallax for the shared canvas */
function DepthScrollMesh({
  progressSmooth,
  reduce,
}: {
  progressSmooth: MotionValue<number>;
  reduce: boolean;
}) {
  const y1 = useTransform(progressSmooth, [0, 1], [0, -88]);
  const y2 = useTransform(progressSmooth, [0, 1], [0, 56]);
  const x1 = useTransform(progressSmooth, [0, 1], [0, 40]);
  const rot = useTransform(progressSmooth, [0, 1], [0, 8]);
  const sc = useTransform(progressSmooth, [0, 0.5, 1], [1, 1.045, 1]);

  if (reduce) {
    return (
      <>
        <div className="absolute -left-[12%] top-[15%] h-[42%] w-[38%] rounded-full bg-emerald-500/[0.06] blur-[90px]" />
        <div className="absolute -right-[8%] top-[40%] h-[38%] w-[42%] rounded-full bg-violet-500/[0.05] blur-[95px]" />
        <div className="absolute left-[30%] bottom-[8%] h-[32%] w-[55%] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
      </>
    );
  }

  return (
    <>
      <motion.div
        className="will-change-transform absolute -left-[12%] top-[15%] h-[42%] w-[38%] rounded-full bg-emerald-500/[0.07] blur-[64px]"
        style={{ y: y1, x: x1 }}
      />
      <motion.div
        className="will-change-transform absolute -right-[8%] top-[40%] h-[38%] w-[42%] rounded-full bg-fuchsia-500/[0.055] blur-[68px]"
        style={{ y: y2, rotate: rot }}
      />
      <motion.div
        className="will-change-transform absolute left-[25%] bottom-[5%] h-[35%] w-[60%] rounded-full bg-cyan-500/[0.045] blur-[72px]"
        style={{ y: y1, scale: sc }}
      />
      <motion.div
        className="will-change-transform absolute left-1/2 top-[55%] h-[28%] w-[45%] -translate-x-1/2 rounded-full bg-emerald-400/[0.03] blur-[56px]"
        style={{ y: y2 }}
      />
    </>
  );
}

function SectionRecommendations({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.88", "end 0.22"],
  });
  const p = useSmoothProgress(scrollYProgress, reduce);

  const cardY = useTransform(p, [0, 1], [48, -36]);
  const cardRotate = useTransform(p, [0, 1], [1.1, -0.55]);
  const cardScale = useTransform(p, [0, 0.4, 1], [0.965, 1, 1]);
  const cardOpacity = useTransform(p, [0, 0.15, 0.35], [0.55, 0.95, 1]);
  const orbA = useTransform(p, [0, 1], [-12, 20]);
  const orbB = useTransform(p, [0, 1], [18, -14]);
  const headlineX = useTransform(p, [0, 1], [-8, 0]);
  const textOpacity = useTransform(p, [0, 0.12, 0.28], [0.7, 1, 1]);

  const metrics = [
    { k: "Next", v: "$142", hint: "Add zone from your rules." },
    { k: "MA 50", v: "$138", hint: "Same window as your chart." },
    { k: "Score", v: "77", hint: "From your parameters." },
  ];

  return (
    <section ref={ref} className={`relative ${sectionY}`}>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-20">
          <motion.div className="max-w-xl lg:pt-2" style={reduce ? undefined : { x: headlineX, opacity: textOpacity }}>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={inViewSoft}
              transition={{ duration: 0.5, ease: easeOut }}
            >
              <SectionEyebrow accent="emerald">Recommendations</SectionEyebrow>
              <h2 className={headline}>Rules-first signals per position</h2>
            </motion.div>
            <p className={`mt-5 ${body}`}>
              Add, trim, or wait—from your targets, averages, and context.
            </p>
          </motion.div>

          <div className="relative min-h-[300px] sm:min-h-[360px]">
            <motion.div
              className="pointer-events-none absolute -right-4 top-6 h-56 w-56 rounded-full bg-emerald-400/12 blur-[80px]"
              style={reduce ? undefined : { y: orbA }}
              aria-hidden
            />
            <motion.div
              className="pointer-events-none absolute bottom-8 left-[-10%] h-44 w-44 rounded-full bg-cyan-400/10 blur-[72px]"
              style={reduce ? undefined : { y: orbB }}
              aria-hidden
            />

            <motion.div
              className="relative mx-auto max-w-md rounded-[26px] border border-white/[0.09] bg-gradient-to-br from-zinc-900/90 via-zinc-900/95 to-[#1a1f2c]/96 p-6 shadow-[0_32px_80px_-36px_rgba(10,12,18,0.72),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[2px] sm:p-7 lg:mx-0 lg:ml-auto"
              style={
                reduce
                  ? undefined
                  : {
                      y: cardY,
                      rotate: cardRotate,
                      scale: cardScale,
                      opacity: cardOpacity,
                    }
              }
              whileHover={reduce ? undefined : { y: -6, transition: { type: "spring", stiffness: 400, damping: 28 } }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-3.5">
                <span className="text-[13px] font-medium text-zinc-500">Live signal</span>
                <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/85">
                  Rules
                </span>
              </div>
              <span className="mt-4 inline-flex rounded-xl border border-emerald-400/28 bg-emerald-500/[0.09] px-3.5 py-2 text-lg font-bold tracking-tight text-emerald-100 sm:text-xl">
                WAIT_ADD
              </span>
              <p className="mt-3.5 text-sm leading-relaxed text-zinc-400">Near your next buy zone.</p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {metrics.map((x) => (
                  <div
                    key={x.k}
                    className="rounded-xl border border-white/[0.06] bg-[#1a1d28]/55 px-2.5 py-2.5 text-left"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{x.k}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-white">{x.v}</p>
                    <p className="mt-2 text-[10px] leading-snug text-zinc-500">{x.hint}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-cyan-400/12 bg-cyan-500/[0.04] px-3 py-3">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/85" strokeWidth={1.5} aria-hidden />
                <p className="text-xs leading-relaxed text-zinc-500">
                  <span className="font-medium text-zinc-300">Sentiment</span> on headlines—context for your rules.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

const allocMeta = [
  { w: 38, label: "Tech", pct: "38%", c: "bg-emerald-400", detail: "Growth sleeves often drive day-to-day volatility in a diversified book." },
  { w: 24, label: "ETFs", pct: "24%", c: "bg-cyan-400", detail: "Core beta and sector ETFs can anchor allocation while you tilt with singles." },
  { w: 18, label: "Finance", pct: "18%", c: "bg-violet-400", detail: "Rate-sensitive names—size consciously next to your macro view." },
  { w: 20, label: "Other", pct: "20%", c: "bg-zinc-500", detail: "Everything else: trim or add when drift exceeds the band you set." },
] as const;

function SectionAllocation({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.82", "end 0.26"],
  });
  const p = useSmoothProgress(scrollYProgress, reduce);

  const seg1 = useTransform(p, [0, 0.32, 0.88], [0, 1, 1]);
  const seg2 = useTransform(p, [0, 0.42, 0.9], [0, 1, 1]);
  const seg3 = useTransform(p, [0, 0.52, 0.93], [0, 1, 1]);
  const seg4 = useTransform(p, [0, 0.62, 1], [0, 1, 1]);
  const dialRotate = useTransform(p, [0, 1], [-8, 198]);
  const statLift = useTransform(p, [0, 0.22, 0.48], [18, 6, 0]);
  const statOp = useTransform(p, [0, 0.18, 0.42], [0, 0.75, 1]);
  const chipY0 = useTransform(statLift, (v) => v);
  const chipY1 = useTransform(statLift, (v) => v + 3);
  const chipY2 = useTransform(statLift, (v) => v + 6);
  const chipY3 = useTransform(statLift, (v) => v + 9);
  const chipYs = [chipY0, chipY1, chipY2, chipY3];

  const scales = [seg1, seg2, seg3, seg4];

  return (
    <section ref={ref} className={`relative ${sectionY}`}>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={inViewSoft}
          transition={{ duration: 0.5, ease: easeOut }}
        >
          <div className="flex justify-center">
            <SectionEyebrow accent="cyan">Portfolio intelligence</SectionEyebrow>
          </div>
          <h2 className={`${headline} mt-1`}>Allocation at a glance</h2>
          <p className={`mt-4 ${body}`}>Sleeves and rollups for the full book.</p>
        </motion.div>

        <div className="mt-16 rounded-[28px] border border-white/[0.06] bg-zinc-950/35 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm sm:p-8 md:p-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_min(280px,100%)] lg:items-center lg:gap-14">
            <div>
              <p className="mb-3 text-center text-[13px] font-medium text-zinc-500 lg:text-left">By sleeve</p>
              <div className="flex h-[14px] overflow-hidden rounded-full bg-zinc-900/90 p-[3px] ring-1 ring-white/[0.05]">
                <div className="flex h-full flex-1 overflow-hidden rounded-full bg-[#252831]/65">
                  {allocMeta.map((x, i) => (
                    <div
                      key={x.label}
                      className="relative h-full overflow-hidden first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${x.w}%` }}
                    >
                      <motion.div
                        className={`h-full w-full ${x.c} origin-left shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]`}
                        style={{
                          scaleX: reduce ? 1 : scales[i],
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <ul className="mt-5 flex flex-wrap justify-center gap-2.5 lg:justify-start">
                {allocMeta.map((x, i) => (
                  <motion.li
                    key={x.label}
                    style={
                      reduce
                        ? undefined
                        : {
                            opacity: statOp,
                            y: chipYs[i] ?? chipY0,
                          }
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-[#1a1d28]/50 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${x.c} shadow-[0_0_10px_-2px_rgba(255,255,255,0.2)]`} aria-hidden />
                    <span className="font-medium text-zinc-200">{x.label}</span>
                    <span className="tabular-nums text-zinc-500">{x.pct}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto flex h-[240px] w-[240px] items-center justify-center sm:h-[268px] sm:w-[268px]">
              <AllocationDialGlow p={p} reduce={reduce} />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={
                  reduce
                    ? { rotate: 198 }
                    : {
                        rotate: dialRotate,
                      }
                }
                aria-hidden
              >
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    background: `conic-gradient(from -8deg, rgba(52,211,153,0.42) 0deg 137deg, rgba(34,211,238,0.38) 137deg 223deg, rgba(167,139,250,0.34) 223deg 288deg, rgba(113,113,122,0.42) 288deg 360deg)`,
                    mask: "radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 13px + 1px))",
                    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 13px + 1px))",
                  }}
                />
              </motion.div>
              <div className="relative z-10 flex h-[54%] w-[54%] flex-col items-center justify-center rounded-full border border-white/[0.09] bg-zinc-950/95 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <PieChart className="h-6 w-6 text-cyan-300/88" strokeWidth={1.5} aria-hidden />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">By value</p>
                <p className="text-base font-bold tabular-nums text-white">100%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mirrors app News page labeling (`news/page.tsx` + `sentimentDotClass`). */
function sentimentToneLabel(sentiment: string | null): string {
  if (!sentiment?.trim()) return "Neutral";
  const s = sentiment.toLowerCase();
  if (s === "positive" || s === "bullish") return "Bullish";
  if (s === "negative" || s === "bearish") return "Bearish";
  return "Neutral";
}

const newsPreviewItems = [
  {
    id: "lp-n1",
    symbol: "AAPL",
    companyName: "Apple Inc.",
    title: "Supply chain update shifts margin outlook for holiday quarter",
    sentiment: "neutral" as string | null,
    source: "Reuters",
    rel: "2h ago",
  },
  {
    id: "lp-n2",
    symbol: "MACRO",
    companyName: null as string | null,
    title: "Fed path and yields in focus ahead of heavy data week",
    sentiment: "bearish",
    source: "Bloomberg",
    rel: "4h ago",
  },
  {
    id: "lp-n3",
    symbol: "NVDA",
    companyName: "NVIDIA Corp.",
    title: "Data-center demand narrative holds analyst attention after earnings",
    sentiment: "bullish",
    source: "CNBC",
    rel: "5h ago",
  },
  {
    id: "lp-n4",
    symbol: "MSFT",
    companyName: "Microsoft Corp.",
    title: "Cloud growth steady; AI copilot adoption tracked in enterprise segment",
    sentiment: "positive",
    source: "WSJ",
    rel: "Yesterday",
  },
] as const;

function LandingNewsPreviewCard({
  symbol,
  companyName,
  title,
  sentiment,
  source,
  rel,
}: {
  symbol: string;
  companyName: string | null;
  title: string;
  sentiment: string | null;
  source: string;
  rel: string;
}) {
  const isMacro = symbol === "MACRO";
  const tone = sentimentToneLabel(sentiment);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_40px_-28px_rgba(0,0,0,0.85)] transition-[border-color,box-shadow] duration-200 hover:border-white/[0.11]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-lg px-2 text-xs font-bold tracking-wide ring-1",
            isMacro
              ? "bg-amber-500/12 text-amber-100 ring-amber-400/22"
              : "bg-emerald-500/12 text-emerald-100 ring-emerald-400/22"
          )}
        >
          {isMacro ? "Macro" : symbol}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1a1d28]/55 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sentimentDotClass(sentiment))} aria-hidden />
          {tone}
        </span>
      </div>
      <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-100 line-clamp-3">{title}</h3>
      {companyName && !isMacro ? <p className="mt-2 text-sm text-zinc-500 line-clamp-1">{companyName}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-xs text-zinc-500">
        <span className="font-medium text-zinc-400">{source}</span>
        <span aria-hidden className="text-zinc-700">
          ·
        </span>
        <span>{rel}</span>
      </div>
    </article>
  );
}

function SectionNews({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.2"],
  });
  const p = useSmoothProgress(scrollYProgress, reduce);
  const panelLift = useTransform(p, [0, 0.35, 0.75], [16, 4, 0]);
  const panelOp = useTransform(p, [0, 0.2, 0.45], [0.75, 0.95, 1]);
  const headerSlide = useTransform(p, [0, 0.4, 1], [12, 0, 0]);

  return (
    <section ref={ref} className={`relative ${sectionY}`}>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          style={reduce ? undefined : { y: headerSlide }}
          initial={reduce ? false : { opacity: 0 }}
          whileInView={reduce ? undefined : { opacity: 1 }}
          viewport={inViewSoft}
          transition={{ duration: 0.45 }}
        >
          <div className="flex justify-center">
            <SectionEyebrow accent="violet">News</SectionEyebrow>
          </div>
          <h2 className={headline}>Headlines & tone</h2>
          <p className={`mt-4 ${body}`}>Headlines for your tickers and macro.</p>
        </motion.div>

        <motion.div
          className="mx-auto mt-12 max-w-4xl lg:max-w-5xl"
          style={
            reduce
              ? undefined
              : {
                  y: panelLift,
                  opacity: panelOp,
                }
          }
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-zinc-950/35 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <Newspaper className="h-3.5 w-3.5 text-fuchsia-300/70" strokeWidth={1.75} aria-hidden />
              Feed
            </div>
            <p className="text-xs text-zinc-600">
              <span className="tabular-nums font-semibold text-zinc-400">{newsPreviewItems.length}</span> items
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {newsPreviewItems.map((item) => (
              <li key={item.id} className="list-none">
                <LandingNewsPreviewCard
                  symbol={item.symbol}
                  companyName={item.companyName}
                  title={item.title}
                  sentiment={item.sentiment}
                  source={item.source}
                  rel={item.rel}
                />
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

function SectionPersonalized({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.78", "end 0.22"],
  });
  const p = useSmoothProgress(scrollYProgress, reduce);
  const rowY = useTransform(p, [0, 0.4, 0.85], [12, 4, 0]);
  const rowOp = useTransform(p, [0, 0.25, 0.55], [0.82, 1, 1]);

  return (
    <section ref={ref} className={`relative ${sectionY}`}>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div style={reduce ? undefined : { y: rowY, opacity: rowOp }}>
          <LandingPersonalizedManagementSection reduce={reduce} />
        </motion.div>
      </div>
    </section>
  );
}

export function LandingProductDepth({
  reduce,
  scrollLockRootRef,
}: {
  reduce: boolean;
  scrollLockRootRef: RefObject<HTMLElement | null>;
}) {
  const narrativeRef = useRef<HTMLDivElement>(null);
  const stackedRef = useRef<HTMLDivElement>(null);
  const bodyScrollLockedRef = useRef(false);
  const frozenScrollYRef = useRef(0);
  /** Document scrollY where the narrative block is pinned (bottom aligned to viewport; top inset below header). */
  const narrativePinScrollYRef = useRef<number | null>(null);
  /** User exited forward past the tour (p≈1) at least once — blocks jumping back above the tour until rewound. */
  const tourExitedForwardRef = useRef(false);
  /** After unfreeze, ignore scroll gates briefly so we don’t re-lock while scrollY settles (fixes finish glitch). */
  const scrollGateSuppressedUntilRef = useRef(0);
  /** Element that received `position:fixed` during lock (for cleanup; ref.current alone can be wrong on unmount). */
  const activeScrollLockRootRef = useRef<HTMLElement | null>(null);

  /** Long-scroll tour on small viewports + coarse pointers; desktop mouse/trackpad keeps wheel hijack. */
  const [touchNarrativeLayout, setTouchNarrativeLayout] = useState(false);
  useEffect(() => {
    const mqCoarse = window.matchMedia("(hover: none) and (pointer: coarse)");
    const mqNarrow = window.matchMedia("(max-width: 767.98px)");
    const apply = () => setTouchNarrativeLayout(mqCoarse.matches || mqNarrow.matches);
    apply();
    mqCoarse.addEventListener("change", apply);
    mqNarrow.addEventListener("change", apply);
    return () => {
      mqCoarse.removeEventListener("change", apply);
      mqNarrow.removeEventListener("change", apply);
    };
  }, []);

  const rawWheelProgress = useMotionValue(0);

  const { scrollYProgress: narrativeScrollProgress } = useScroll({
    target: narrativeRef,
    offset: ["start start", "end end"],
  });
  const { scrollYProgress: stackedProgress } = useScroll({
    target: stackedRef,
    offset: ["start 0.9", "end 0.12"],
  });

  const stackedSmoothed = useSmoothProgress(stackedProgress, reduce);
  const narrativeTouchSmoothed = useSpring(narrativeScrollProgress, {
    stiffness: 260,
    damping: 34,
    mass: 0.22,
  });

  const touchNarrative = touchNarrativeLayout && !reduce;
  /* Direct motion value for wheel mode — spring caused lag/choppy feel vs document lock. */
  const blockProgress = reduce ? stackedSmoothed : touchNarrative ? narrativeTouchSmoothed : rawWheelProgress;

  useLayoutEffect(() => {
    if (reduce) return;
    const sync = () => {
      const px = narrativeMarketingHeaderReservePx();
      document.documentElement.style.setProperty("--landing-narrative-top", `${px}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--landing-narrative-top");
    };
  }, [reduce]);

  useEffect(() => {
    if (reduce || touchNarrative) return;

    const scrollRoot = () => scrollLockRootRef.current;
    const capturePinIfNeeded = (el: HTMLElement) => {
      if (narrativePinScrollYRef.current == null) {
        narrativePinScrollYRef.current = narrativePinScrollY(el);
      }
    };

    const lockAt = (y: number, el: HTMLElement) => {
      const root = scrollRoot();
      if (!root) return;
      capturePinIfNeeded(el);
      scrollWindowInstant(y);
      freezeDocumentScroll(y, root);
      activeScrollLockRootRef.current = root;
      frozenScrollYRef.current = y;
      bodyScrollLockedRef.current = true;
    };

    const tryLock = () => {
      if (bodyScrollLockedRef.current) return true;
      const el = narrativeRef.current;
      const root = scrollRoot();
      if (!el || !root || !narrativeSectionReadyForWheel(el)) return false;
      if (narrativePinScrollYRef.current == null) {
        narrativePinScrollYRef.current = narrativePinScrollY(el);
      }
      lockAt(narrativePinScrollYRef.current, el);
      return bodyScrollLockedRef.current;
    };

    const onWheel = (e: WheelEvent) => {
      const el = narrativeRef.current;
      const root = scrollRoot();
      const dy = normalizeWheelDeltaY(e);
      const down = dy > 0;
      const up = dy < 0;

      if (!bodyScrollLockedRef.current) {
        if (!el || !root || !narrativeSectionReadyForWheel(el)) return;
        const p0 = rawWheelProgress.get();
        if (p0 >= 1 - NARRATIVE_PROGRESS_EPS && down) return;
        if (p0 <= NARRATIVE_PROGRESS_EPS && up) return;
        tryLock();
        if (!bodyScrollLockedRef.current) return;
      }

      if (!root) return;

      const p = rawWheelProgress.get();
      const frozenY = frozenScrollYRef.current;

      if (p >= 1 - NARRATIVE_PROGRESS_EPS && down) {
        e.preventDefault();
        e.stopPropagation();
        tourExitedForwardRef.current = true;
        /* Stay at current document position; user scrolls down manually — no viewport teleport. */
        scrollGateSuppressedUntilRef.current = Date.now() + 280;
        unfreezeDocumentScroll(frozenY, root);
        activeScrollLockRootRef.current = null;
        bodyScrollLockedRef.current = false;
        return;
      }

      if (p <= NARRATIVE_PROGRESS_EPS && up) {
        e.preventDefault();
        e.stopPropagation();
        tourExitedForwardRef.current = false;
        const targetY = Math.max(0, frozenY - Math.min(200, Math.abs(dy) * 2.5));
        scrollGateSuppressedUntilRef.current = Date.now() + 280;
        unfreezeDocumentScroll(targetY, root);
        activeScrollLockRootRef.current = null;
        bodyScrollLockedRef.current = false;
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      rawWheelProgress.set(Math.min(1, Math.max(0, p + dy * WHEEL_PROGRESS_SENS)));
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [reduce, touchNarrative, rawWheelProgress, scrollLockRootRef]);

  useEffect(() => {
    if (reduce || touchNarrative) return;

    const scrollRoot = () => scrollLockRootRef.current;

    const lockAt = (y: number, el: HTMLElement) => {
      const root = scrollRoot();
      if (!root) return;
      if (narrativePinScrollYRef.current == null) {
        narrativePinScrollYRef.current = narrativePinScrollY(el);
      }
      scrollWindowInstant(y);
      freezeDocumentScroll(y, root);
      activeScrollLockRootRef.current = root;
      frozenScrollYRef.current = y;
      bodyScrollLockedRef.current = true;
    };

    const onScroll = () => {
      if (bodyScrollLockedRef.current) return;
      if (Date.now() < scrollGateSuppressedUntilRef.current) return;

      const el = narrativeRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const p = rawWheelProgress.get();
      const pinY = narrativePinScrollYRef.current;

      if (rect.bottom < -8 && p > NARRATIVE_PROGRESS_EPS && p < 1 - NARRATIVE_PROGRESS_EPS) {
        rawWheelProgress.set(0);
        return;
      }

      /* Incomplete tour: never scroll past the pin into content below the narrative. */
      if (p < 1 - NARRATIVE_PROGRESS_EPS && pinY != null && window.scrollY > pinY + 1) {
        lockAt(pinY, el);
        return;
      }

      /* Finished forward once: re-lock only when the narrative is fully in frame (avoids half-visible tour). */
      if (
        tourExitedForwardRef.current &&
        pinY != null &&
        p > NARRATIVE_PROGRESS_EPS &&
        window.scrollY < pinY - 1
      ) {
        if (narrativeSectionFillsViewportStrict(el)) {
          lockAt(pinY, el);
        }
        return;
      }

      if (narrativeSectionFillsViewportStrict(el) && !bodyScrollLockedRef.current) {
        if (narrativePinScrollYRef.current == null) {
          narrativePinScrollYRef.current = narrativePinScrollY(el);
        }
        lockAt(narrativePinScrollYRef.current, el);
      }
    };

    const onResize = () => {
      narrativePinScrollYRef.current = null;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [reduce, touchNarrative, rawWheelProgress, scrollLockRootRef]);

  useEffect(() => {
    if (reduce || touchNarrative) return;
    return () => {
      if (bodyScrollLockedRef.current) {
        const root = activeScrollLockRootRef.current;
        if (root) unfreezeDocumentScroll(frozenScrollYRef.current, root);
        activeScrollLockRootRef.current = null;
        bodyScrollLockedRef.current = false;
      }
    };
  }, [reduce, touchNarrative, scrollLockRootRef]);

  return (
    <div className="relative border-t border-white/[0.03]">
      {/* One slow vertical wash so child sections read as one surface (no per-section color blocks). */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#0f1219_0%,#12151e_18%,#151a24_38%,#151a24_62%,#12151e_82%,#0f1219_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(180deg,black_0%,black_96%,transparent_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_140%_55%_at_50%_-5%,rgba(34,197,94,0.05),transparent_58%),radial-gradient(ellipse_100%_50%_at_82%_38%,rgba(34,211,238,0.038),transparent_55%),radial-gradient(ellipse_95%_48%_at_12%_62%,rgba(192,132,252,0.042),transparent_58%),radial-gradient(ellipse_85%_42%_at_48%_98%,rgba(52,211,153,0.035),transparent_52%)]"
        aria-hidden
      />
      <DepthScrollMesh progressSmooth={blockProgress} reduce={reduce} />

      {/* Edge vignette + corner accents to reduce “empty” feel on wide screens */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[min(14%,180px)] bg-gradient-to-r from-black/35 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[min(14%,180px)] bg-gradient-to-l from-black/35 to-transparent"
        aria-hidden
      />

      {reduce ? (
        <div ref={stackedRef} className="relative">
          <SectionRecommendations reduce={reduce} />
          <SectionAllocation reduce={reduce} />
          <SectionNews reduce={reduce} />
          <SectionPersonalized reduce={reduce} />
        </div>
      ) : (
        <div
          ref={narrativeRef}
          className={
            touchNarrative
              ? "relative"
              : "relative min-h-0 h-[calc(100dvh-var(--landing-narrative-top,52px))]"
          }
          style={touchNarrative ? { height: "min(480vh, 4800px)" } : undefined}
          aria-label={
            touchNarrative ? "Product tour — scroll to advance" : "Product tour — wheel or trackpad to advance"
          }
        >
          <div
            className="sticky min-h-0 w-full [transform:translateZ(0)] will-change-transform"
            style={
              touchNarrative
                ? { top: 0, height: "100svh" }
                : {
                    top: "var(--landing-narrative-top, 52px)",
                    height: "calc(100dvh - var(--landing-narrative-top, 52px))",
                  }
            }
          >
            <LandingScrollStages
              progress={blockProgress}
              interactionHint={touchNarrative ? "scroll" : "wheel"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
