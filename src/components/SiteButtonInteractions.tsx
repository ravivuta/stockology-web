"use client";

import { useEffect } from "react";

const RIPPLE_HOST_SELECTOR =
  "button:not(.no-ui-hover), a[href].ui-hover-pop, a[href].ui-hover-spotlight, a[href].ui-hover-surface, button.ui-hover-surface:not(.no-ui-hover)";

function isRippleHost(el: HTMLElement): boolean {
  if (!el.matches(RIPPLE_HOST_SELECTOR)) return false;
  if (el instanceof HTMLButtonElement) {
    return !el.disabled;
  }
  if (el instanceof HTMLAnchorElement) {
    return el.getAttribute("aria-disabled") !== "true";
  }
  return false;
}

/**
 * Pointer-origin ripple for primary interactive surfaces (see `globals.css` `.ui-ripple-playing`).
 * Delegation keeps behavior consistent without wrapping every control.
 */
export function SiteButtonInteractions() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>(RIPPLE_HOST_SELECTOR);
      if (!el || !isRippleHost(el)) return;
      if (!el.closest(".app-interactive-ui")) return;

      const rect = el.getBoundingClientRect();
      el.style.setProperty("--ripple-x", `${e.clientX - rect.left}px`);
      el.style.setProperty("--ripple-y", `${e.clientY - rect.top}px`);
      el.classList.remove("ui-ripple-playing");
      void el.offsetWidth;
      el.classList.add("ui-ripple-playing");

      const onAnimEnd = (ev: AnimationEvent) => {
        const names = ev.animationName.split(",").map((n) => n.trim());
        if (!names.includes("ui-btn-ripple")) return;
        el.classList.remove("ui-ripple-playing");
        el.removeEventListener("animationend", onAnimEnd);
      };
      el.addEventListener("animationend", onAnimEnd);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}
