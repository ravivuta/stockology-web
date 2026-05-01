"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion";
import { Brain, Newspaper, PieChart, Search } from "lucide-react";
import { LandingPersonalizedScrollPanel } from "@/components/landing/LandingPersonalizedManagement";
import { cn } from "@/lib/utils";
import { sentimentDotClass } from "@/lib/news-feed";

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
      className={`mb-2 inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] sm:mb-3 sm:text-[11px] ${colors[accent]}`}
    >
      <span className={`h-px w-6 bg-gradient-to-r sm:w-8 ${bar[accent]} to-transparent`} aria-hidden />
      {children}
    </p>
  );
}

const headline =
  "text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-[2rem] md:leading-[1.12]";
const body = "text-pretty text-sm leading-relaxed text-zinc-400 sm:text-[15px] sm:leading-relaxed";

const allocMeta = [
  { w: 38, label: "Tech", pct: "38%", c: "bg-emerald-400" },
  { w: 24, label: "ETFs", pct: "24%", c: "bg-cyan-400" },
  { w: 18, label: "Finance", pct: "18%", c: "bg-violet-400" },
  { w: 20, label: "Other", pct: "20%", c: "bg-zinc-500" },
] as const;

const newsMini = [
  {
    sym: "AAPL",
    title: "Supply chain update shifts margin outlook",
    tone: "neutral" as const,
    source: "Reuters",
    rel: "3h ago",
  },
  {
    sym: "MACRO",
    title: "Fed path and yields in focus ahead of data week",
    tone: "bearish" as const,
    source: "Macro",
    rel: "5h ago",
  },
  {
    sym: "NVDA",
    title: "Data-center demand narrative holds attention",
    tone: "bullish" as const,
    source: "Bloomberg",
    rel: "Yesterday",
  },
] as const;

function tourSentimentLabel(tone: (typeof newsMini)[number]["tone"]) {
  if (tone === "bullish") return "Bullish";
  if (tone === "bearish") return "Bearish";
  return "Neutral";
}

/** Center hub stays upright; percentage tracks tour progress through the allocation beat. */
function AllocationDonutCenter({ pct }: { pct: MotionValue<number> }) {
  const [display, setDisplay] = useState(() =>
    Math.round(Math.min(100, Math.max(0, pct.get())))
  );
  useMotionValueEvent(pct, "change", (v) => {
    const n = Math.round(Math.min(100, Math.max(0, v)));
    setDisplay((prev) => (prev === n ? prev : n));
  });

  return (
    <div className="flex h-[48%] w-[48%] flex-col items-center justify-center rounded-full border border-white/[0.09] bg-zinc-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <PieChart className="h-5 w-5 text-cyan-300/88" strokeWidth={1.5} aria-hidden />
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">By value</p>
      <p className="text-sm font-bold tabular-nums text-white">{display}%</p>
    </div>
  );
}

function narrativeChapterMeta(v: number): { n: number; title: string } {
  if (v < 0.27) return { n: 1, title: "Recommendations" };
  if (v < 0.52) return { n: 2, title: "Allocation" };
  if (v < 0.76) return { n: 3, title: "News" };
  return { n: 4, title: "Personalized" };
}

/** Progress-reactive field behind the cards (separate from crossfades) so scrolling the tour always moves something visible. */
function NarrativeAmbientField({ p }: { p: MotionValue<number> }) {
  const haloRotate = useTransform(p, [0, 1], [-16, 38]);
  const haloScale = useTransform(p, [0, 0.42, 0.76, 1], [1, 1.07, 1.04, 1.01]);
  const gridX = useTransform(p, [0, 1], [0, 28]);
  const gridY = useTransform(p, [0, 1], [0, -18]);
  const ringA = useTransform(p, [0, 1], [0.94, 1.035]);
  const ringB = useTransform(p, [0, 1], [0.96, 1.065]);
  const ringRot = useTransform(p, [0, 1], [0, -22]);
  const sweepOpacity = useTransform(p, [0, 0.18, 0.48, 0.82, 1], [0.1, 0.17, 0.14, 0.19, 0.11]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden>
      <motion.div
        className="will-change-transform absolute left-1/2 top-[40%] h-[min(130vw,1100px)] w-[min(130vw,1100px)] -translate-x-1/2 -translate-y-1/2"
        style={{
          rotate: haloRotate,
          scale: haloScale,
          opacity: sweepOpacity,
          background:
            "conic-gradient(from 200deg at 50% 48%, rgba(52,211,153,0.2), transparent 22%, rgba(34,211,238,0.14) 40%, transparent 55%, rgba(192,132,252,0.12) 72%, transparent)",
          filter: "blur(44px)",
        }}
      />
      <motion.div
        className="will-change-transform absolute inset-[-8%] opacity-[0.35]"
        style={{
          x: gridX,
          y: gridY,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.034)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)",
          backgroundSize: "52px 52px",
          WebkitMaskImage: "radial-gradient(ellipse 70% 65% at 50% 45%, black 0%, transparent 72%)",
          maskImage: "radial-gradient(ellipse 70% 65% at 50% 45%, black 0%, transparent 72%)",
        }}
      />
      <motion.div
        className="will-change-transform absolute left-1/2 top-1/2 h-[min(92vmin,760px)] w-[min(92vmin,760px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/[0.11] shadow-[0_0_40px_rgba(52,211,153,0.06)]"
        style={{ scale: ringA }}
      />
      <motion.div
        className="will-change-transform absolute left-1/2 top-1/2 h-[min(78vmin,640px)] w-[min(78vmin,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/[0.09]"
        style={{ scale: ringB, rotate: ringRot }}
      />
    </div>
  );
}

function NarrativeProgressChrome({ p }: { p: MotionValue<number> }) {
  /* Direct bind — spring here lagged behind wheel input and read “low FPS”. */
  const barScaleX = useTransform(p, (v) => Math.max(0.04, Math.min(1, v)));
  const [meta, setMeta] = useState(() => narrativeChapterMeta(p.get()));
  const [pct, setPct] = useState(() => Math.round(p.get() * 100));

  useMotionValueEvent(p, "change", (v) => {
    const next = narrativeChapterMeta(v);
    setMeta((m) => (m.n === next.n ? m : next));
    const np = Math.round(v * 100);
    setPct((prev) => (prev === np ? prev : np));
  });

  return (
    <div className="pointer-events-none mx-auto w-full max-w-lg space-y-2 px-0" role="group" aria-label="Tour progress">
        <div
          className="flex items-end justify-between gap-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${meta.title}, ${pct} percent`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Beat</p>
            <p className="truncate text-[11px] font-medium text-zinc-300 sm:text-xs">
              <span className="tabular-nums text-emerald-400/95">{meta.n}</span>
              <span className="text-zinc-600"> / 4 · </span>
              <span className="text-zinc-400">{meta.title}</span>
            </p>
          </div>
          <p className="shrink-0 text-[11px] font-semibold tabular-nums text-cyan-400/90 sm:text-xs">{pct}%</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07] ring-1 ring-white/[0.06]">
          <motion.div
            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300/90 to-cyan-400 shadow-[0_0_14px_rgba(52,211,153,0.38)] will-change-transform"
            style={{ scaleX: barScaleX }}
          />
        </div>
    </div>
  );
}

/**
 * Full-viewport stages driven by parent progress (0–1). Marquee lives above in Landing.tsx.
 */
export function LandingScrollStages({
  progress,
  interactionHint = "wheel",
}: {
  progress: MotionValue<number>;
  interactionHint?: "wheel" | "scroll";
}) {
  const p = progress;

  /* Tighter progress bands = quicker crossfades for the same wheel distance. */
  const s0 = { b: 0.08, c: 0.24, d: 0.31 };
  const s1 = { a: 0.26, b: 0.32, c: 0.46, d: 0.52 };
  const s2 = { a: 0.5, b: 0.56, c: 0.7, d: 0.76 };
  const s3 = { a: 0.72, b: 0.78, c: 1, d: 1 };

  /* Extra keyframes = softer opacity ramps (linear segments approximate ease). */
  const op0 = useTransform(p, [0, 0.05, s0.c - 0.03, s0.c, s0.d], [1, 1, 1, 0.42, 0]);
  const op1 = useTransform(p, [s1.a, s1.a + 0.028, s1.b, s1.c - 0.02, s1.c, s1.d], [0, 0.52, 1, 1, 0.38, 0]);
  const op2 = useTransform(p, [s2.a, s2.a + 0.028, s2.b, s2.c - 0.02, s2.c, s2.d], [0, 0.52, 1, 1, 0.38, 0]);
  const op3 = useTransform(p, [s3.a, s3.a + 0.028, s3.b, 0.965, 1], [0, 0.52, 1, 1, 1]);

  const y0 = useTransform(p, [0, 0.06, s0.c - 0.02, s0.c, s0.d], [0, 0, 0, -5, -11]);
  const y1 = useTransform(p, [s1.a, s1.a + 0.028, s1.b, s1.c - 0.02, s1.c, s1.d], [15, 7, 0, 0, -5, -11]);
  const y2 = useTransform(p, [s2.a, s2.a + 0.028, s2.b, s2.c - 0.02, s2.c, s2.d], [15, 7, 0, 0, -5, -11]);
  const y3 = useTransform(p, [s3.a, s3.a + 0.028, s3.b, 0.94, 1], [15, 7, 0, 0, 0]);

  const sc0 = useTransform(p, [0, 0.06, s0.c - 0.02, s0.c, s0.d], [1, 1, 1, 0.996, 0.992]);
  const sc1 = useTransform(p, [s1.a, s1.a + 0.028, s1.b, s1.c - 0.02, s1.c, s1.d], [0.992, 0.996, 1, 1, 0.996, 0.992]);
  const sc2 = useTransform(p, [s2.a, s2.a + 0.028, s2.b, s2.c - 0.02, s2.c, s2.d], [0.992, 0.996, 1, 1, 0.996, 0.992]);
  const sc3 = useTransform(p, [s3.a, s3.a + 0.028, s3.b, 1], [0.992, 0.996, 1, 1]);

  const dot0op = useTransform(p, [0, s0.b, s0.c - 0.02, s0.d + 0.015], [1, 1, 0.52, 0.28]);
  const dot0sc = useTransform(p, [0, s0.b, s0.c - 0.02, s0.d + 0.015], [1.06, 1.04, 0.94, 0.86]);
  const dot1op = useTransform(p, [s1.a - 0.02, s1.a + 0.02, s1.b, s1.c - 0.02, s1.c, s1.d + 0.015], [0.28, 0.52, 1, 1, 0.52, 0.28]);
  const dot1sc = useTransform(p, [s1.a - 0.02, s1.a + 0.02, s1.b, s1.c - 0.02, s1.c, s1.d + 0.015], [0.86, 0.94, 1.04, 1.06, 0.94, 0.86]);
  const dot2op = useTransform(p, [s2.a - 0.02, s2.a + 0.02, s2.b, s2.c - 0.02, s2.c, s2.d + 0.015], [0.28, 0.52, 1, 1, 0.52, 0.28]);
  const dot2sc = useTransform(p, [s2.a - 0.02, s2.a + 0.02, s2.b, s2.c - 0.02, s2.c, s2.d + 0.015], [0.86, 0.94, 1.04, 1.06, 0.94, 0.86]);
  const dot3op = useTransform(p, [s3.a - 0.02, s3.a + 0.02, s3.b, s3.c], [0.28, 0.52, 1, 1]);
  const dot3sc = useTransform(p, [s3.a - 0.02, s3.a + 0.02, s3.b, s3.c], [0.86, 0.94, 1.04, 1.06]);
  const stageDriftY = useTransform(p, [0, 1], [0, -4]);

  /* Panel 0 — copy + card micro-motion (tied to progress, not only crossfade). */
  const p0CopyY = useTransform(p, [0, 0.1, 0.25], [14, 0, 0]);
  const p0CopyOp = useTransform(p, [0, 0.09], [0.58, 1]);
  const p0CardY = useTransform(p, [0.025, 0.13, 0.28], [24, 0, 0]);
  const p0CardTiltX = useTransform(p, [0, 0.24], [4.2, 0]);
  const p0BadgeSc = useTransform(p, [0.035, 0.15], [0.88, 1]);
  const p0StatY = [
    useTransform(p, [0.065, 0.18], [11, 0]),
    useTransform(p, [0.085, 0.2], [11, 0]),
    useTransform(p, [0.105, 0.22], [11, 0]),
  ] as const;

  /* Panel 1 */
  const p1IntroY = useTransform(p, [s1.a, s1.b + 0.02], [14, 0]);
  const p1BlockY = useTransform(p, [s1.a + 0.018, s1.b + 0.1], [20, 0]);
  const p1BarScaleX = useTransform(p, [s1.a, s1.a + 0.15], [0.04, 1]);
  const p1DonutRot = useTransform(p, [s1.b, s1.c + 0.02], [-3.5, 78]);
  const p1DonutPct = useTransform(p, [s1.a + 0.02, s1.c + 0.06], [0, 100]);

  /* Panel 2 */
  const p2IntroY = useTransform(p, [s2.a, s2.b + 0.02], [13, 0]);
  const p2CardY = [
    useTransform(p, [s2.a + 0.028, s2.a + 0.16], [16, 0]),
    useTransform(p, [s2.a + 0.055, s2.a + 0.19], [16, 0]),
    useTransform(p, [s2.a + 0.082, s2.a + 0.22], [16, 0]),
  ] as const;

  /* Panel 3 */
  const p3IntroY = useTransform(p, [s3.a, s3.b + 0.02], [13, 0]);
  const p3StepY = [
    useTransform(p, [s3.a + 0.028, s3.a + 0.17], [17, 0]),
    useTransform(p, [s3.a + 0.055, s3.a + 0.2], [17, 0]),
    useTransform(p, [s3.a + 0.082, s3.a + 0.23], [17, 0]),
  ] as const;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#101219]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(34,197,94,0.06),transparent_55%)]"
        aria-hidden
      />
      <NarrativeAmbientField p={p} />

      {/* Chapter rail — always visible for orientation */}
      <div
        className="absolute top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2 sm:gap-2.5"
        style={{ right: "max(0.75rem, env(safe-area-inset-right, 0px))" }}
        aria-hidden
      >
        <motion.span
          className="h-2 w-2 rounded-full bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.45)]"
          style={{ opacity: dot0op, scale: dot0sc }}
        />
        <motion.span
          className="h-2 w-2 rounded-full bg-cyan-400/75 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
          style={{ opacity: dot1op, scale: dot1sc }}
        />
        <motion.span
          className="h-2 w-2 rounded-full bg-fuchsia-400/70 shadow-[0_0_12px_rgba(192,132,252,0.35)]"
          style={{ opacity: dot2op, scale: dot2sc }}
        />
        <motion.span
          className="h-2 w-2 rounded-full bg-emerald-300/75 shadow-[0_0_12px_rgba(110,231,183,0.35)]"
          style={{ opacity: dot3op, scale: dot3sc }}
        />
      </div>

      {/* minmax(0,1fr): stage gets real height so absolute panels can center (flex-1 alone collapses). */}
      <motion.div
        className="relative z-10 grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.25rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.25rem,env(safe-area-inset-right,0px))] md:pl-[max(1.5rem,env(safe-area-inset-left,0px))] md:pr-[max(1.5rem,env(safe-area-inset-right,0px))]"
        style={{ y: stageDriftY }}
      >
        <div className="relative min-h-0 overflow-hidden">
          {/* Panel 0 — Recommendations */}
          <motion.div
            className="absolute inset-0 flex h-full min-h-0 max-h-full items-start justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain pb-8 pt-8 will-change-[transform,opacity] sm:pb-10 sm:pt-10 md:pt-12"
            style={{ opacity: op0, y: y0, scale: sc0 }}
          >
            <div className="mx-auto grid w-full max-w-6xl gap-8 px-2 py-2 sm:px-3 sm:py-4 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-12 lg:[perspective:1200px]">
              <motion.div style={{ y: p0CopyY, opacity: p0CopyOp }}>
                <SectionEyebrow accent="emerald">Recommendations</SectionEyebrow>
                <h2 className={headline}>Rules-first signals per position</h2>
                <p className={`mt-4 max-w-md ${body}`}>Add, trim, or wait—from your targets, averages, and context.</p>
              </motion.div>
              <motion.div
                className="relative mx-auto w-full max-w-md [transform-style:preserve-3d] lg:mx-0 lg:ml-auto"
                style={{ y: p0CardY, rotateX: p0CardTiltX }}
              >
                <div className="rounded-[22px] border border-white/[0.09] bg-gradient-to-br from-zinc-900/90 via-zinc-900/95 to-[#1a1f2c]/96 p-5 shadow-[0_28px_70px_-32px_rgba(10,12,18,0.72),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
                  <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                    <span className="text-xs font-medium text-zinc-500">Live signal</span>
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200/85">
                      Rules
                    </span>
                  </div>
                  <motion.span
                    className="mt-3 inline-flex origin-left rounded-xl border border-emerald-400/28 bg-emerald-500/[0.09] px-3 py-1.5 text-lg font-bold text-emerald-100 sm:text-xl"
                    style={{ scale: p0BadgeSc }}
                  >
                    WAIT_ADD
                  </motion.span>
                  <p className="mt-2 text-sm text-zinc-400">Near your next buy zone.</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { k: "Next", v: "$142" },
                      { k: "MA 50", v: "$138" },
                      { k: "Score", v: "77" },
                    ].map((x, i) => (
                      <motion.div
                        key={x.k}
                        className="rounded-xl border border-white/[0.06] bg-[#1a1d28]/55 px-2 py-2"
                        style={{ y: p0StatY[i] }}
                      >
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{x.k}</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-white">{x.v}</p>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-400/12 bg-cyan-500/[0.04] px-2.5 py-2.5">
                    <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/85" strokeWidth={1.5} aria-hidden />
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      <span className="font-medium text-zinc-300">Sentiment</span> on headlines—context for your rules.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Panel 1 — Allocation (tight vertical fit for pinned tour viewport) */}
          <motion.div
            className="absolute inset-0 flex h-full min-h-0 max-h-full items-start justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain pb-6 pt-6 will-change-[transform,opacity] sm:pb-8 sm:pt-7"
            style={{ opacity: op1, y: y1, scale: sc1 }}
          >
            <div className="mx-auto w-full max-w-3xl px-2 py-1 sm:px-3 sm:py-2">
              <motion.div className="text-center lg:text-left" style={{ y: p1IntroY }}>
                <div className="flex justify-center lg:justify-start">
                  <SectionEyebrow accent="cyan">Portfolio intelligence</SectionEyebrow>
                </div>
                <h2 className={`${headline} mt-0.5`}>Allocation at a glance</h2>
                <p className={`mx-auto mt-2 max-w-lg lg:mx-0 ${body}`}>Sleeves and rollups for the full book.</p>
              </motion.div>
              <motion.div
                className="mt-4 rounded-[20px] border border-white/[0.06] bg-zinc-950/55 p-4 sm:bg-zinc-950/40 sm:p-5 sm:backdrop-blur-[2px]"
                style={{ y: p1BlockY }}
              >
                <p className="mb-1.5 text-center text-[11px] font-medium text-zinc-500 lg:text-left">By sleeve</p>
                <motion.div
                  className="flex h-2.5 origin-left overflow-hidden rounded-full bg-zinc-900/90 p-px ring-1 ring-white/[0.05] will-change-transform sm:h-3"
                  style={{ scaleX: p1BarScaleX }}
                >
                  <div className="flex h-full w-full flex-1 overflow-hidden rounded-full bg-[#252831]/65">
                    {allocMeta.map((x) => (
                      <div
                        key={x.label}
                        className="relative h-full overflow-hidden first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${x.w}%` }}
                      >
                        <div className={cn("h-full w-full origin-left shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]", x.c)} />
                      </div>
                    ))}
                  </div>
                </motion.div>
                <ul className="mt-2.5 flex flex-wrap justify-center gap-1.5 lg:justify-start">
                  {allocMeta.map((x) => (
                    <li
                      key={x.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-[#1a1d28]/50 px-2 py-0.5 text-[10px] text-zinc-300 sm:text-[11px]"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", x.c)} aria-hidden />
                      <span className="font-medium text-zinc-200">{x.label}</span>
                      <span className="tabular-nums text-zinc-500">{x.pct}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative mx-auto mt-3 h-[132px] w-[132px] sm:mt-4 sm:h-[152px] sm:w-[152px] md:h-[168px] md:w-[168px]">
                  <motion.div
                    className="absolute inset-0 will-change-transform"
                    style={{ rotate: p1DonutRot }}
                    aria-hidden
                  >
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(from -8deg, rgba(52,211,153,0.42) 0deg 137deg, rgba(34,211,238,0.38) 137deg 223deg, rgba(167,139,250,0.34) 223deg 288deg, rgba(113,113,122,0.42) 288deg 360deg)`,
                        mask: "radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px))",
                        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px))",
                      }}
                    />
                  </motion.div>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <AllocationDonutCenter pct={p1DonutPct} />
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Panel 2 — News (compact grid + scroll so nothing clips in pinned viewport) */}
          <motion.div
            className="absolute inset-0 flex h-full min-h-0 max-h-full items-start justify-center overflow-y-auto overflow-x-hidden overscroll-y-contain pb-6 pt-5 will-change-[transform,opacity] sm:pb-8 sm:pt-6"
            style={{ opacity: op2, y: y2, scale: sc2 }}
          >
            <div className="mx-auto w-full max-w-6xl px-2 py-1 sm:px-3 sm:py-2">
              <motion.div className="text-center" style={{ y: p2IntroY }}>
                <div className="flex justify-center">
                  <span className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20 sm:mb-2 sm:h-9 sm:w-9">
                    <Newspaper className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.5} aria-hidden />
                  </span>
                </div>
                <div className="flex justify-center">
                  <SectionEyebrow accent="violet">News</SectionEyebrow>
                </div>
                <h2 className={`${headline} mt-0.5`}>Headlines & sentiment</h2>
                <p className={`mx-auto mt-1.5 max-w-lg sm:mt-2 ${body}`}>
                  Same layout as the app: filters, search, and bullish / bearish / neutral tags on every story.
                </p>
              </motion.div>

              <div className="mt-4 grid grid-cols-1 gap-3 min-[1100px]:grid-cols-12 min-[1100px]:gap-5">
                <aside className="pointer-events-none order-1 min-[1100px]:order-2 min-[1100px]:col-span-4">
                  <div className="grid grid-cols-2 gap-2 min-[1100px]:flex min-[1100px]:flex-col min-[1100px]:gap-4">
                    <div className="rounded-xl border border-white/[0.08] bg-zinc-950/55 p-1 shadow-sm min-[1100px]:rounded-2xl">
                      <p className="px-2 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 min-[1100px]:px-3 min-[1100px]:pt-2.5 min-[1100px]:text-[10px]">
                        View
                      </p>
                      <div className="mt-0.5 flex flex-col gap-0.5 p-0.5 min-[1100px]:mt-1 min-[1100px]:gap-1 min-[1100px]:p-1">
                        {[
                          { label: "All", count: 24, on: true },
                          { label: "Macro", count: 8, on: false },
                          { label: "Portfolio", count: 16, on: false },
                        ].map((t) => (
                          <div
                            key={t.label}
                            className={cn(
                              "flex w-full items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold min-[1100px]:rounded-xl min-[1100px]:px-3 min-[1100px]:py-2 min-[1100px]:text-xs",
                              t.on
                                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-zinc-950 shadow-sm"
                                : "text-zinc-400"
                            )}
                          >
                            <span>{t.label}</span>
                            <span className={cn("tabular-nums font-bold", t.on ? "text-[10px] text-zinc-900/80" : "text-[10px] text-zinc-600")}>
                              {t.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-zinc-950/55 p-2 shadow-sm min-[1100px]:rounded-2xl min-[1100px]:p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 min-[1100px]:text-[10px]">Search</p>
                      <div className="relative mt-1 min-[1100px]:mt-2">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600 min-[1100px]:left-2.5 min-[1100px]:h-3.5 min-[1100px]:w-3.5" aria-hidden />
                        <div className="w-full rounded-lg border border-white/10 bg-[#1a1d28]/55 py-2 pl-7 pr-2 text-left text-[10px] text-zinc-500 min-[1100px]:rounded-xl min-[1100px]:py-2.5 min-[1100px]:pl-9 min-[1100px]:text-xs">
                          Symbol, headline…
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="order-2 min-w-0 min-[1100px]:order-1 min-[1100px]:col-span-8">
                  <p className="mb-2 text-[10px] text-zinc-500 sm:text-xs">
                    <span className="font-semibold tabular-nums text-zinc-300">{newsMini.length}</span> articles (demo)
                  </p>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    {newsMini.map((n, i) => (
                      <motion.li key={n.sym + n.title} className="list-none" style={{ y: p2CardY[i] }}>
                        <article className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-zinc-950/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-2xl sm:p-3.5">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex h-6 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-[9px] font-bold tracking-wide ring-1 sm:h-7 sm:min-w-[2.25rem] sm:rounded-lg sm:px-2 sm:text-[10px]",
                                n.sym === "MACRO"
                                  ? "bg-amber-500/12 text-amber-100 ring-amber-400/22"
                                  : "bg-emerald-500/12 text-emerald-100 ring-emerald-400/22"
                              )}
                            >
                              {n.sym === "MACRO" ? "Macro" : n.sym}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-[#1a1d28]/55 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sentimentDotClass(n.tone))} aria-hidden />
                              {tourSentimentLabel(n.tone)}
                            </span>
                          </div>
                          <h3 className="text-xs font-semibold leading-snug tracking-tight text-zinc-100 line-clamp-2 sm:text-sm sm:line-clamp-3">{n.title}</h3>
                          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-[10px] text-zinc-500 sm:pt-3 sm:text-[11px]">
                            <span className="font-medium text-zinc-400">{n.source}</span>
                            <span className="text-zinc-600" aria-hidden>
                              ·
                            </span>
                            <span>{n.rel}</span>
                          </div>
                        </article>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Panel 3 — Personalized (compact so full beat + footer fit one viewport) */}
          <motion.div
            className="absolute inset-0 flex h-full min-h-0 max-h-full items-center justify-center overflow-hidden overflow-x-hidden py-2 will-change-[transform,opacity] sm:py-3"
            style={{ opacity: op3, y: y3, scale: sc3 }}
          >
            <LandingPersonalizedScrollPanel
              introY={p3IntroY}
              stepYs={p3StepY}
              headlineClass={headline}
              bodyClass={body}
              tourUltraCompact
            />
          </motion.div>
        </div>

        <div className="relative z-20 shrink-0 space-y-2 border-t border-white/[0.05] bg-gradient-to-t from-[#101219] via-[#101219]/98 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-3 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]">
          <NarrativeProgressChrome p={p} />
          <p className="mx-auto max-w-md px-2 text-center text-[9px] leading-snug text-zinc-600 sm:px-3 sm:text-[10px]">
            {interactionHint === "scroll"
              ? "Scroll through this band to see each part, then keep scrolling the page."
              : "Down advances the tour; up rewinds. At the end, one more down continues below. Coming back up: rewind the tour before you can reach the hero again."}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
