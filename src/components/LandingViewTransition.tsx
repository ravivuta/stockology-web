"use client";

/**
 * Full-screen veil when navigating between marketing/auth shell (`/`, `/login`, `/signup`)
 * and the rest of the app — or between any route and those pages. Clicking internal
 * links is intercepted; use `useShellRouteTransition().replaceWithTransition` for
 * programmatic redirects (e.g. session already present on login).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { normalizeAppPathname } from "@/lib/base-path";

const VEIL_BG = "rgba(9, 9, 11, 0.82)";
const UNCOVER_MS = 420;
const FAILSAFE_MS = 5500;

function normalizePathname(path: string): string {
  const base = normalizeAppPathname(path.split("?")[0].split("#")[0]);
  let p = base;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function isShellRoute(path: string): boolean {
  const p = normalizePathname(path);
  return p === "/" || p === "/login" || p === "/signup";
}

function needsShellTransition(fromPath: string, toPath: string): boolean {
  const a = normalizePathname(fromPath);
  const b = normalizePathname(toPath);
  if (a === b) return false;
  return isShellRoute(a) || isShellRoute(b);
}

type ShellRouteTransitionContextValue = {
  pushWithTransition: (href: string) => void;
  replaceWithTransition: (href: string) => void;
};

const ShellRouteTransitionContext = createContext<ShellRouteTransitionContextValue | null>(null);

export function useShellRouteTransition(): ShellRouteTransitionContextValue {
  const router = useRouter();
  const ctx = useContext(ShellRouteTransitionContext);
  return useMemo(() => {
    if (ctx) return ctx;
    return {
      pushWithTransition: (href: string) => router.push(href),
      replaceWithTransition: (href: string) => router.replace(href),
    };
  }, [ctx, router]);
}

export function LandingViewTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "cover" | "uncover">("idle");

  const busyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const pathBeforeRef = useRef<string>(pathname);
  const hideTimerRef = useRef<number | null>(null);
  const failSafeRef = useRef<number | null>(null);

  const clearFailSafe = useCallback(() => {
    if (failSafeRef.current != null) {
      window.clearTimeout(failSafeRef.current);
      failSafeRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hardReset = useCallback(() => {
    clearFailSafe();
    clearHideTimer();
    busyRef.current = false;
    pendingRef.current = null;
    setPhase("idle");
  }, [clearFailSafe, clearHideTimer]);

  const beginUncover = useCallback(() => {
    clearFailSafe();
    pendingRef.current = null;
    busyRef.current = false;
    setPhase("uncover");
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setPhase("idle");
    }, UNCOVER_MS + 50);
  }, [clearFailSafe, clearHideTimer]);

  const startTransition = useCallback(
    (href: string, method: "push" | "replace") => {
      if (typeof window === "undefined") return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (method === "replace") router.replace(href);
        else router.push(href);
        return;
      }

      if (busyRef.current) return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const from = normalizePathname(window.location.pathname);
      const toPath = normalizePathname(url.pathname);
      const nextFull = `${url.pathname}${url.search}${url.hash}`;
      const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextFull === currentFull) return;

      if (!needsShellTransition(from, toPath)) {
        if (method === "replace") router.replace(nextFull);
        else router.push(nextFull);
        return;
      }

      busyRef.current = true;
      pathBeforeRef.current = from;
      pendingRef.current = nextFull;
      setPhase("cover");

      clearFailSafe();
      failSafeRef.current = window.setTimeout(() => {
        failSafeRef.current = null;
        hardReset();
      }, FAILSAFE_MS);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (method === "replace") router.replace(nextFull);
          else router.push(nextFull);
        });
      });
    },
    [router, clearFailSafe, hardReset]
  );

  useEffect(() => {
    if (phase !== "cover" || !pendingRef.current) return;
    const before = normalizePathname(pathBeforeRef.current);
    const now = normalizePathname(pathname);
    if (now === before) return;
    beginUncover();
  }, [phase, pathname, beginUncover]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.type !== "click" || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const el = e.target;
      if (!(el instanceof Element)) return;
      const a = el.closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.getAttribute("rel")?.includes("external")) return;
      if (a.closest("[data-no-shell-transition]")) return;

      const raw = a.getAttribute("href");
      if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return;

      let url: URL;
      try {
        url = new URL(raw, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const from = normalizePathname(window.location.pathname);
      if (!needsShellTransition(from, url.pathname)) return;

      const nextFull = `${url.pathname}${url.search}${url.hash}`;
      const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextFull === currentFull) return;

      e.preventDefault();
      startTransition(nextFull, "push");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [startTransition]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      clearFailSafe();
    };
  }, [clearHideTimer, clearFailSafe]);

  const contextValue = useMemo(
    () => ({
      pushWithTransition: (href: string) => startTransition(href, "push"),
      replaceWithTransition: (href: string) => startTransition(href, "replace"),
    }),
    [startTransition]
  );

  const showLayer = phase !== "idle";
  const layerOpacity = phase === "uncover" ? 0 : 1;

  return (
    <ShellRouteTransitionContext.Provider value={contextValue}>
      {children}
      {showLayer && (
        <div
          className="fixed inset-0 z-[9998] motion-reduce:hidden"
          style={{
            backgroundColor: VEIL_BG,
            opacity: layerOpacity,
            pointerEvents: phase === "cover" ? "auto" : "none",
            transform: "translateZ(0)",
            contain: "strict",
            transition:
              phase === "uncover"
                ? `opacity ${UNCOVER_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                : "opacity 160ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: phase === "uncover" ? "opacity" : undefined,
          }}
          aria-hidden
        />
      )}
    </ShellRouteTransitionContext.Provider>
  );
}
