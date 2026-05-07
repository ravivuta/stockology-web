import { AppLogo } from "@/components/AppLogo";

export function TopBrandBadge() {
  return (
    <div className="pointer-events-none fixed left-1/2 top-[max(10px,env(safe-area-inset-top))] z-[140] hidden -translate-x-1/2 md:block">
      <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background/88 px-3 py-1.5 shadow-[var(--theme-shadow-card)] backdrop-blur-md dark:border-white/[0.08]">
        <AppLogo size={24} rounded="rounded-full" />
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground">Stocks PM</span>
      </div>
    </div>
  );
}
