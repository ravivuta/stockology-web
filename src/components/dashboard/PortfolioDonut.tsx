"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Segment = {
  name: string;
  value: number;
  color: string;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

/** Single open arc (stroke path), angles clockwise from top (0° = 12 o'clock). */
function arcStrokeD(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.05) return "";
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = sweep > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/** Closed full ring as one path (two semicircles) for stroke animation. */
function fullRingD(cx: number, cy: number, r: number) {
  return `M ${cx - r},${cy} A ${r} ${r} 0 1 1 ${cx + r},${cy} A ${r} ${r} 0 1 1 ${cx - r},${cy}`;
}

const VIEW = 100;
const CX = VIEW / 2;
const CY = VIEW / 2;

export function PortfolioDonut({
  segments,
  totalLabel = "Total",
  totalValue,
  className = "",
}: {
  segments: Segment[];
  totalLabel?: string;
  totalValue: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  const { midR, strokeW } = useMemo(() => {
    const outer = 42;
    const inner = 26;
    return { midR: (inner + outer) / 2, strokeW: outer - inner };
  }, []);

  const arcs = useMemo(() => {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total <= 0) {
      return [] as { d: string; color: string; name: string }[];
    }

    const norm = segments.map((s) => ({ ...s, f: s.value / total }));
    let significant = norm.filter((s) => s.f >= 0.002);
    if (significant.length === 0 && norm.length > 0) {
      const top = norm.reduce((a, b) => (b.f > a.f ? b : a));
      significant = [{ ...top, f: 1 }];
    }
    if (significant.length === 0) {
      return [];
    }

    if (significant.length === 1 && significant[0].f >= 0.998) {
      return [{ d: fullRingD(CX, CY, midR), color: significant[0].color, name: significant[0].name }];
    }

    let cursor = 0;
    const out: { d: string; color: string; name: string }[] = [];
    for (const s of significant) {
      const span = 360 * s.f;
      const d = arcStrokeD(CX, CY, midR, cursor, cursor + span);
      if (d) out.push({ d, color: s.color, name: s.name });
      cursor += span;
    }
    return out;
  }, [segments, midR]);

  const transition = (i: number) =>
    reduceMotion
      ? { duration: 0 }
      : { duration: 0.75, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const };

  const ariaLabel = useMemo(() => {
    const t = segments.reduce((a, s) => a + s.value, 0);
    if (t <= 0) return "Portfolio total, no allocation";
    const parts = segments
      .filter((s) => s.value > 0)
      .map((s) => `${s.name} ${Math.round((s.value / t) * 100)}%`);
    return `Portfolio allocation: ${parts.join(", ")}`;
  }, [segments]);

  return (
    <div
      className={`relative aspect-square w-[140px] shrink-0 sm:w-[152px] ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-full w-full overflow-visible drop-shadow-sm dark:drop-shadow-[0_2px_14px_rgba(0,0,0,0.4)]"
        aria-hidden
      >
        {/* Track ring */}
        <circle
          cx={CX}
          cy={CY}
          r={midR}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeW}
          strokeLinecap="round"
          className="text-primary/28 dark:text-primary/45"
        />
        {arcs.map((arc, i) => (
          <motion.path
            key={`${arc.name}-${i}`}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            initial={reduceMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.9 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={transition(i)}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">{totalLabel}</span>
        <motion.span
          key={totalValue}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.65 }}
          className="mt-0.5 max-w-[5.5rem] truncate text-sm font-bold tabular-nums tracking-tight text-foreground sm:text-[0.95rem]"
        >
          {totalValue}
        </motion.span>
      </div>
    </div>
  );
}
