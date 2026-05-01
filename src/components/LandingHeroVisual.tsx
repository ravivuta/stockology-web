"use client";

import { useId, useEffect, useLayoutEffect, useRef, useState } from "react";

function seededNoise(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildSeries(n: number) {
  let port = 100;
  let bench = 100;
  const portfolio: { x: number; y: number }[] = [];
  const benchmark: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    port += 0.35 + seededNoise(i * 2) * 0.55 - 0.12 + Math.sin(t * Math.PI * 3) * 0.15;
    bench += 0.18 + seededNoise(i * 2 + 1) * 0.25 - 0.1;
    portfolio.push({ x: t, y: port });
    benchmark.push({ x: t, y: bench });
  }
  return { portfolio, benchmark };
}

const N = 56;
const { portfolio: PORT, benchmark: BENCH } = buildSeries(N);

function toPath(
  pts: { x: number; y: number }[],
  width: number,
  height: number,
  pad: { l: number; r: number; t: number; b: number },
  yMin: number,
  yMax: number
) {
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (t: number) => pad.l + t * innerW;
  const yAt = (v: number) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const d = pts
    .map((p, i) => {
      const x = xAt(p.x);
      const y = yAt(p.y);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return { d, last: { x: xAt(pts[pts.length - 1].x), y: yAt(pts[pts.length - 1].y) } };
}

function areaPath(
  pts: { x: number; y: number }[],
  width: number,
  height: number,
  pad: { l: number; r: number; t: number; b: number },
  yMin: number,
  yMax: number
) {
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (t: number) => pad.l + t * innerW;
  const yAt = (v: number) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const yBase = pad.t + innerH;
  let d = `M ${xAt(pts[0].x).toFixed(2)} ${yBase.toFixed(2)}`;
  for (const p of pts) {
    d += ` L ${xAt(p.x).toFixed(2)} ${yAt(p.y).toFixed(2)}`;
  }
  d += ` L ${xAt(pts[pts.length - 1].x).toFixed(2)} ${yBase.toFixed(2)} Z`;
  return d;
}

const W = 440;
const H = 220;
const PAD = { l: 8, r: 8, t: 28, b: 36 };
const yMin = 95;
const yMax = Math.max(...PORT.map((p) => p.y), ...BENCH.map((p) => p.y)) + 4;

const portLine = toPath(PORT, W, H, PAD, yMin, yMax);
const benchLine = toPath(BENCH, W, H, PAD, yMin, yMax);
const portArea = areaPath(PORT, W, H, PAD, yMin, yMax);

const ARC_R = 68;
const CX = 100;
const CY = 100;
const polar = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: CX + ARC_R * Math.cos(r), y: CY + ARC_R * Math.sin(r) };
};
const P0 = polar(-90);
const P1 = polar(30);
const P2 = polar(150);
const fmt = (p: { x: number; y: number }) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
const arc1 = `M ${fmt(P0)} A ${ARC_R} ${ARC_R} 0 0 1 ${fmt(P1)}`;
const arc2 = `M ${fmt(P1)} A ${ARC_R} ${ARC_R} 0 0 1 ${fmt(P2)}`;
const arc3 = `M ${fmt(P2)} A ${ARC_R} ${ARC_R} 0 0 1 ${fmt(P0)}`;

export function LandingHeroVisual() {
  const uid = useId();
  const gid = uid.replace(/:/g, "");
  const lineRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rm = mq.matches;
    setReduceMotion(rm);
    if (!rm && lineRef.current) {
      setPathLen(lineRef.current.getTotalLength());
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const rm = mq.matches;
      setReduceMotion(rm);
      if (!rm && lineRef.current) {
        setPathLen(lineRef.current.getTotalLength());
      } else {
        setPathLen(0);
      }
    };
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const drawLine = pathLen > 0 && !reduceMotion;

  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
      <div
        className="pointer-events-none absolute -right-6 -top-20 h-80 w-80 rounded-full bg-landing-accent/25 blur-[100px] motion-safe:animate-[pulse_6s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-8 h-72 w-72 rounded-full bg-landing-iris/20 blur-[90px] motion-safe:animate-[pulse_7s_ease-in-out_infinite_1s]"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl border border-landing-border bg-landing-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_64px_-12px_rgba(0,0,0,0.65)] sm:rounded-3xl sm:p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.65] landing-grid-bg rounded-[inherit]"
          aria-hidden
        />
        <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-landing-muted">
            Portfolio trajectory
          </p>
          <span className="shrink-0 rounded-md border border-landing-line bg-landing-raised/90 px-2 py-0.5 font-mono text-[9px] font-medium tracking-wide text-landing-dim">
            sample
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="relative h-auto w-full overflow-visible"
          role="img"
          aria-label="Stylized chart: allocation path versus benchmark over time"
        >
          <defs>
            <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
              <stop offset="45%" stopColor="#34d399" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="1" />
              <stop offset="50%" stopColor="#22c55e" stopOpacity="1" />
              <stop offset="100%" stopColor="#86efac" stopOpacity="1" />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = PAD.t + (H - PAD.t - PAD.b) * (1 - t);
            return (
              <line
                key={t}
                x1={PAD.l}
                y1={y}
                x2={W - PAD.r}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
            );
          })}

          <path d={portArea} fill={`url(#${gid}-area)`} />

          <path
            d={benchLine.d}
            fill="none"
            stroke="rgba(161,161,170,0.45)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 7"
          />

          <path
            ref={lineRef}
            d={portLine.d}
            fill="none"
            stroke={`url(#${gid}-stroke)`}
            strokeWidth={2.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${gid}-glow)`}
            className={drawLine ? "landing-hero-chart-line-dark" : undefined}
            style={
              drawLine
                ? {
                    strokeDasharray: pathLen,
                    strokeDashoffset: pathLen,
                  }
                : undefined
            }
          />

          <circle
            cx={portLine.last.x}
            cy={portLine.last.y}
            r={5.5}
            fill="#22c55e"
            stroke="#052e16"
            strokeWidth={1.5}
            className={drawLine ? "landing-hero-chart-dot" : undefined}
          />
          <circle
            cx={portLine.last.x}
            cy={portLine.last.y}
            r={16}
            fill="#22c55e"
            fillOpacity="0.15"
            className="motion-reduce:opacity-0"
          />

          <text x={PAD.l} y={18} fill="rgba(250,250,250,0.85)" fontSize={10} className="font-mono">
            You
          </text>
          <text
            x={W - PAD.r}
            y={18}
            fill="rgba(161,161,170,0.9)"
            fontSize={10}
            textAnchor="end"
            className="font-mono"
          >
            Benchmark
          </text>
          <text x={PAD.l} y={H - 6} fill="rgba(113,113,122,0.85)" fontSize={9} className="font-mono">
            time →
          </text>
        </svg>

        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-landing-border pt-4 font-mono text-[10px] text-landing-muted sm:justify-start">
          <span className="flex items-center gap-2">
            <span className="h-1 w-8 rounded-full bg-gradient-to-r from-landing-accent-soft to-landing-accent shadow-[0_0_12px_rgba(34,197,94,0.45)]" />
            Your book
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-8 border-t border-dashed border-landing-muted/70" />
            Benchmark
          </span>
        </div>
      </div>

      {/* Allocation ring — emerald / teal / violet (observability-style); omit below lg to keep marketing hero shorter on small viewports */}
      <div className="relative mx-auto mt-10 hidden max-w-[280px] lg:block">
        <p className="mb-4 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.32em] text-landing-dim">
          Allocation levers
        </p>
        <div className="relative mx-auto aspect-square w-full max-w-[240px]">
          <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`${gid}-seg1`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id={`${gid}-seg2`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#14b8a6" />
              </linearGradient>
              <linearGradient id={`${gid}-seg3`} x1="100%" y1="50%" x2="0%" y2="50%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            <circle cx={CX} cy={CY} r={94} fill="#22c55e" fillOpacity="0.06" className="motion-safe:animate-[pulse_5s_ease-in-out_infinite]" />

            <g transform={`translate(${CX} ${CY})`}>
              <g
                className="motion-safe:animate-[spin_56s_linear_infinite] motion-reduce:animate-none"
                style={{ transformBox: "fill-box" as const, transformOrigin: "0px 0px" }}
              >
                <circle cx={0} cy={0} r={88} fill="none" stroke="rgba(34,197,94,0.12)" strokeWidth={1} strokeDasharray="2 10" />
              </g>
            </g>

            <path
              d={arc1}
              fill="none"
              stroke={`url(#${gid}-seg1)`}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={arc2}
              fill="none"
              stroke={`url(#${gid}-seg2)`}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={arc3}
              fill="none"
              stroke={`url(#${gid}-seg3)`}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <circle cx={CX} cy={CY} r={48} fill="#18181b" stroke="rgba(63,63,70,0.9)" strokeWidth={1} />
            <circle cx={CX} cy={CY} r={40} fill="none" stroke="rgba(34,197,94,0.15)" strokeWidth={5} />

            <text
              x={CX}
              y={CY - 6}
              textAnchor="middle"
              fill="#fafafa"
              fontSize={9}
              fontWeight={600}
              letterSpacing="0.22em"
              className="font-mono"
            >
              SIZE
            </text>
            <text
              x={CX}
              y={CY + 8}
              textAnchor="middle"
              fill="#4ade80"
              fontSize={8}
              fontWeight={600}
              letterSpacing="0.28em"
              className="font-mono"
            >
              TIME
            </text>
            <text
              x={CX}
              y={CY + 22}
              textAnchor="middle"
              fill="rgba(167,139,250,0.95)"
              fontSize={7.5}
              letterSpacing="0.2em"
              className="font-mono"
            >
              RISK
            </text>
          </svg>

          <span className="absolute -left-1 top-2 max-w-[6.2rem] rounded-lg border border-landing-border bg-landing-raised/95 px-2 py-1.5 text-[9px] font-medium leading-snug text-landing-muted shadow-lg backdrop-blur-sm sm:-left-4">
            Limits scale with portfolio size
          </span>
          <span className="absolute -right-1 top-[42%] max-w-[6rem] rounded-lg border border-landing-border bg-landing-raised/95 px-2 py-1.5 text-[9px] font-medium leading-snug text-landing-muted shadow-lg backdrop-blur-sm sm:-right-5">
            Entries near moving averages
          </span>
          <span className="absolute -bottom-1 left-1/2 max-w-[7rem] -translate-x-1/2 translate-y-1 rounded-lg border border-landing-accent/25 bg-landing-surface/95 px-2 py-1.5 text-center text-[9px] font-semibold leading-snug text-landing-accent-soft shadow-lg backdrop-blur-sm">
            Caps &amp; profit targets
          </span>
        </div>
      </div>
    </div>
  );
}
