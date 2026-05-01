import type { ReactNode } from "react";

export function AuthPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/[0.09] bg-zinc-950/70 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_32px_96px_-32px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-9">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-400/45 to-transparent"
        aria-hidden
      />
      <div className="pt-1">{children}</div>
    </div>
  );
}
