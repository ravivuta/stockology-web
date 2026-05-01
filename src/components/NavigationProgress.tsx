"use client";

import { usePathname } from "next/navigation";

/**
 * Thin top bar — sweep replays whenever `pathname` changes (including first client segment).
 */
export function NavigationProgress() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden" aria-hidden>
      <div
        key={pathname}
        className="nav-progress-sweep h-full w-full origin-left bg-gradient-to-r from-primary via-primary-light to-primary"
      />
    </div>
  );
}
