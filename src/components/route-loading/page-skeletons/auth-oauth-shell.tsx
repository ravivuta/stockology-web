"use client";

import { routeBusy } from "@/components/route-loading/page-skeletons/_common";
import { AuthUiSkeleton } from "@/components/route-loading/SkeletonPrimitives";

type AuthSkeletonFooter = "login" | "signup" | "neutral";

/**
 * Matches `(auth)/layout.tsx` max-w-[420px] + `AuthBrandMark` + `AuthPanel` + single Google OAuth row
 * (`GoogleOAuthButton` ~52px, white bar) — not two stacked generic buttons.
 */
function AuthOAuthPageSkeleton({ footer }: { footer: AuthSkeletonFooter }) {
  return (
    <div className="w-full space-y-6" {...routeBusy}>
      <div className="mb-8 flex items-center gap-2.5">
        <AuthUiSkeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <AuthUiSkeleton className="h-5 w-36 rounded-md" />
      </div>

      <div className="relative rounded-2xl border border-white/[0.09] bg-zinc-950/70 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_32px_96px_-32px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-9">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-400/45 to-transparent"
          aria-hidden
        />
        <div className="space-y-0 pt-1">
          <AuthUiSkeleton className="h-3 w-28 rounded-md" />
          <AuthUiSkeleton className="mt-3 h-8 w-[min(100%,15rem)] rounded-lg" />
          <AuthUiSkeleton className="mt-3 h-3 w-full rounded-md" />
          <AuthUiSkeleton className="mt-2 h-3 w-full rounded-md" />
          <AuthUiSkeleton className="mt-2 h-3 w-[90%] rounded-md" />

          <div className="mt-8">
            <AuthUiSkeleton className="h-[52px] w-full rounded-xl" />
          </div>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
            <AuthUiSkeleton className="mt-0.5 h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-2">
              <AuthUiSkeleton className="h-3 w-full rounded-md" />
              <AuthUiSkeleton className="h-3 w-[94%] rounded-md" />
            </div>
          </div>

          <div className="mt-8 border-t border-white/[0.08] pt-6">
            {footer === "login" && (
              <>
                <AuthUiSkeleton className="mx-auto h-4 w-56 rounded-md" />
                <AuthUiSkeleton className="mx-auto mt-3 h-4 w-36 rounded-md" />
              </>
            )}
            {footer === "signup" && <AuthUiSkeleton className="mx-auto h-4 w-64 rounded-md" />}
            {footer === "neutral" && <AuthUiSkeleton className="mx-auto h-4 w-52 rounded-md" />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLoginPageSkeleton() {
  return <AuthOAuthPageSkeleton footer="login" />;
}

export function AuthSignupPageSkeleton() {
  return <AuthOAuthPageSkeleton footer="signup" />;
}

/** `(auth)/loading.tsx` — between login/signup; no footer-specific copy. */
export function AuthRouteLoadingSkeleton() {
  return <AuthOAuthPageSkeleton footer="neutral" />;
}
