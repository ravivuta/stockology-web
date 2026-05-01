import { TransitionLink } from "@/components/TransitionLink";
import { AppLogo } from "@/components/AppLogo";

export function AuthBrandMark() {
  return (
    <TransitionLink
      href="/"
      prefetch={false}
      className="mb-8 inline-flex items-center gap-2.5 no-underline transition-opacity hover:opacity-90"
    >
      <AppLogo size={40} className="ring-1 ring-white/10" />
      <span className="text-[17px] font-semibold tracking-tight text-white">
        Stocks PM
      </span>
    </TransitionLink>
  );
}
