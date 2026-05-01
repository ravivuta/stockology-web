import { Sparkles } from "lucide-react";
import { TransitionLink } from "@/components/TransitionLink";

export function AuthBrandMark() {
  return (
    <TransitionLink
      href="/"
      prefetch={false}
      className="mb-8 inline-flex items-center gap-2.5 no-underline transition-opacity hover:opacity-90"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-cyan-500/10 ring-1 ring-white/10">
        <Sparkles className="h-5 w-5 text-emerald-300" aria-hidden />
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-white">
        Stocks{" "}
        <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">PM</span>
      </span>
    </TransitionLink>
  );
}
