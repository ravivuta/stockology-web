"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PieChart } from "lucide-react";

const flankEase = [0.22, 1, 0.36, 1] as const;

/**
 * Right flank: graphics (sparkline, grid, mini bars) bleed into the center-side mask like the
 * chart on the left — no hard column divider. Donut + legend sit on the outer edge with a slight
 * left shift so part of the ring fades too.
 */

const SLICES = [
  { label: "Tech", pct: 40, color: "#22c55e" },
  { label: "Bonds", pct: 22, color: "#2dd4bf" },
  { label: "Intl.", pct: 16, color: "#a78bfa" },
  { label: "Cash", pct: 12, color: "#71717a" },
  { label: "Other", pct: 10, color: "#3f3f46" },
] as const;

const FEATURE_CHIPS = [
  "Drift vs targets",
  "Cost basis & lots",
  "CSV in / out",
  "Rules & prompts",
] as const;

/** Background graphics that span deep into the fade zone (center-ward). */
function FadingGraphicsLayer({ gradId, reduce }: { gradId: string; reduce: boolean }) {
  const sparkD =
    "M0,58 L28,52 L56,48 L84,42 L112,44 L140,36 L168,32 L196,28 L224,22 L252,24 L280,16 L308,12 L320,8";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Horizontal rules — same language as the performance chart */}
      {[22, 38, 54, 70, 86].map((t) => (
        <div
          key={t}
          className="absolute right-4 left-0 h-px bg-emerald-500/[0.07]"
          style={{ top: `${t}%` }}
        />
      ))}

      {/* Sparkline crosses the whole card width so the stroke itself fades on the left */}
      <svg
        viewBox="0 0 320 72"
        preserveAspectRatio="none"
        className="absolute left-[-2%] top-[36%] h-[3.25rem] w-[82%] text-emerald-400/40 sm:h-[3.5rem] sm:w-[86%]"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="35%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <motion.path
          d={sparkD}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.35, ease: flankEase, delay: reduce ? 0 : 0.15 }}
        />
        <motion.path
          d={sparkD}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="4 7"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: flankEase, delay: reduce ? 0 : 0.35 }}
        />
      </svg>

      {/* Mini sleeve bars — anchored from the left, extend under the mask */}
      <div className="absolute left-2 top-[44%] w-[min(48%,11rem)] space-y-1.5 sm:left-2.5 sm:w-[min(50%,12rem)]">
        {SLICES.slice(0, 4).map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/90">
              <motion.div
                className="h-full rounded-full opacity-90"
                style={{ backgroundColor: s.color }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.min(s.pct + 18, 100)}%` }}
                transition={{ duration: 0.65, ease: flankEase, delay: reduce ? 0 : 0.45 + i * 0.08 }}
              />
            </div>
            <motion.span
              className="shrink-0 font-mono text-[8px] tabular-nums text-zinc-500/50 sm:text-[9px]"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.75 + i * 0.06, duration: 0.35 }}
            >
              {s.pct}%
            </motion.span>
          </div>
        ))}
      </div>

      {/* Low-signal feed lines — extra texture in the fade */}
      <div className="absolute bottom-[18%] left-3 max-w-[11rem] font-mono text-[7px] leading-tight text-zinc-600/25 sm:left-4 sm:text-[8px]">
        <p className="truncate">MIX_REBAL · pending</p>
        <p className="truncate">CORR_WINDOW 60d · off</p>
      </div>
    </div>
  );
}

function buildConicGradient() {
  let acc = 0;
  const stops = SLICES.map((s) => {
    const start = acc;
    acc += (s.pct / 100) * 360;
    return `${s.color} ${start.toFixed(2)}deg ${acc.toFixed(2)}deg`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

export function LandingHeroFlankRightPanels() {
  const uid = useId().replace(/:/g, "");
  const sparkGradId = `${uid}spark`;
  const donutBg = buildConicGradient();
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion === true;

  return (
    <div className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
      <FadingGraphicsLayer gradId={sparkGradId} reduce={reduce} />

      <div className="relative z-10 flex h-full min-h-0 flex-col justify-between px-2.5 py-2.5 sm:px-3.5 sm:py-3.5">
        <motion.div
          className="text-right"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: flankEase }}
        >
          <div className="flex items-center justify-end gap-2">
            <motion.span
              initial={reduce ? false : { rotate: -14, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: reduce ? 0 : 0.08 }}
            >
              <PieChart className="h-4 w-4 text-emerald-400/85" strokeWidth={2} aria-hidden />
            </motion.span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">
              Allocation
            </p>
          </div>
          <p className="mt-1 text-balance text-[13px] font-semibold leading-snug text-zinc-100 sm:text-sm">
            How the book is split
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500 sm:text-[11px]">Illustrative · not advice</p>
        </motion.div>

        {/* Pull donut + key left so part of the ring lives in the masked region (like chart lines on the left card) */}
        <div className="my-1.5 flex min-h-0 flex-shrink-0 items-center justify-end pr-0 sm:my-2">
          <div className="flex translate-x-[-0.2rem] items-center gap-2.5 sm:translate-x-[-0.4rem] sm:gap-3.5 xl:gap-4">
            <motion.ul
              className="min-w-0 space-y-1.5 text-right text-[11px] leading-snug sm:text-xs"
              initial={reduce ? false : "hidden"}
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.5 } },
              }}
            >
              {SLICES.map((s) => (
                <motion.li
                  key={s.label}
                  className="flex items-center justify-end gap-2 sm:gap-2.5"
                  variants={{
                    hidden: { opacity: 0, x: 10 },
                    show: { opacity: 1, x: 0, transition: { duration: 0.38, ease: flankEase } },
                  }}
                >
                  <span className="tabular-nums font-medium text-zinc-200">{s.pct}%</span>
                  <span className="text-zinc-500">{s.label}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/15 sm:h-3 sm:w-3"
                    style={{ backgroundColor: s.color }}
                  />
                </motion.li>
              ))}
            </motion.ul>
            <motion.div
              className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-full sm:h-[5.75rem] sm:w-[5.75rem] xl:h-[6rem] xl:w-[6rem]"
              style={{
                background: donutBg,
                WebkitMask: "radial-gradient(circle, transparent 52%, black 53%)",
                mask: "radial-gradient(circle, transparent 52%, black 53%)",
              }}
              initial={reduce ? false : { scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 22, delay: reduce ? 0 : 0.35 }}
              aria-hidden
            />
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: flankEase, delay: reduce ? 0 : 0.85 }}
        >
          <p className="text-right text-[13px] font-semibold tabular-nums text-emerald-400/95 sm:text-sm">
            +12.4% vs benchmark
            <span className="mt-0.5 block text-[9px] font-normal text-zinc-600 sm:text-[10px]">
              YTD · illustrative
            </span>
          </p>

          <div className="my-2 h-px bg-gradient-to-l from-white/[0.1] to-transparent sm:my-2.5" />

          <p className="text-right text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">
            In the app
          </p>
          <motion.div
            className="mt-1.5 flex flex-wrap justify-end gap-1 sm:gap-1.5"
            initial={reduce ? false : "hidden"}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: reduce ? 0 : 1 } },
            }}
          >
            {FEATURE_CHIPS.map((label) => (
              <motion.span
                key={label}
                className="inline-flex rounded-full border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[9px] font-medium text-zinc-300 sm:px-2.5 sm:py-1 sm:text-[10px]"
                variants={{
                  hidden: { opacity: 0, y: 6, scale: 0.96 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: flankEase } },
                }}
              >
                {label}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
