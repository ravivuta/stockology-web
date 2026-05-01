/**
 * Full-viewport marketing backdrop: depth gradient, soft accent blooms, faint
 * structure grid, and micro-noise. Static and pointer-events none — supports
 * hero LineWaves and cards without competing for attention.
 */
export function LandingAmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Base depth — cool zinc, not flat black */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            168deg,
            #161a22 0%,
            #12151c 18%,
            #0f1218 42%,
            #0c0f15 68%,
            #0a0c12 100%
          )`,
        }}
      />

      {/* Restrained accent fields (portfolio / growth metaphor without literal charts) */}
      <div className="absolute -left-[18%] -top-[8%] h-[min(58vmin,520px)] w-[min(58vmin,520px)] rounded-full bg-emerald-500/[0.055] blur-[min(28vw,140px)]" />
      <div className="absolute -right-[12%] top-[8%] h-[min(48vmin,440px)] w-[min(48vmin,440px)] rounded-full bg-teal-500/[0.04] blur-[min(26vw,130px)]" />
      <div className="absolute bottom-[-22%] left-1/2 h-[min(42vmin,380px)] w-[min(95vw,900px)] -translate-x-1/2 rounded-full bg-cyan-600/[0.035] blur-[min(32vw,160px)]" />
      <div className="absolute bottom-[5%] right-[-8%] h-[min(36vmin,320px)] w-[min(36vmin,320px)] rounded-full bg-violet-600/[0.025] blur-[min(24vw,120px)]" />

      {/* Soft top spotlight — draws eye to hero without a hard shape */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 95% 70% at 50% -8%, rgba(74, 222, 128, 0.075), transparent 58%)",
        }}
      />

      {/* Structural grid — very low contrast; fades at edges so it never feels busy */}
      <div
        className="absolute inset-0 opacity-100"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          backgroundPosition: "center top",
          maskImage: "radial-gradient(ellipse 88% 75% at 50% 28%, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 88% 75% at 50% 28%, black 0%, transparent 70%)",
        }}
      />

      {/* Subtle film grain — breaks banding on large gradients */}
      <div
        className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* Edge vignette — frames content like a lens */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: "inset 0 0 min(100px, 12vw) min(32px, 4vw) rgba(6, 8, 12, 0.32)",
        }}
      />
    </div>
  );
}
