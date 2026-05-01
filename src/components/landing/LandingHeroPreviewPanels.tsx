"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRightLeft, Target, TrendingDown, TrendingUp } from "lucide-react";

const chartEase = [0.22, 1, 0.36, 1] as const;

/** Shared building blocks for hero flank graphics + full-width product preview. */

function buildNarrativeSeries(n: number) {
  const portfolio: { x: number; y: number }[] = [];
  const benchmark: { x: number; y: number }[] = [];
  let p = 100;
  let b = 100;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const drawdown = t > 0.3 && t < 0.48 ? -3.8 * Math.exp(-(((t - 0.39) / 0.06) ** 2)) : 0;
    const rebalanceLift = t > 0.58 && t < 0.68 ? 1.1 * Math.sin(((t - 0.58) / 0.1) * Math.PI) : 0;
    p += 0.22 + drawdown * 0.08 + rebalanceLift + Math.sin(t * Math.PI * 2.2) * 0.14;
    b += 0.07 + drawdown * 0.045 + Math.sin(t * Math.PI * 1.4) * 0.06;
    portfolio.push({ x: t, y: p });
    benchmark.push({ x: t, y: b });
  }
  return { portfolio, benchmark };
}

const N = 52;
const { portfolio: PORT, benchmark: BENCH } = buildNarrativeSeries(N);

const CHART_W = 400;
const CHART_H = 138;
const PAD = { l: 10, r: 12, t: 22, b: 30 };

function yMinMax(pts: { y: number }[]) {
  const ys = pts.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.08;
  return { yMin: lo - pad, yMax: hi + pad };
}

const { yMin, yMax } = yMinMax([...PORT, ...BENCH]);

function toPath(pts: { x: number; y: number }[]) {
  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;
  const xAt = (t: number) => PAD.l + t * innerW;
  const yAt = (v: number) => PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  return pts
    .map((p, i) => {
      const x = xAt(p.x);
      const y = yAt(p.y);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaUnder(pts: { x: number; y: number }[]) {
  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;
  const xAt = (t: number) => PAD.l + t * innerW;
  const yAt = (v: number) => PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const yBase = PAD.t + innerH;
  let d = `M ${xAt(pts[0].x).toFixed(2)} ${yBase.toFixed(2)}`;
  for (const p of pts) {
    d += ` L ${xAt(p.x).toFixed(2)} ${yAt(p.y).toFixed(2)}`;
  }
  d += ` L ${xAt(pts[pts.length - 1].x).toFixed(2)} ${yBase.toFixed(2)} Z`;
  return d;
}

const portD = toPath(PORT);
const benchD = toPath(BENCH);
const areaD = areaUnder(PORT);
const lastPort = PORT[PORT.length - 1];
const innerW = CHART_W - PAD.l - PAD.r;
const innerH = CHART_H - PAD.t - PAD.b;
const xAt = (t: number) => PAD.l + t * innerW;
const yAt = (v: number) => PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
const annDrawdown = { x: xAt(0.39), y: yAt(PORT[Math.floor(N * 0.39)]!.y) };
const annRebalance = { x: xAt(0.63), y: yAt(PORT[Math.floor(N * 0.63)]!.y) };

const holdings = [
  { sym: "MSFT", pct: 18.2, chg: 1.24 },
  { sym: "AAPL", pct: 14.1, chg: -0.42 },
  { sym: "NVDA", pct: 11.8, chg: 2.08 },
  { sym: "GOOGL", pct: 9.4, chg: 0.61 },
] as const;

const allocationRows = [
  { label: "Tech", current: 42, target: 35, action: "Trim ~7%" },
  { label: "Bonds", current: 18, target: 22, action: "Add ~4%" },
  { label: "Intl.", current: 14, target: 15, action: "Near target" },
] as const;

const insights = [
  { icon: AlertTriangle, tone: "amber" as const, title: "Overweight Tech (+18% vs target)" },
  { icon: Target, tone: "cyan" as const, title: "3 names → 72% of YTD return" },
  { icon: TrendingDown, tone: "violet" as const, title: "Cash at ~1.8% vs policy target" },
] as const;

const toneIcon = {
  amber: "bg-amber-500/12 text-amber-300/95",
  cyan: "bg-cyan-500/12 text-cyan-300/95",
  violet: "bg-violet-500/12 text-violet-300/95",
} as const;

/** Performance header + chart + insight rows (no outer card). */
export function LandingHeroPreviewChartSection({
  chartId,
  variant = "default",
}: {
  chartId: string;
  variant?: "default" | "heroFlank";
}) {
  const reduce = useReducedMotion();
  const F = variant === "heroFlank";
  const benchSw = F ? 2.05 : 1.75;
  const portSw = F ? 2.65 : 2.25;
  const lblYou = F ? 10 : 9;
  const lblSpy = F ? 10 : 9;
  const annFs = F ? 9 : 8;
  const annPadX = F ? 38 : 34;
  const annPadX2 = F ? 40 : 36;
  const annH = F ? 17 : 15;
  const dotR = F ? 4.75 : 4;
  const dotSw = F ? 1.35 : 1.2;

  return (
    <div className={`flex h-full min-h-0 flex-col ${F ? "w-full min-w-0" : ""}`}>
      <div
        className={`flex shrink-0 flex-col gap-2 border-b border-white/[0.06] sm:flex-row sm:items-center sm:justify-between ${
          F ? "px-2.5 py-2.5 sm:px-3.5 sm:py-3" : "px-4 py-3 sm:px-5 sm:py-3.5"
        }`}
      >
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: chartEase }}
        >
          <p
            className={`font-semibold uppercase tracking-[0.2em] text-zinc-500 ${F ? "text-[10px] sm:text-[11px]" : "text-[10px]"}`}
          >
            Performance
          </p>
          <p className={`mt-0.5 font-medium text-zinc-200 ${F ? "text-[13px] sm:text-[14px]" : "text-sm"}`}>
            Your book vs benchmark
          </p>
        </motion.div>
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: chartEase, delay: 0.06 }}
        >
          <motion.span
            className={`inline-flex items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 font-semibold text-emerald-200 ${
              F ? "px-2.5 py-1 text-[11px] sm:text-xs" : "px-2.5 py-1 text-xs"
            }`}
            initial={reduce ? false : { scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22, delay: reduce ? 0 : 0.12 }}
          >
            +12.4% vs benchmark
          </motion.span>
          <span className={`text-zinc-600 ${F ? "text-[10px] sm:text-[11px]" : "text-[10px]"}`}>YTD · illustrative</span>
        </motion.div>
      </div>

      <div
        className={`min-h-0 w-full flex-1 ${F ? "px-2.5 pt-0.5 sm:px-3.5 sm:pt-1.5" : "px-3 pt-2 sm:px-4 sm:pt-3"}`}
      >
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className={`h-auto w-full ${F ? "max-h-[8.25rem] sm:max-h-[9rem]" : "max-h-[9.5rem] sm:max-h-[10.5rem]"}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${chartId}-stroke`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = PAD.t + (CHART_H - PAD.t - PAD.b) * (1 - t);
            return (
              <line
                key={t}
                x1={PAD.l}
                y1={y}
                x2={CHART_W - PAD.r}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
            );
          })}

          <motion.path
            d={areaD}
            fill={`url(#${chartId}-fill)`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, ease: chartEase, delay: reduce ? 0 : 0.85 }}
          />
          <motion.path
            d={benchD}
            fill="none"
            stroke="rgba(161,161,170,0.42)"
            strokeWidth={benchSw}
            strokeLinecap="round"
            strokeDasharray="4 6"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.25, ease: chartEase, delay: reduce ? 0 : 0.2 }}
          />
          <motion.path
            d={portD}
            fill="none"
            stroke={`url(#${chartId}-stroke)`}
            strokeWidth={portSw}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.55, ease: chartEase, delay: reduce ? 0 : 0.08 }}
          />

          <motion.circle
            cx={xAt(lastPort.x)}
            cy={yAt(lastPort.y)}
            fill="#22c55e"
            stroke="#052e16"
            strokeWidth={dotSw}
            initial={reduce ? false : { r: 0, opacity: 0 }}
            animate={{ r: dotR, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 18, delay: reduce ? 0 : 1.35 }}
          />

          <motion.g
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: chartEase, delay: reduce ? 0 : 1.45 }}
          >
            <line
              x1={annDrawdown.x}
              y1={annDrawdown.y - 4}
              x2={annDrawdown.x}
              y2={annDrawdown.y - 24}
              stroke="rgba(248,113,113,0.48)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <rect
              x={annDrawdown.x - annPadX}
              y={annDrawdown.y - (F ? 46 : 42)}
              width={annPadX * 2}
              height={annH}
              rx={4}
              fill="rgba(24,24,27,0.94)"
              stroke="rgba(248,113,113,0.22)"
              strokeWidth={0.75}
            />
            <text
              x={annDrawdown.x}
              y={annDrawdown.y - (F ? 34 : 31)}
              textAnchor="middle"
              fill="#fca5a5"
              fontSize={annFs}
              fontWeight={600}
            >
              Drawdown
            </text>
          </motion.g>

          <motion.g
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: chartEase, delay: reduce ? 0 : 1.55 }}
          >
            <line
              x1={annRebalance.x}
              y1={annRebalance.y + 5}
              x2={annRebalance.x}
              y2={annRebalance.y + 26}
              stroke="rgba(52,211,153,0.42)"
              strokeWidth={1}
            />
            <rect
              x={annRebalance.x - annPadX2}
              y={annRebalance.y + (F ? 30 : 28)}
              width={annPadX2 * 2}
              height={annH}
              rx={4}
              fill="rgba(24,24,27,0.94)"
              stroke="rgba(52,211,153,0.18)"
              strokeWidth={0.75}
            />
            <text
              x={annRebalance.x}
              y={annRebalance.y + (F ? 42 : 39)}
              textAnchor="middle"
              fill="#86efac"
              fontSize={annFs}
              fontWeight={600}
            >
              Rebalance
            </text>
          </motion.g>

          <motion.text
            x={PAD.l}
            y={14}
            fill="rgba(250,250,250,0.78)"
            fontSize={lblYou}
            fontWeight={600}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: reduce ? 0 : 0.05 }}
          >
            You
          </motion.text>
          <motion.text
            x={CHART_W - PAD.r}
            y={14}
            fill="rgba(161,161,170,0.88)"
            fontSize={lblSpy}
            textAnchor="end"
            fontWeight={500}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: reduce ? 0 : 0.12 }}
          >
            S&P 500
          </motion.text>
        </svg>
      </div>

      <motion.ul
        className={`mt-auto shrink-0 space-y-0 divide-y divide-white/[0.05] border-t border-white/[0.05] pb-1.5 ${
          F ? "max-w-full" : ""
        }`}
        initial={reduce ? false : "hidden"}
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: reduce ? 0 : 1.05 },
          },
        }}
      >
        {insights.map(({ icon: Icon, tone, title }) => (
          <motion.li
            key={title}
            className={`flex items-center gap-2.5 ${F ? "px-2.5 py-2 sm:px-3.5 sm:py-2.5" : "px-4 py-2.5 sm:px-5 sm:py-2.5"}`}
            variants={{
              hidden: { opacity: 0, x: -8 },
              show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: chartEase } },
            }}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-md ${toneIcon[tone]} ${F ? "h-7 w-7 sm:h-8 sm:w-8" : "h-7 w-7"}`}
            >
              <Icon className={F ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-3.5 w-3.5"} strokeWidth={2} aria-hidden />
            </span>
            <p
              className={`min-w-0 text-left font-semibold leading-snug text-zinc-100 ${F ? "text-[12px] sm:text-[13px]" : "text-[13px]"}`}
            >
              {title}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

/** Top holdings + targets & rules (no outer card). */
export function LandingHeroPreviewHoldingsTargetsSection() {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: chartEase }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Top holdings</p>
          <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-600">
            <TrendingUp className="h-3 w-3 text-emerald-400/80" aria-hidden />
            Weight
          </span>
        </div>
        <ul className="space-y-1.5">
          {holdings.map((h, i) => (
            <motion.li
              key={h.sym}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-[#1a1d28]/55 px-2.5 py-1.5"
              initial={reduce ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: chartEase, delay: reduce ? 0 : 0.08 + i * 0.07 }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="font-mono text-xs font-semibold tabular-nums text-zinc-100">{h.sym}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{h.pct.toFixed(1)}%</span>
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                  h.chg >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {h.chg >= 0 ? "+" : ""}
                {h.chg.toFixed(2)}%
              </span>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        className="border-t border-white/[0.06] pt-4"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: chartEase, delay: reduce ? 0 : 0.35 }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Targets & rules</p>
          <ArrowRightLeft className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
        </div>
        <ul className="space-y-3">
          {allocationRows.map((row, i) => (
            <li key={row.label}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-300">{row.label}</span>
                <span className="tabular-nums text-zinc-500">
                  <span className="text-zinc-200">{row.current}%</span>
                  <span className="mx-1 text-zinc-600">→</span>
                  <span>{row.target}%</span>
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-800/90">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600/90 to-emerald-400/85"
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.min(row.current, 100)}%` }}
                  transition={{ duration: 0.7, ease: chartEase, delay: reduce ? 0 : 0.45 + i * 0.12 }}
                />
                <motion.div
                  className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.45)]"
                  style={{ left: `${row.target}%` }}
                  initial={reduce ? false : { opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ delay: reduce ? 0 : 0.85 + i * 0.1, duration: 0.35, ease: chartEase }}
                />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-emerald-200/85">{row.action}</p>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
