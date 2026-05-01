"use client";

import { useRef, useCallback, useEffect, useState, type ComponentType } from "react";
import { APP_RAIL_PX } from "@/lib/app-shell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, PieChart, ListOrdered, Newspaper, Settings, HelpCircle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearPortfolioClientState } from "@/lib/clear-portfolio-client-state";
import { useShellRouteTransition } from "@/components/LandingViewTransition";

/** Primary tabs — aligned with iOS `HomeView` Dashboard + Portfolio plus Watchlist & News on web. */
const primaryNav: { href: string; label: string; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/watchlist", label: "Watchlist", icon: ListOrdered },
  { href: "/news", label: "News", icon: Newspaper },
];

const bottomNav: { href: string; label: string; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

const COLLAPSE_DELAY_MS = 100;

export type SidebarProps = {
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  userDisplayName: string;
  userEmail: string;
  planLabel: string;
  planVariant: "free" | "trial" | "pro" | "max";
};

export default function Sidebar({
  isExpanded,
  onExpand,
  onCollapse,
  userDisplayName,
  userEmail,
  planLabel,
  planVariant,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { replaceWithTransition } = useShellRouteTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverExpandOk, setHoverExpandOk] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setHoverExpandOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!hoverExpandOk) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onExpand();
  }, [hoverExpandOk, onExpand]);

  const handleMouseLeave = useCallback(() => {
    if (!hoverExpandOk) return;
    timeoutRef.current = setTimeout(onCollapse, COLLAPSE_DELAY_MS);
  }, [hoverExpandOk, onCollapse]);

  const planClass =
    planVariant === "pro"
      ? "bg-primary/15 text-primary ring-1 ring-primary/25"
      : planVariant === "max"
        ? "bg-muted text-foreground ring-1 ring-border"
        : planVariant === "trial"
          ? "bg-primary/10 text-primary"
          : "bg-muted/80 text-subtle";

  function NavRows(items: typeof primaryNav) {
    return items.map(({ href, label, icon: Icon }) => {
      const active = pathname === href;
      return (
        <Link
            key={href}
            href={href}
            prefetch
            title={label}
            className="no-ui-hover flex w-full min-w-0 items-center py-3 group"
            onMouseEnter={(e) => {
              const inner = e.currentTarget.firstElementChild as HTMLElement;
              if (inner) inner.style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
              const inner = e.currentTarget.firstElementChild as HTMLElement;
              if (inner) inner.style.transform = "scale(1)";
            }}
          >
            <div
              className={`
                  flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium
                  ${isExpanded ? "min-w-0 flex-1" : "w-11 flex-none"}
                  ${
                    active
                      ? "bg-primary/12 text-foreground shadow-sm ring-1 ring-primary/20"
                      : "text-subtle group-hover:bg-muted group-hover:text-foreground"
                  }
                `}
              style={{
                transition:
                  "transform 480ms cubic-bezier(0.25, 0.1, 0.25, 1), background-color 220ms ease, color 220ms ease, box-shadow 220ms ease",
              }}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span
                className="overflow-hidden whitespace-nowrap transition-opacity duration-300"
                style={{
                  opacity: isExpanded ? 1 : 0,
                  width: isExpanded ? "auto" : 0,
                }}
              >
                {label}
              </span>
            </div>
          </Link>
      );
    });
  }

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-[100dvh] flex-col overflow-hidden border-r border-border bg-surface pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      style={{
        width: isExpanded ? 220 : APP_RAIL_PX,
        transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-shrink-0 items-center gap-3 overflow-hidden pl-4 pr-3 pb-4 pt-4">
        <Link
            href="/dashboard"
            prefetch
            className="no-ui-hover flex min-w-0 items-center gap-3"
            style={{ transition: "transform 500ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              S
            </div>
            <span
              className="whitespace-nowrap text-lg font-semibold text-foreground transition-all duration-300"
              style={{
                opacity: isExpanded ? 1 : 0,
                maxWidth: isExpanded ? 200 : 0,
                overflow: "hidden",
              }}
            >
              Stocks PM
            </span>
          </Link>
      </div>

      <nav className="flex min-h-0 flex-col space-y-1 overflow-y-auto overflow-x-hidden px-3">{NavRows(primaryNav)}</nav>

      <div className="flex-1 min-h-0" />

      <div className="flex-shrink-0 border-t border-border px-3 pt-2 pb-1">
        <nav className="flex flex-col space-y-1">{NavRows(bottomNav)}</nav>
      </div>

      <div className="flex-shrink-0 border-t border-border py-4 pl-[18px] pr-3">
        <div className="mb-3 flex min-w-0 items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-foreground">
            {(userDisplayName || userEmail || "U")[0].toUpperCase()}
          </div>
          <div
            className="min-w-0 flex-1 transition-opacity duration-300"
            style={{
              opacity: isExpanded ? 1 : 0,
              width: isExpanded ? "auto" : 0,
              overflow: "hidden",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{userDisplayName || "User"}</p>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs ${planClass}`}>{planLabel}</span>
            </div>
            <p className="truncate text-xs text-subtle opacity-90">{userEmail}</p>
          </div>
        </div>
        <button
            type="button"
            onClick={() => {
              void (async () => {
                const supabase = createClient();
                const { error } = await supabase.auth.signOut();
                if (!error) clearPortfolioClientState();
                router.refresh();
                replaceWithTransition("/");
              })();
            }}
            className="ui-hover-text flex min-w-0 cursor-pointer items-center gap-2 rounded-lg py-2 pl-[7px] pr-3 text-sm text-subtle hover:text-error"
            style={{
              transition: "transform 500ms cubic-bezier(0.25, 0.1, 0.25, 1), color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span
              className="overflow-hidden whitespace-nowrap transition-opacity duration-300"
              style={{
                opacity: isExpanded ? 1 : 0,
                width: isExpanded ? "auto" : 0,
              }}
            >
              Sign out
            </span>
          </button>
      </div>
    </aside>
  );
}
